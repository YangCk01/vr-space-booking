import cron from 'node-cron'
import { format, subDays } from 'date-fns'
import { OrderStatus } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { runMatchingEngine } from '../services/reconEngine'
import { fetchWechatBill, fetchAlipayBill } from '../services/channelBillService'
import { fetchBankStatement } from '../services/bankStatementService'
import { fetchDeviceLogs } from '../services/deviceLogService'
import { sendReconAlert } from '../services/notificationService'
import { pushAdminNotification } from '../controllers/notificationController'
import { summarizePendingReconExceptions } from '../services/reconExceptionState'

/**
 * 告警阈值（后续从 SystemConfig 读取）
 */
const DEFAULT_THRESHOLDS = {
  absoluteAmount: 100 * 100, // ¥100 = 10000 分
  relativeRate: 0.01,        // 1%
}

const PAID_LIKE_ORDER_STATUSES: OrderStatus[] = ['PAID', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'NO_SHOW']

async function getThresholds() {
  try {
    const [enabledConfig, lowerAbsConfig, absConfig, relConfig] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: 'recon_alert_enabled' } }),
      prisma.systemConfig.findUnique({ where: { key: 'recon_alert_amount_threshold' } }),
      prisma.systemConfig.findUnique({ where: { key: 'RECON_ALERT_ABSOLUTE_AMOUNT' } }),
      prisma.systemConfig.findUnique({ where: { key: 'RECON_ALERT_RELATIVE_RATE' } }),
    ])
    return {
      enabled: enabledConfig ? enabledConfig.value === 'true' || enabledConfig.value === '1' : true,
      absoluteAmount: lowerAbsConfig
        ? parseInt(lowerAbsConfig.value, 10)
        : absConfig
          ? parseInt(absConfig.value, 10)
          : DEFAULT_THRESHOLDS.absoluteAmount,
      relativeRate: relConfig ? parseFloat(relConfig.value) : DEFAULT_THRESHOLDS.relativeRate,
    }
  } catch {
    return { enabled: true, ...DEFAULT_THRESHOLDS }
  }
}

/**
 * 每日凌晨 02:00 自动对账任务
 * Phase 1.5: 已实现系统内部数据交叉核对
 * 待接入真实支付渠道后，追加渠道账/银行账核对
 */
