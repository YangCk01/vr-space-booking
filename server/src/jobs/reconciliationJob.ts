import cron from 'node-cron'
import { format, subDays } from 'date-fns'
import { prisma } from '../utils/prisma'
import { runMatchingEngine } from '../services/reconEngine'
import { fetchWechatBill, fetchAlipayBill } from '../services/channelBillService'
import { fetchBankStatement } from '../services/bankStatementService'
import { fetchDeviceLogs } from '../services/deviceLogService'
import { sendReconAlert } from '../services/notificationService'

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
export async function executeReconciliation(dateStr: string) {
  console.log(`[ReconJob] 开始对账: ${dateStr}`)

  // 幂等性：检查是否已存在成功批次
  const existing = await prisma.reconBatch.findUnique({
    where: { reconDate: dateStr },
  })
  if (existing && existing.status === 'SUCCESS') {
    console.log(`[ReconJob] ${dateStr} 已成功对账，跳过`)
    return existing
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
        status: { in: ['PAID', 'COMPLETED', 'REFUNDED'] },
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

    // ========== 4. 更新批次状态 ==========
    await prisma.reconBatch.update({
      where: { id: batch.id },
      data: {
        status: 'SUCCESS',
        bizTotalCount: bizOrders + bizRecharges,
        channelTotalCount,
        bankTotalCount,
        matchedCount: engineResult.matchedCount,
        exceptionCount: engineResult.exceptionCount,
        matchedAmount: engineResult.matchedAmount,
        exceptionAmount: engineResult.exceptionAmount,
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

    console.log(`[ReconJob] ${dateStr} 对账完成: 匹配${engineResult.matchedCount}笔, 异常${engineResult.exceptionCount}笔`)

    // 推送告警通知（异步，不阻塞主流程）
    sendReconAlert({
      reconDate: dateStr,
      exceptionCount: engineResult.exceptionCount,
      matchedCount: engineResult.matchedCount,
      exceptionTypes: {}, // TODO: 按类型统计
    }).catch((err) => console.error('[ReconJob] 告警推送失败:', err))

    return batch
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
 * 手动触发对账（管理员）
 */
export async function runManualRecon(dateStr: string) {
  return executeReconciliation(dateStr)
}