export function startReconJob() {
  cron.schedule('0 2 * * *', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    await executeReconciliation(yesterday)
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[ReconJob] 对账定时任务已启动 (每日 02:00)')
}

/**
 * 执行对账（可被定时任务或手动触发复用）
 */
export async function executeReconciliation(dateStr: string, options: { force?: boolean } = {}) {
  console.log(`[ReconJob] 开始对账: ${dateStr}`)

  // 幂等性：检查是否已存在成功批次
  const existing = await prisma.reconBatch.findUnique({
    where: { reconDate: dateStr },
  })
  if (existing && existing.status === 'SUCCESS' && !options.force) {
    console.log(`[ReconJob] ${dateStr} 已成功对账，跳过`)
    return { ...existing, skipped: true }
  }

  // 如果有失败/进行中的批次，复用或新建
  let batch = existing
  if (!batch) {
    batch = await prisma.reconBatch.create({
      data: {
        reconDate: dateStr,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    })
  } else {
    if (options.force) {
      await prisma.reconException.deleteMany({
        where: {
          batchId: batch.id,
          exceptionStatus: 'PENDING',
        },
      })
    }
    await prisma.reconBatch.update({
      where: { id: batch.id },
      data: { status: 'RUNNING', startedAt: new Date(), errorMessage: null },
    })
  }

  try {
    // ========== 1. 统计业务系统账 ==========
    const [y, m, d] = dateStr.split('-').map(Number)
    const dateGte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
    const dateLte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))

    const bizOrders = await prisma.order.count({
      where: {
        paidAt: { gte: dateGte, lte: dateLte },
        status: { in: PAID_LIKE_ORDER_STATUSES },
      },
    })
    const bizRecharges = await prisma.rechargeRecord.count({
      where: {
        paidAt: { gte: dateGte, lte: dateLte },
        status: 'PAID',
      },
    })

    // ========== 2. 执行内部对账引擎 ==========
    const engineResult = await runMatchingEngine(batch.id, dateStr)

    // ========== 3. 拉取渠道账单（Phase 2 预留）==========
    const wechatBills = await fetchWechatBill(dateStr)
    const alipayBills = await fetchAlipayBill(dateStr)
    const channelTotalCount = wechatBills.length + alipayBills.length

    // ========== 4. 拉取银行流水（Phase 3 预留）==========
    const bankStatements = await fetchBankStatement(dateStr)
    const bankTotalCount = bankStatements.length

    // ========== 5. 拉取头显日志（Phase 4 预留）==========
    // TODO: 遍历所有门店拉取设备日志
    // const venues = await prisma.venue.findMany({ select: { id: true } })
    // for (const venue of venues) {
    //   await fetchDeviceLogs(venue.id, dateStr)
    // }

    // ========== 6. 差异阈值告警检查 ==========
    await checkReconcileAlerts(dateStr, dateGte, dateLte)

    const pendingSummary = await summarizePendingReconExceptions(batch.id)

    // ========== 7. 更新批次状态 ==========
    const updatedBatch = await prisma.reconBatch.update({
      where: { id: batch.id },
      data: {
        status: 'SUCCESS',
        bizTotalCount: bizOrders + bizRecharges,
        channelTotalCount,
        bankTotalCount,
        matchedCount: engineResult.matchedCount,
        exceptionCount: pendingSummary.count,
        matchedAmount: engineResult.matchedAmount,
        exceptionAmount: pendingSummary.amount,
        // 各维度明细
        orderPayMatchedCount: engineResult.orderPayMatched,
        orderPayExceptionCount: engineResult.orderPayExceptions,
        orderTxMatchedCount: engineResult.orderTxMatched,
        orderTxExceptionCount: engineResult.orderTxExceptions,
        rechargeMatchedCount: engineResult.rechargeMatched,
        rechargeExceptionCount: engineResult.rechargeExceptions,
        refundMatchedCount: engineResult.refundMatched,
        refundExceptionCount: engineResult.refundExceptions,
        completedAt: new Date(),
      },
    })

    console.log(`[ReconJob] ${dateStr} 对账完成: 匹配${engineResult.matchedCount}笔, 待处理异常${pendingSummary.count}笔`)

    // 推送告警通知（异步，不阻塞主流程）
    if (pendingSummary.count > 0) {
      sendReconAlert({
        reconDate: dateStr,
        exceptionCount: pendingSummary.count,
        matchedCount: engineResult.matchedCount,
        exceptionTypes: {}, // TODO: 按类型统计
      }).catch((err) => console.error('[ReconJob] 告警推送失败:', err))
    }

    return updatedBatch
  } catch (err) {
    console.error(`[ReconJob] ${dateStr} 对账失败:`, err)
    await prisma.reconBatch.update({
      where: { id: batch.id },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      },
    })
    throw err
  }
}

/**
 * 检查对账差异并触发告警
 */
async function checkReconcileAlerts(dateStr: string, dateGte: Date, dateLte: Date) {
  const thresholds = await getThresholds()
  if (!thresholds.enabled) {
    console.log(`[ReconJob] ${dateStr} 对账告警已关闭，跳过通知阈值检查`)
    return
  }
  const alerts: string[] = []

  // 1. 余额恒等式（总对账）
  const [users, txSum] = await Promise.all([
    prisma.user.findMany({
      select: { principalBalance: true, bonusBalance: true, points: true },
    }),
    prisma.balanceTransaction.aggregate({
      _sum: { principalAmount: true, bonusAmount: true, pointsAmount: true },
    }),
  ])

  const totalPrincipal = users.reduce((s, u) => s + u.principalBalance, 0)
  const totalBonus = users.reduce((s, u) => s + u.bonusBalance, 0)
  const totalPoints = users.reduce((s, u) => s + u.points, 0)
  const expectedPrincipal = txSum._sum?.principalAmount || 0
  const expectedBonus = txSum._sum?.bonusAmount || 0
  const expectedPoints = txSum._sum?.pointsAmount || 0

  const principalDiff = totalPrincipal - expectedPrincipal
  const bonusDiff = totalBonus - expectedBonus
  const pointsDiff = totalPoints - expectedPoints

  if (principalDiff !== 0) alerts.push(`本金余额差异: ${principalDiff} 分`)
  if (bonusDiff !== 0) alerts.push(`赠送余额差异: ${bonusDiff} 分`)
  if (pointsDiff !== 0) alerts.push(`积分余额差异: ${pointsDiff} 分`)

  // 2. 充值对账
  const rechargeSum = await prisma.rechargeRecord.aggregate({
    where: { status: 'PAID', paidAt: { gte: dateGte, lte: dateLte } },
    _sum: { amount: true, bonus: true },
  })
  const txRechargeSum = await prisma.balanceTransaction.aggregate({
    where: { type: 'RECHARGE', createdAt: { gte: dateGte, lte: dateLte } },
    _sum: { principalAmount: true, bonusAmount: true },
  })
  const rechargePrincipalDiff = (rechargeSum._sum?.amount || 0) - (txRechargeSum._sum?.principalAmount || 0)
  const rechargeBonusDiff = (rechargeSum._sum?.bonus || 0) - (txRechargeSum._sum?.bonusAmount || 0)
  checkDimensionAlert(alerts, '充值本金', rechargePrincipalDiff, txRechargeSum._sum?.principalAmount || 0, thresholds)
  checkDimensionAlert(alerts, '充值赠送', rechargeBonusDiff, txRechargeSum._sum?.bonusAmount || 0, thresholds)

  // 3. 在线支付对账
  const paymentSum = await prisma.payment.aggregate({
    where: { status: 'SUCCESS', method: { in: ['WECHAT', 'ALIPAY'] }, createdAt: { gte: dateGte, lte: dateLte } },
    _sum: { amount: true },
  })
  const orderOnlineSum = await prisma.order.aggregate({
    where: {
      status: { in: PAID_LIKE_ORDER_STATUSES },
      payMethod: { in: ['WECHAT', 'ALIPAY'] },
      paidAt: { gte: dateGte, lte: dateLte },
    },
    _sum: { amount: true },
  })
  const onlinePayDiff = (paymentSum._sum?.amount || 0) - (orderOnlineSum._sum?.amount || 0)
  checkDimensionAlert(alerts, '在线支付金额', onlinePayDiff, orderOnlineSum._sum?.amount || 0, thresholds)

  // 4. 消费对账
  const orderConsumeSum = await prisma.order.aggregate({
    where: {
      status: { in: PAID_LIKE_ORDER_STATUSES },
      paidAt: { gte: dateGte, lte: dateLte },
    },
    _sum: { principalDeduction: true, bonusDeduction: true },
  })
  const txDeductSum = await prisma.balanceTransaction.aggregate({
    where: { type: 'DEDUCT', createdAt: { gte: dateGte, lte: dateLte } },
    _sum: { principalAmount: true, bonusAmount: true },
  })
  const consumePrincipalDiff = (orderConsumeSum._sum?.principalDeduction || 0) - Math.abs(txDeductSum._sum?.principalAmount || 0)
  const consumeBonusDiff = (orderConsumeSum._sum?.bonusDeduction || 0) - Math.abs(txDeductSum._sum?.bonusAmount || 0)
  checkDimensionAlert(alerts, '消费本金', consumePrincipalDiff, Math.abs(txDeductSum._sum?.principalAmount || 0), thresholds)
  checkDimensionAlert(alerts, '消费赠送', consumeBonusDiff, Math.abs(txDeductSum._sum?.bonusAmount || 0), thresholds)

  // 5. 退款对账
  const txRefundSum = await prisma.balanceTransaction.aggregate({
    where: { type: 'REFUND', createdAt: { gte: dateGte, lte: dateLte } },
    _sum: { totalAmount: true },
  })
  const refundTxOrders = await prisma.balanceTransaction.findMany({
    where: {
      type: 'REFUND',
      createdAt: { gte: dateGte, lte: dateLte },
      orderId: { not: null },
    },
    select: { orderId: true },
  })
  const refundOrderIds = refundTxOrders.map((tx) => tx.orderId).filter(Boolean) as string[]
  const refundOrders = await prisma.order.findMany({
    where: {
      status: { in: ['REFUNDED', 'CANCELLED'] },
      OR: [
        { updatedAt: { gte: dateGte, lte: dateLte } },
        ...(refundOrderIds.length ? [{ id: { in: refundOrderIds } }] : []),
      ],
    },
    select: { id: true, refundAmount: true },
  })
  const orderRefundTotal = Array.from(new Map(refundOrders.map((order) => [order.id, order.refundAmount || 0])).values())
    .reduce((sum, amount) => sum + amount, 0)
  const refundDiff = (txRefundSum._sum?.totalAmount || 0) - orderRefundTotal
  checkDimensionAlert(alerts, '退款总额', refundDiff, orderRefundTotal, thresholds)

  // 6. 积分对账（兑换消耗）
  const txPointsExchangeDeductSum = await prisma.balanceTransaction.aggregate({
    where: {
      type: 'POINTS_DEDUCT',
      orderId: null,
      createdAt: { gte: dateGte, lte: dateLte },
    },
    _sum: { pointsAmount: true },
  })
  const exchangePointsSum = await prisma.pointsExchange.aggregate({
    where: { createdAt: { gte: dateGte, lte: dateLte } },
    _sum: { pointsCost: true },
  })
  const orderPointsSum = await prisma.pointsOrder.aggregate({
    where: { status: { not: 'CANCELLED' }, createdAt: { gte: dateGte, lte: dateLte } },
    _sum: { pointsCost: true },
  })
  const exchangeTotal = (exchangePointsSum._sum?.pointsCost || 0) + (orderPointsSum._sum?.pointsCost || 0)
  const txExchangeDeductTotal = Math.abs(txPointsExchangeDeductSum._sum?.pointsAmount || 0)
  const pointsExchangeDiff = exchangeTotal - txExchangeDeductTotal
  checkDimensionAlert(alerts, '积分兑换消耗', pointsExchangeDiff, txExchangeDeductTotal, thresholds)

  if (alerts.length > 0) {
    console.log(`[ReconJob] ${dateStr} 触发对账异常告警:`, alerts)
    await sendReconNotifications(dateStr, alerts)
  }
}

function checkDimensionAlert(
  alerts: string[],
  name: string,
  diff: number,
  expected: number,
  thresholds: { absoluteAmount: number; relativeRate: number; enabled?: boolean }
) {
  if (diff === 0) return
  // 必告警：余额维度 diff ≠ 0（已在前面处理）
  // 任一维度差异绝对值 > 阈值
  if (Math.abs(diff) > thresholds.absoluteAmount) {
    alerts.push(`${name}差异绝对值超限: ${diff} 分 (阈值: ${thresholds.absoluteAmount} 分)`)
    return
  }
  // 任一维度差异 > expected 的 1%
  if (expected > 0 && Math.abs(diff) > expected * thresholds.relativeRate) {
    alerts.push(`${name}差异比例超限: ${diff} 分 / expected=${expected} 分`)
  }
}

async function sendReconNotifications(dateStr: string, alerts: string[]) {
  try {
    const title = `【对账异常告警】${dateStr}`
    const content = `日期 ${dateStr} 对账发现以下异常，请关注：\n${alerts.join('\n')}`

    await pushAdminNotification(
      'RECON_ALERT',
      title,
      content,
      'SYSTEM'
    )
  } catch (err) {
    console.error('[ReconJob] 创建对账告警通知失败:', err)
  }
}

/**
 * 手动触发对账（管理员）
 */
export async function runManualRecon(dateStr: string, options: { force?: boolean } = {}) {
  return executeReconciliation(dateStr, options)
}
