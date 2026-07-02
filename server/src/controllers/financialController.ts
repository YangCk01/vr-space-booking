import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { startOfDay, endOfDay, subDays, format } from 'date-fns'
import { logAudit } from '../middleware/auditLog'

const DAILY_STATUS = {
  DRAFT: 'DRAFT',
  GENERATED: 'GENERATED',
  HAS_EXCEPTION: 'HAS_EXCEPTION',
  READY_TO_CONFIRM: 'READY_TO_CONFIRM',
  LOCKED: 'LOCKED',
  REOPENED: 'REOPENED',
}

function currentUser(req: AuthenticatedRequest) {
  return {
    id: req.user?.id || 'system',
    name: req.user?.name || req.user?.phone || '系统',
    role: req.user?.role || 'SYSTEM',
  }
}

function adjustmentNo(prefix = 'ADJ') {
  const d = new Date()
  const stamp = format(d, 'yyyyMMddHHmmss')
  return `${prefix}${stamp}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function cryptoRandomId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function noShowRetainedIncome(order: { amount: number; refundAmount?: number | null; penaltyAmount?: number | null }): number {
  if (order.penaltyAmount != null) return Math.max(0, order.penaltyAmount)
  const refunded = order.refundAmount || 0
  return Math.max(0, order.amount - refunded)
}

async function countPendingReconExceptions(date: string) {
  return prisma.reconException.count({
    where: {
      exceptionStatus: 'PENDING',
      batch: { reconDate: date },
    },
  })
}

async function getReportMeta(date: string) {
  const rows = await prisma.$queryRaw<Array<{
    status: string
    generatedAt: Date | null
    generatedById: string | null
    generatedByName: string | null
    confirmedAt: Date | null
    confirmedById: string | null
    confirmedByName: string | null
    lockedAt: Date | null
    reopenedAt: Date | null
    reopenedById: string | null
    reopenedByName: string | null
    reopenReason: string | null
  }>>`
    SELECT "status", "generatedAt", "generatedById", "generatedByName",
           "confirmedAt", "confirmedById", "confirmedByName", "lockedAt",
           "reopenedAt", "reopenedById", "reopenedByName", "reopenReason"
    FROM "DailyFinancialReport"
    WHERE "date" = ${date}
    LIMIT 1
  `
  return rows[0] || null
}

async function resolveReportStatus(date: string) {
  const pending = await countPendingReconExceptions(date)
  return pending > 0 ? DAILY_STATUS.HAS_EXCEPTION : DAILY_STATUS.READY_TO_CONFIRM
}

/**
 * 获取每日财务报表
 * GET /finance/daily-report?date=YYYY-MM-DD
 */
export async function getDailyReport(req: AuthenticatedRequest, res: Response) {
  const dateStr = req.query.date as string
  if (!dateStr) return error(res, '请指定日期参数 date', 400)

  try {
    const report = await prisma.dailyFinancialReport.findUnique({
      where: { date: dateStr }
    })

    // 无论是否有跑批记录，都实时查询负债数据（负债是时点值，不依赖跑批）
    const principalLiability = await prisma.user.aggregate({
      _sum: { principalBalance: true }
    })
    const bonusLiability = await prisma.user.aggregate({
      _sum: { bonusBalance: true }
    })
    const ptsLiability = await prisma.user.aggregate({
      _sum: { points: true }
    })

    if (!report) {
      return success(res, {
        date: dateStr,
        generated: false,
        generatedAt: null,
        status: DAILY_STATUS.DRAFT,
        statusLabel: '未生成',
        pendingExceptionCount: 0,
        rechargePrincipalIn: 0,
        directPayIn: 0,
        refundOut: 0,
        netCashFlow: 0,
        directRevenue: 0,
        memberPrincipalRevenue: 0,
        totalRecognizedRevenue: 0,
        prepaidDirectRevenue: 0,
        confirmedDirectRevenue: 0,
        prepaidMemberRevenue: 0,
        confirmedMemberRevenue: 0,
        otherIncomeTotal: 0,
        noShowPenalty: 0,
        rescheduleFeeIncome: 0,
        cancelFeeIncome: 0,
        pointsExchangeCost: 0,
        couponDiscountCost: 0,
        pointsGiftCost: 0,
        couponGiftCount: 0,
        experienceGiftCount: 0,
        couponCampaignCount: 0,
        experienceCampaignCount: 0,
        couponUsedCount: 0,
        experienceUsedCount: 0,
        totalPrincipalLiability: principalLiability._sum?.principalBalance || 0,
        totalBonusLiability: bonusLiability._sum?.bonusBalance || 0,
        pointsLiability: ptsLiability._sum?.points || 0,
        dormantPrincipal: 0,
      }, '该日期暂无跑批数据，负债数据为实时值')
    }

    const meta = await getReportMeta(dateStr)
    const status = meta?.status || DAILY_STATUS.GENERATED

    return success(res, {
      ...report,
      ...meta,
      generated: status !== DAILY_STATUS.DRAFT,
      generatedAt: meta?.generatedAt || report.updatedAt,
      status,
      statusLabel: dailyStatusLabel(status),
      pendingExceptionCount: await countPendingReconExceptions(dateStr),
      totalPrincipalLiability: principalLiability._sum?.principalBalance || 0,
      totalBonusLiability: bonusLiability._sum?.bonusBalance || 0,
      pointsLiability: ptsLiability._sum?.points || 0,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取财务报表列表（支持日期范围）
 * GET /finance/daily-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function listDailyReports(req: AuthenticatedRequest, res: Response) {
  const { startDate, endDate } = req.query

  try {
    const where: any = {}
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = startDate as string
      if (endDate) where.date.lte = endDate as string
    }

    const reports = await prisma.dailyFinancialReport.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    return success(res, reports)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 手动触发跑批（用于补录历史数据）
 * POST /finance/generate-report
 */
export async function generateReport(req: AuthenticatedRequest, res: Response) {
  const { date } = req.body
  if (!date) return error(res, '请指定日期', 400)

  try {
    const existingMeta = await getReportMeta(date as string)
    if (existingMeta?.status === DAILY_STATUS.LOCKED) {
      return error(res, '该日期已日结锁定，如需重跑请先执行重开日结', 400)
    }

    const user = currentUser(req)
    await runDailyReport(date as string, user)
    await logAudit(req, {
      targetType: 'FINANCE_REPORT',
      targetId: date as string,
      targetDesc: `每日财务报表 ${date}`,
      action: 'POST',
      actionName: '生成每日财务报表',
      afterValue: { date },
      reason: `手动生成每日财务报表: ${date}`,
    })
    return success(res, null, `报表生成成功: ${date}`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

function dailyStatusLabel(status?: string | null) {
  switch (status) {
    case DAILY_STATUS.GENERATED: return '已生成'
    case DAILY_STATUS.HAS_EXCEPTION: return '有异常'
    case DAILY_STATUS.READY_TO_CONFIRM: return '待确认'
    case DAILY_STATUS.LOCKED: return '已日结'
    case DAILY_STATUS.REOPENED: return '已重开'
    default: return '未生成'
  }
}

export async function confirmDailyReport(req: AuthenticatedRequest, res: Response) {
  const { date } = req.body
  if (!date) return error(res, '请指定日期', 400)

  try {
    const report = await prisma.dailyFinancialReport.findUnique({ where: { date } })
    if (!report) return error(res, '请先生成该日期的财务报表', 400)
    const meta = await getReportMeta(date)
    if (meta?.status === DAILY_STATUS.LOCKED) return error(res, '该日期已经日结锁定', 400)

    const pendingExceptionCount = await countPendingReconExceptions(date)
    if (pendingExceptionCount > 0) {
      await prisma.$executeRaw`
        UPDATE "DailyFinancialReport"
        SET "status" = ${DAILY_STATUS.HAS_EXCEPTION}, "updatedAt" = NOW()
        WHERE "date" = ${date}
      `
      return error(res, `仍有 ${pendingExceptionCount} 条待处理对账异常，不能确认日结`, 400)
    }

    const user = currentUser(req)
    const lockedAt = new Date()
    await prisma.$executeRaw`
      UPDATE "DailyFinancialReport"
      SET "status" = ${DAILY_STATUS.LOCKED},
          "confirmedAt" = ${lockedAt},
          "confirmedById" = ${user.id},
          "confirmedByName" = ${user.name},
          "lockedAt" = ${lockedAt},
          "updatedAt" = NOW()
      WHERE "date" = ${date}
    `
    const updated = { ...report, ...(await getReportMeta(date)) }

    await logAudit(req, {
      targetType: 'FINANCE_REPORT',
      targetId: date,
      targetDesc: `每日财务报表 ${date}`,
      action: 'POST',
      actionName: '确认日结',
      beforeValue: { status: meta?.status || DAILY_STATUS.GENERATED },
      afterValue: { status: DAILY_STATUS.LOCKED, lockedAt },
      reason: `确认 ${date} 财务日报并锁定`,
    })

    return success(res, updated, '日结确认成功，报表已锁定')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function reopenDailyReport(req: AuthenticatedRequest, res: Response) {
  const { date, reason } = req.body
  const cleanReason = typeof reason === 'string' ? reason.trim() : ''
  if (!date) return error(res, '请指定日期', 400)
  if (cleanReason.length < 4) return error(res, '请填写至少 4 个字的重开原因', 400)

  try {
    const report = await prisma.dailyFinancialReport.findUnique({ where: { date } })
    if (!report) return error(res, '该日期没有财务报表', 404)
    const meta = await getReportMeta(date)
    if (meta?.status !== DAILY_STATUS.LOCKED) return error(res, '只有已日结锁定的报表需要重开', 400)

    const user = currentUser(req)
    const reopenedAt = new Date()
    await prisma.$executeRaw`
      UPDATE "DailyFinancialReport"
      SET "status" = ${DAILY_STATUS.REOPENED},
          "lockedAt" = NULL,
          "reopenedAt" = ${reopenedAt},
          "reopenedById" = ${user.id},
          "reopenedByName" = ${user.name},
          "reopenReason" = ${cleanReason},
          "updatedAt" = NOW()
      WHERE "date" = ${date}
    `
    const updated = { ...report, ...(await getReportMeta(date)) }

    await logAudit(req, {
      targetType: 'FINANCE_REPORT',
      targetId: date,
      targetDesc: `每日财务报表 ${date}`,
      action: 'POST',
      actionName: '重开日结',
      beforeValue: { status: meta?.status, lockedAt: meta?.lockedAt },
      afterValue: { status: DAILY_STATUS.REOPENED, reopenedAt },
      reason: cleanReason,
    })

    return success(res, updated, '日结已重开，可重新生成报表')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 对账校验
 * GET /finance/reconcile?date=YYYY-MM-DD
 *
 * 支持两种模式：
 * - 总对账（不传 date）：校验全量累计数据的一致性
 * - 按日对账（传 date）：校验指定日期当天的业务数据双边一致性
 *
 * 对账维度覆盖：余额、充值、在线支付、消费、退款、积分
 */
export async function reconcile(req: AuthenticatedRequest, res: Response) {
  try {
    const dateStr = req.query.date as string | undefined
    const mode = dateStr ? 'daily' : 'total'

    let start: Date | undefined
    let end: Date | undefined
    if (dateStr) {
      start = startOfDay(new Date(dateStr + 'T00:00:00'))
      end = endOfDay(new Date(dateStr + 'T00:00:00'))
    }

    // 通用日期范围条件
    const dateRange = start && end ? { gte: start, lte: end } : undefined

    // ==================== 总对账：余额恒等式 ====================
    let balanceChecks: any = null
    if (mode === 'total') {
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

      balanceChecks = {
        principal: {
          actual: totalPrincipal,
          expected: expectedPrincipal,
          diff: totalPrincipal - expectedPrincipal,
        },
        bonus: {
          actual: totalBonus,
          expected: expectedBonus,
          diff: totalBonus - expectedBonus,
        },
        points: {
          actual: totalPoints,
          expected: expectedPoints,
          diff: totalPoints - expectedPoints,
        },
      }
    }

    // ==================== 1. 充值对账 ====================
    const rechargeSum = await prisma.rechargeRecord.aggregate({
      where: {
        status: 'PAID',
        ...(dateStr ? { paidAt: dateRange } : {}),
      },
      _sum: { amount: true, bonus: true },
    })

    const txRechargeSum = await prisma.balanceTransaction.aggregate({
      where: {
        type: 'RECHARGE',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { principalAmount: true, bonusAmount: true },
    })

    // ==================== 2. 在线支付对账 ====================
    const paymentSum = await prisma.payment.aggregate({
      where: {
        status: 'SUCCESS',
        method: { in: ['WECHAT', 'ALIPAY'] },
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { amount: true },
    })

    const orderOnlineSum = await prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'NO_SHOW'] },
        payMethod: { in: ['WECHAT', 'ALIPAY'] },
        ...(dateStr ? { paidAt: dateRange } : {}),
      },
      _sum: { amount: true },
    })

    // ==================== 3. 消费对账 ====================
    const orderConsumeSum = await prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'NO_SHOW'] },
        ...(dateStr ? { paidAt: dateRange } : {}),
      },
      _sum: { principalDeduction: true, bonusDeduction: true },
    })

    const txDeductSum = await prisma.balanceTransaction.aggregate({
      where: {
        type: 'DEDUCT',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { principalAmount: true, bonusAmount: true },
    })

    // ==================== 4. 退款对账 ====================
    const txRefundSum = await prisma.balanceTransaction.aggregate({
      where: {
        type: 'REFUND',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { totalAmount: true, principalAmount: true, bonusAmount: true },
    })

    const txCancelRefundSum = await prisma.balanceTransaction.aggregate({
      where: {
        type: 'CANCEL_RESTORE',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { totalAmount: true, principalAmount: true, bonusAmount: true },
    })

    let orderRefundTotal = 0
    let orderCancelRefundTotal = 0
    if (dateStr && dateRange) {
      const refundTxOrders = await prisma.balanceTransaction.findMany({
        where: {
          type: 'REFUND',
          createdAt: dateRange,
          orderId: { not: null },
        },
        select: { orderId: true },
      })
      const orderIdsFromRefundTx = refundTxOrders
        .map((tx) => tx.orderId)
        .filter(Boolean) as string[]
      const refundOrders = await prisma.order.findMany({
        where: {
          status: 'REFUNDED',
          OR: [
            { updatedAt: dateRange },
            ...(orderIdsFromRefundTx.length ? [{ id: { in: orderIdsFromRefundTx } }] : []),
          ],
        },
        select: { id: true, refundAmount: true },
      })
      const uniqueRefundOrders = new Map(refundOrders.map((order) => [order.id, order.refundAmount || 0]))
      orderRefundTotal = Array.from(uniqueRefundOrders.values()).reduce((sum, amount) => sum + amount, 0)

      const cancelRefundTxOrders = await prisma.balanceTransaction.findMany({
        where: {
          type: 'CANCEL_RESTORE',
          createdAt: dateRange,
          orderId: { not: null },
        },
        select: { orderId: true },
      })
      const orderIdsFromCancelRefundTx = cancelRefundTxOrders
        .map((tx) => tx.orderId)
        .filter(Boolean) as string[]
      const cancelRefundOrders = await prisma.order.findMany({
        where: {
          status: 'CANCELLED',
          OR: [
            { cancelledAt: dateRange },
            ...(orderIdsFromCancelRefundTx.length ? [{ id: { in: orderIdsFromCancelRefundTx } }] : []),
          ],
        },
        select: { id: true, refundAmount: true },
      })
      const uniqueCancelRefundOrders = new Map(cancelRefundOrders.map((order) => [order.id, order.refundAmount || 0]))
      orderCancelRefundTotal = Array.from(uniqueCancelRefundOrders.values()).reduce((sum, amount) => sum + amount, 0)
    } else {
      const orderRefundSum = await prisma.order.aggregate({
        where: {
          status: 'REFUNDED',
        },
        _sum: { refundAmount: true },
      })
      orderRefundTotal = orderRefundSum._sum?.refundAmount || 0

      const orderCancelRefundSum = await prisma.order.aggregate({
        where: {
          status: 'CANCELLED',
        },
        _sum: { refundAmount: true },
      })
      orderCancelRefundTotal = orderCancelRefundSum._sum?.refundAmount || 0
    }

    // ==================== 5. 积分对账 ====================
    const txPointsEarnSum = await prisma.balanceTransaction.aggregate({
      where: {
        type: 'POINTS_EARN',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { pointsAmount: true },
    })

    const txPointsGiftSum = await prisma.balanceTransaction.aggregate({
      where: {
        type: 'POINTS_GIFT',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { pointsAmount: true },
    })

    const txPointsExchangeDeductSum = await prisma.balanceTransaction.aggregate({
      where: {
        type: 'POINTS_DEDUCT',
        orderId: null, // 只统计积分商城兑换（无订单关联）
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { pointsAmount: true },
    })

    const exchangePointsSum = await prisma.pointsExchange.aggregate({
      where: {
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { pointsCost: true },
    })

    const orderPointsSum = await prisma.pointsOrder.aggregate({
      where: {
        status: { not: 'CANCELLED' },
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
      _sum: { pointsCost: true },
    })

    const pointsEarnCheck = {
      actual: txPointsEarnSum._sum?.pointsAmount || 0,
      expected: txPointsEarnSum._sum?.pointsAmount || 0,
      diff: 0,
      note: '单边统计（消费赠送积分）',
    }

    const pointsGiftCheck = {
      actual: txPointsGiftSum._sum?.pointsAmount || 0,
      expected: txPointsGiftSum._sum?.pointsAmount || 0,
      diff: 0,
      note: '单边统计（管理员手动赠送积分）',
    }

    const exchangeTotal = (exchangePointsSum._sum?.pointsCost || 0) + (orderPointsSum._sum?.pointsCost || 0)
    const txExchangeDeductTotal = Math.abs(txPointsExchangeDeductSum._sum?.pointsAmount || 0)

    const pointsExchangeCheck = {
      actual: exchangeTotal,
      expected: txExchangeDeductTotal,
      diff: exchangeTotal - txExchangeDeductTotal,
      note: '积分商城兑换消耗（含虚拟商品+实物订单）',
    }

    // ==================== 6. 优惠券/体验券发放对账 ====================
    const couponGiftSum = await prisma.userCoupon.count({
      where: {
        source: 'MANUAL_GIFT',
        type: 'DISCOUNT',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
    })

    const experienceGiftSum = await prisma.userCoupon.count({
      where: {
        source: 'MANUAL_GIFT',
        type: 'EXPERIENCE_FREE',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
    })

    const couponCampaignSum = await prisma.userCoupon.count({
      where: {
        source: 'CAMPAIGN',
        type: 'DISCOUNT',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
    })

    const experienceCampaignSum = await prisma.userCoupon.count({
      where: {
        source: 'CAMPAIGN',
        type: 'EXPERIENCE_FREE',
        ...(dateStr ? { createdAt: dateRange } : {}),
      },
    })

    const couponUsedSum = await prisma.userCoupon.count({
      where: {
        type: 'DISCOUNT',
        status: 'USED',
        ...(dateStr ? { usedAt: dateRange } : {}),
      },
    })

    const experienceUsedSum = await prisma.userCoupon.count({
      where: {
        type: 'EXPERIENCE_FREE',
        status: 'USED',
        ...(dateStr ? { usedAt: dateRange } : {}),
      },
    })

    // ==================== 组装对账结果 ====================
    const items: any[] = []

    if (mode === 'total' && balanceChecks) {
      items.push(
        { name: '本金余额', ...balanceChecks.principal, unit: '元' },
        { name: '赠送余额', ...balanceChecks.bonus, unit: '元' },
        { name: '积分余额', ...balanceChecks.points, unit: '分' }
      )
    }

    items.push(
      {
        name: '充值本金',
        actual: rechargeSum._sum?.amount || 0,
        expected: txRechargeSum._sum?.principalAmount || 0,
        diff:
          (rechargeSum._sum?.amount || 0) -
          (txRechargeSum._sum?.principalAmount || 0),
        unit: '元',
      },
      {
        name: '充值赠送',
        actual: rechargeSum._sum?.bonus || 0,
        expected: txRechargeSum._sum?.bonusAmount || 0,
        diff:
          (rechargeSum._sum?.bonus || 0) -
          (txRechargeSum._sum?.bonusAmount || 0),
        unit: '元',
      },
      {
        name: '在线支付金额',
        actual: paymentSum._sum?.amount || 0,
        expected: orderOnlineSum._sum?.amount || 0,
        diff:
          (paymentSum._sum?.amount || 0) -
          (orderOnlineSum._sum?.amount || 0),
        unit: '元',
      },
      {
        name: '消费本金',
        actual: orderConsumeSum._sum?.principalDeduction || 0,
        expected: Math.abs(txDeductSum._sum?.principalAmount || 0),
        diff:
          (orderConsumeSum._sum?.principalDeduction || 0) -
          Math.abs(txDeductSum._sum?.principalAmount || 0),
        unit: '元',
      },
      {
        name: '消费赠送',
        actual: orderConsumeSum._sum?.bonusDeduction || 0,
        expected: Math.abs(txDeductSum._sum?.bonusAmount || 0),
        diff:
          (orderConsumeSum._sum?.bonusDeduction || 0) -
          Math.abs(txDeductSum._sum?.bonusAmount || 0),
        unit: '元',
      },
      {
        name: '取消退费总额',
        actual: txCancelRefundSum._sum?.totalAmount || 0,
        expected: orderCancelRefundTotal,
        diff:
          (txCancelRefundSum._sum?.totalAmount || 0) -
          orderCancelRefundTotal,
        unit: '元',
        note: mode === 'daily' ? '顾客取消订单产生的退费，与退款处置分开对账' : '顾客取消订单产生的退费',
      },
      {
        name: '退款总额',
        actual: txRefundSum._sum?.totalAmount || 0,
        expected: orderRefundTotal,
        diff:
          (txRefundSum._sum?.totalAmount || 0) -
          orderRefundTotal,
        unit: '元',
        note: mode === 'daily' ? '日对账会纳入当天退款流水关联的订单，避免历史订单补流水误报' : undefined,
      }
    )

    items.push(
      { name: '消费赠送积分', ...pointsEarnCheck, unit: '分' },
      { name: '管理员赠送积分', ...pointsGiftCheck, unit: '分' },
      { name: '积分兑换消耗', ...pointsExchangeCheck, unit: '分' }
    )

    items.push(
      { name: '手动发放折扣券', actual: couponGiftSum, expected: couponGiftSum, diff: 0, unit: '张', note: '单边统计（管理员手动赠送折扣券）' },
      { name: '手动发放体验券', actual: experienceGiftSum, expected: experienceGiftSum, diff: 0, unit: '张', note: '单边统计（管理员手动赠送体验券）' },
      { name: '活动发放折扣券', actual: couponCampaignSum, expected: couponCampaignSum, diff: 0, unit: '张', note: '单边统计（营销活动发放折扣券）' },
      { name: '活动发放体验券', actual: experienceCampaignSum, expected: experienceCampaignSum, diff: 0, unit: '张', note: '单边统计（营销活动发放体验券）' },
      { name: '折扣券核销', actual: couponUsedSum, expected: couponUsedSum, diff: 0, unit: '张', note: '单边统计（折扣券已使用）' },
      { name: '体验券核销', actual: experienceUsedSum, expected: experienceUsedSum, diff: 0, unit: '张', note: '单边统计（体验券已使用）' },
    )

    const allBalanced = items.every((item) => item.diff === 0)

    return success(res, {
      mode,
      date: dateStr || null,
      isBalanced: allBalanced,
      items: items.map((item) => ({
        ...item,
        isBalanced: item.diff === 0,
      })),
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 用户资金流水查询（支持分页）
 * GET /finance/transactions?userId=&page=&pageSize=
 */
export async function listTransactions(req: AuthenticatedRequest, res: Response) {
  const { userId, page = '1', pageSize = '20' } = req.query
  const pageNum = parseInt(page as string, 10)
  const sizeNum = parseInt(pageSize as string, 10)

  try {
    const where: any = {}
    if (userId) where.userId = userId as string

    const [transactions, total] = await Promise.all([
      prisma.balanceTransaction.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          order: { select: { orderNo: true, amount: true, status: true } },
        }
      }),
      prisma.balanceTransaction.count({ where })
    ])

    return success(res, {
      data: transactions,
      meta: { page: pageNum, pageSize: sizeNum, total, totalPages: Math.ceil(total / sizeNum) }
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

// ========== 内部跑批逻辑 ==========
export async function runDailyReport(
  dateStr: string,
  operator?: { id: string; name: string; role: string }
) {
  const start = startOfDay(new Date(dateStr + 'T00:00:00'))
  const end = endOfDay(new Date(dateStr + 'T00:00:00'))
  const generatedAt = new Date()
  const status = await resolveReportStatus(dateStr)

  // 5.1 现金解缴表
  const rechargePrincipalIn = await prisma.rechargeRecord.aggregate({
    where: { status: 'PAID', paidAt: { gte: start, lte: end } },
    _sum: { amount: true }
  })

  const directPayIn = await prisma.payment.aggregate({
    where: {
      method: { in: ['WECHAT', 'ALIPAY'] },
      status: 'SUCCESS',
      createdAt: { gte: start, lte: end }
    },
    _sum: { amount: true }
  })

  const refundOut = await prisma.order.aggregate({
    where: {
      orderKind: 'NORMAL',
      status: { in: ['REFUNDED', 'CANCELLED'] },
      refundAmount: { gt: 0 },
      updatedAt: { gte: start, lte: end }
    },
    _sum: { refundAmount: true }
  })

  // 5.2 确权营收表（兼容字段 + 新拆分字段）
  const prepaidDirectRevenue = await prisma.order.aggregate({
    where: {
      orderKind: 'NORMAL',
      status: 'PAID',
      payMethod: { in: ['WECHAT', 'ALIPAY'] },
      paidAt: { gte: start, lte: end }
    },
    _sum: { amount: true }
  })

  const confirmedDirectRevenue = await prisma.order.aggregate({
    where: {
      orderKind: 'NORMAL',
      status: 'COMPLETED',
      payMethod: { in: ['WECHAT', 'ALIPAY'] },
      paidAt: { gte: start, lte: end }
    },
    _sum: { amount: true }
  })

  const prepaidMemberRevenue = await prisma.order.aggregate({
    where: {
      orderKind: 'NORMAL',
      status: 'PAID',
      principalDeduction: { gt: 0 },
      paidAt: { gte: start, lte: end }
    },
    _sum: { principalDeduction: true }
  })

  const confirmedMemberRevenue = await prisma.order.aggregate({
    where: {
      orderKind: 'NORMAL',
      status: 'COMPLETED',
      principalDeduction: { gt: 0 },
      paidAt: { gte: start, lte: end }
    },
    _sum: { principalDeduction: true }
  })

  // 兼容字段：prepaid + confirmed
  const dr = (prepaidDirectRevenue._sum.amount || 0) + (confirmedDirectRevenue._sum.amount || 0)
  const mpr = (prepaidMemberRevenue._sum.principalDeduction || 0) + (confirmedMemberRevenue._sum.principalDeduction || 0)

  const pointsExchangeCost = await prisma.pointsExchange.aggregate({
    where: {
      createdAt: { gte: start, lte: end }
    },
    _sum: { pointsCost: true }
  })

  const pointsOrderCost = await prisma.pointsOrder.aggregate({
    where: {
      status: { not: 'CANCELLED' },
      createdAt: { gte: start, lte: end }
    },
    _sum: { pointsCost: true }
  })

  const pointsGiftCost = await prisma.balanceTransaction.aggregate({
    where: {
      type: 'POINTS_GIFT',
      createdAt: { gte: start, lte: end }
    },
    _sum: { pointsAmount: true }
  })

  const couponDiscountCost = await prisma.order.aggregate({
    where: {
      status: { in: ['PAID', 'COMPLETED'] },
      couponDiscount: { gt: 0 },
      paidAt: { gte: start, lte: end }
    },
    _sum: { couponDiscount: true }
  })

  const couponGiftCount = await prisma.userCoupon.count({
    where: {
      source: 'MANUAL_GIFT',
      type: 'DISCOUNT',
      createdAt: { gte: start, lte: end }
    }
  })

  const experienceGiftCount = await prisma.userCoupon.count({
    where: {
      source: 'MANUAL_GIFT',
      type: 'EXPERIENCE_FREE',
      createdAt: { gte: start, lte: end }
    }
  })

  const couponCampaignCount = await prisma.userCoupon.count({
    where: {
      source: 'CAMPAIGN',
      type: 'DISCOUNT',
      createdAt: { gte: start, lte: end }
    }
  })

  const experienceCampaignCount = await prisma.userCoupon.count({
    where: {
      source: 'CAMPAIGN',
      type: 'EXPERIENCE_FREE',
      createdAt: { gte: start, lte: end }
    }
  })

  const couponUsedCount = await prisma.userCoupon.count({
    where: {
      type: 'DISCOUNT',
      status: 'USED',
      usedAt: { gte: start, lte: end }
    }
  })

  const experienceUsedCount = await prisma.userCoupon.count({
    where: {
      type: 'EXPERIENCE_FREE',
      status: 'USED',
      usedAt: { gte: start, lte: end }
    }
  })

  // 5.3 负债存量
  const principalLiability = await prisma.user.aggregate({
    _sum: { principalBalance: true }
  })
  const bonusLiability = await prisma.user.aggregate({
    _sum: { bonusBalance: true }
  })

  // 沉睡本金（90天无流水）
  const ninetyDaysAgo = subDays(start, 90)
  const dormantUsers = await prisma.user.findMany({
    where: {
      principalBalance: { gt: 0 },
      transactions: { none: { createdAt: { gte: ninetyDaysAgo } } }
    },
    select: { principalBalance: true }
  })
  const dormantPrincipal = dormantUsers.reduce((s, u) => s + u.principalBalance, 0)

  const rpi = rechargePrincipalIn._sum.amount || 0
  const dpi = directPayIn._sum.amount || 0
  const ro = refundOut._sum.refundAmount || 0
  const pdr = prepaidDirectRevenue._sum.amount || 0
  const cdr = confirmedDirectRevenue._sum.amount || 0
  const pmr = prepaidMemberRevenue._sum.principalDeduction || 0
  const cmr = confirmedMemberRevenue._sum.principalDeduction || 0
  const pec = (pointsExchangeCost._sum?.pointsCost || 0) + (pointsOrderCost._sum?.pointsCost || 0)
  const pgc = pointsGiftCost._sum?.pointsAmount || 0
  const cdc = couponDiscountCost._sum.couponDiscount || 0
  const tpl = principalLiability._sum.principalBalance || 0
  const tbl = bonusLiability._sum.bonusBalance || 0
  const ptsLiability = await prisma.user.aggregate({
    _sum: { points: true }
  })
  const pointsLiab = ptsLiability._sum.points || 0

  // 营业外收入拆分
  // 1. 作废未退收入（兼容历史违约金字段）
  const noShowOrders = await prisma.order.findMany({
    where: {
      status: 'NO_SHOW',
      OR: [
        { noShowAt: { gte: start, lte: end } },
        { noShowAt: null, updatedAt: { gte: start, lte: end } },
      ],
    },
    select: { amount: true, refundAmount: true, penaltyAmount: true },
  })
  const noShowPenaltySum = noShowOrders.reduce((s, o) => {
    return s + noShowRetainedIncome(o)
  }, 0)

  // 2. 取消费（已支付订单取消后未退部分）
  const cancelledOrders = await prisma.order.findMany({
    where: {
      orderKind: 'NORMAL',
      status: 'CANCELLED',
      cancelledAt: { gte: start, lte: end },
      refundAmount: { gt: 0 },
    },
    select: { amount: true, refundAmount: true },
  })
  const cancelFeeSum = cancelledOrders.reduce((s, o) => s + Math.max(0, o.amount - (o.refundAmount || 0)), 0)

  // 3. 改签手续费：按独立费用订单统计（新流程）
  const rescheduleFeeSumAgg = await prisma.order.aggregate({
    where: {
      orderKind: 'FEE',
      feeType: 'RESCHEDULE_FEE',
      status: 'PAID',
      paidAt: { gte: start, lte: end },
    },
    _sum: { amount: true },
  })
  const rescheduleFeeSum = rescheduleFeeSumAgg._sum.amount || 0

  const totalOtherIncome = noShowPenaltySum + cancelFeeSum + rescheduleFeeSum

  await prisma.dailyFinancialReport.upsert({
    where: { date: dateStr },
    update: {
      rechargePrincipalIn: rpi,
      directPayIn: dpi,
      refundOut: ro,
      netCashFlow: rpi + dpi - ro,
      directRevenue: pdr + cdr,
      memberPrincipalRevenue: pmr + cmr,
      totalRecognizedRevenue: pdr + cdr + pmr + cmr,
      prepaidDirectRevenue: pdr,
      confirmedDirectRevenue: cdr,
      prepaidMemberRevenue: pmr,
      confirmedMemberRevenue: cmr,
      pointsExchangeCost: pec,
      pointsGiftCost: pgc,
      couponDiscountCost: cdc,
      couponGiftCount,
      experienceGiftCount,
      couponCampaignCount,
      experienceCampaignCount,
      couponUsedCount,
      experienceUsedCount,
      totalPrincipalLiability: tpl,
      totalBonusLiability: tbl,
      pointsLiability: pointsLiab,
      dormantPrincipal,
      noShowPenalty: noShowPenaltySum,
      otherIncomeTotal: totalOtherIncome,
      rescheduleFeeIncome: rescheduleFeeSum,
      cancelFeeIncome: cancelFeeSum,
    },
    create: {
      date: dateStr,
      rechargePrincipalIn: rpi,
      directPayIn: dpi,
      refundOut: ro,
      netCashFlow: rpi + dpi - ro,
      directRevenue: pdr + cdr,
      memberPrincipalRevenue: pmr + cmr,
      totalRecognizedRevenue: pdr + cdr + pmr + cmr,
      prepaidDirectRevenue: pdr,
      confirmedDirectRevenue: cdr,
      prepaidMemberRevenue: pmr,
      confirmedMemberRevenue: cmr,
      pointsExchangeCost: pec,
      pointsGiftCost: pgc,
      couponDiscountCost: cdc,
      couponGiftCount,
      experienceGiftCount,
      couponUsedCount,
      experienceUsedCount,
      totalPrincipalLiability: tpl,
      totalBonusLiability: tbl,
      pointsLiability: pointsLiab,
      dormantPrincipal,
      noShowPenalty: noShowPenaltySum,
      otherIncomeTotal: totalOtherIncome,
      rescheduleFeeIncome: rescheduleFeeSum,
      cancelFeeIncome: cancelFeeSum,
    }
  })

  await prisma.$executeRaw`
    UPDATE "DailyFinancialReport"
    SET "status" = ${status},
        "generatedAt" = ${generatedAt},
        "generatedById" = ${operator?.id || null},
        "generatedByName" = ${operator?.name || null},
        "updatedAt" = NOW()
    WHERE "date" = ${dateStr}
  `
}

/**
 * 对账差异明细查询
 * GET /finance/reconcile-details?type=xxx&date=xxx&limit=50
 *
 * type 可选值：
 * BALANCE_PRINCIPAL, BALANCE_BONUS, BALANCE_POINTS,
 * RECHARGE_PRINCIPAL, RECHARGE_BONUS,
 * DIRECT_PAY, CONSUME_PRINCIPAL, CONSUME_BONUS, REFUND
 */
export async function reconcileDetails(req: AuthenticatedRequest, res: Response) {
  const { type, date: dateStr } = req.query as { type: string; date?: string }
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)

  if (!type) return error(res, '请指定差异类型 type', 400)

  const mode = dateStr ? 'daily' : 'total'
  let start: Date | undefined, end: Date | undefined
  if (dateStr) {
    start = startOfDay(new Date(dateStr + 'T00:00:00'))
    end = endOfDay(new Date(dateStr + 'T00:00:00'))
  }
  const dateRange = start && end ? { gte: start, lte: end } : undefined

  try {
    const items: any[] = []
    let totalDiff = 0

    switch (type) {
      case 'BALANCE_PRINCIPAL':
      case 'BALANCE_BONUS':
      case 'BALANCE_POINTS': {
        const balanceField =
          type === 'BALANCE_PRINCIPAL'
            ? 'principalBalance'
            : type === 'BALANCE_BONUS'
              ? 'bonusBalance'
              : 'points'
        const txField =
          type === 'BALANCE_POINTS'
            ? 'pointsAmount'
            : type === 'BALANCE_PRINCIPAL'
              ? 'principalAmount'
              : 'bonusAmount'
        const unit = type === 'BALANCE_POINTS' ? '分' : '元'

        const users = await prisma.user.findMany({
          select: {
            id: true,
            name: true,
            phone: true,
            [balanceField]: true,
          },
        }) as any[]

        const txSums = (await prisma.balanceTransaction.groupBy({
          by: ['userId'],
          ...(dateStr ? { where: { createdAt: dateRange } } : {}),
          _sum: { [txField]: true },
        } as any)) as any[]

        const txMap = new Map(
          txSums.map((t) => [t.userId, (t._sum as any)[txField] || 0])
        )

        for (const user of users) {
          const balance = (user as any)[balanceField] as number
          const txSum = txMap.get(user.id) || 0
          const diff = balance - txSum
          if (diff !== 0) {
            items.push({
              id: user.id,
              title: user.name || '未知用户',
              subtitle: user.phone || '',
              actual: balance,
              expected: txSum,
              diff,
              unit,
              reason: `用户${
                type === 'BALANCE_PRINCIPAL'
                  ? '本金'
                  : type === 'BALANCE_BONUS'
                    ? '赠送'
                    : '积分'
              }余额与流水累计不一致`,
              link: `/users/${user.id}`,
            })
            totalDiff += Math.abs(diff)
          }
          if (items.length >= limit) break
        }
        break
      }

      case 'CONSUME_PRINCIPAL':
      case 'CONSUME_BONUS': {
        const isPrincipal = type === 'CONSUME_PRINCIPAL'
        const orderField = isPrincipal ? 'principalDeduction' : 'bonusDeduction'
        const txField = isPrincipal ? 'principalAmount' : 'bonusAmount'
        const unit = '元'

        const orders = await prisma.order.findMany({
          where: {
            status: { in: ['PAID', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'NO_SHOW'] },
            ...(dateStr ? { paidAt: dateRange } : {}),
          },
          select: {
            id: true,
            orderNo: true,
            [orderField]: true,
            userId: true,
            createdAt: true,
            status: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 2000,
        }) as any[]

        const txs = await prisma.balanceTransaction.findMany({
          where: {
            type: 'DEDUCT',
            ...(dateStr ? { createdAt: dateRange } : {}),
          },
          select: { orderId: true, [txField]: true },
        }) as any[]

        const txMap = new Map<string, number>()
        for (const tx of txs) {
          if (!tx.orderId) continue
          const existing = txMap.get(tx.orderId) || 0
          txMap.set(
            tx.orderId,
            existing + ((tx as any)[txField] || 0)
          )
        }

        // 订单 vs 流水
        for (const order of orders) {
          const orderVal = ((order as any)[orderField] as number) || 0
          const txSignedVal = txMap.get(order.id) || 0
          const txVal = Math.abs(txSignedVal)
          if (orderVal !== txVal) {
            items.push({
              id: order.id,
              title: order.orderNo,
              subtitle: `${format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm')} · ${order.status}`,
              actual: orderVal,
              expected: txVal,
              diff: orderVal - txVal,
              unit,
              reason:
                orderVal > txVal
                  ? '订单扣款金额大于流水记录'
                  : txVal > 0
                    ? '流水有扣款但订单记录偏少'
                    : '订单有扣款但无对应流水',
              link: `/orders/${order.id}`,
            })
            totalDiff += Math.abs(orderVal - txVal)
          }
          if (items.length >= limit) break
        }

        // 流水 vs 订单（有流水无订单）
        const orderIds = new Set(orders.map((o) => o.id))
        for (const [orderId, txVal] of txMap.entries()) {
          if (!orderIds.has(orderId)) {
            const displayVal = Math.abs(txVal)
            if (displayVal === 0) continue
            items.push({
              id: orderId,
              title: '未知订单',
              subtitle: '存在流水但无对应订单',
              actual: 0,
              expected: displayVal,
              diff: -displayVal,
              unit,
              reason: '存在扣款流水但找不到对应订单',
              canAutoFix: true,
              fixHint: '系统将生成一条反向扣款流水，把这笔孤儿流水从消费对账中抵消；原始流水仍保留审计。',
            })
            totalDiff += displayVal
          }
          if (items.length >= limit) break
        }
        break
      }

      case 'RECHARGE_PRINCIPAL':
      case 'RECHARGE_BONUS': {
        const isPrincipal = type === 'RECHARGE_PRINCIPAL'
        const recordField = isPrincipal ? 'amount' : 'bonus'
        const txField = isPrincipal ? 'principalAmount' : 'bonusAmount'
        const unit = '元'

        const records = await prisma.rechargeRecord.findMany({
          where: {
            status: 'PAID',
            ...(dateStr ? { paidAt: dateRange } : {}),
          },
          select: {
            id: true,
            [recordField]: true,
            userId: true,
            createdAt: true,
            paidAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 2000,
        }) as any[]

        const txs = await prisma.balanceTransaction.findMany({
          where: {
            type: 'RECHARGE',
            ...(dateStr ? { createdAt: dateRange } : {}),
          },
          select: { rechargeId: true, [txField]: true },
        }) as any[]

        const txMap = new Map<string, number>()
        for (const tx of txs) {
          if (!tx.rechargeId) continue
          const existing = txMap.get(tx.rechargeId) || 0
          txMap.set(tx.rechargeId, existing + ((tx as any)[txField] || 0))
        }

        for (const record of records) {
          const recVal = ((record as any)[recordField] as number) || 0
          const txVal = txMap.get(record.id) || 0
          if (recVal !== txVal) {
            items.push({
              id: record.id,
              title: '充值记录',
              subtitle: format(new Date(record.createdAt), 'yyyy-MM-dd HH:mm'),
              actual: recVal,
              expected: txVal,
              diff: recVal - txVal,
              unit,
              reason:
                recVal > txVal
                  ? '充值金额大于流水记录'
                  : '充值流水记录缺失或偏少',
            })
            totalDiff += Math.abs(recVal - txVal)
          }
          if (items.length >= limit) break
        }
        break
      }

      case 'DIRECT_PAY': {
        const payments = await prisma.payment.findMany({
          where: {
            status: 'SUCCESS',
            method: { in: ['WECHAT', 'ALIPAY'] },
            ...(dateStr ? { createdAt: dateRange } : {}),
          },
          select: {
            id: true,
            amount: true,
            orderId: true,
            createdAt: true,
            method: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 2000,
        })

        const orderIds = payments.map((p) => p.orderId)
        const orders = await prisma.order.findMany({
          where: {
            id: { in: orderIds },
            status: { in: ['PAID', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'NO_SHOW'] },
          },
          select: {
            id: true,
            orderNo: true,
            amount: true,
            payMethod: true,
          },
        })

        const orderMap = new Map(orders.map((o) => [o.id, o]))

        for (const payment of payments) {
          const order = orderMap.get(payment.orderId)
          if (!order) {
            items.push({
              id: payment.id,
              title: '支付记录',
              subtitle: `${payment.method} · ${format(new Date(payment.createdAt), 'yyyy-MM-dd HH:mm')}`,
              actual: payment.amount,
              expected: 0,
              diff: payment.amount,
              unit: '元',
              reason: '支付成功但找不到对应订单',
              canAutoFix: false,
              fixHint: '在线支付涉及外部渠道流水，不能用余额调整单修复；请核对微信/支付宝交易单和订单来源。',
            })
            totalDiff += payment.amount
          } else if (payment.amount !== order.amount) {
            items.push({
              id: payment.id,
              title: order.orderNo,
              subtitle: `${payment.method} · ${format(new Date(payment.createdAt), 'yyyy-MM-dd HH:mm')}`,
              actual: payment.amount,
              expected: order.amount,
              diff: payment.amount - order.amount,
              unit: '元',
              reason: '支付金额与订单金额不一致',
              link: `/orders/${order.id}`,
              canAutoFix: false,
              fixHint: '在线支付金额不一致需要修正支付记录或订单金额，不能通过会员余额调整单平账。',
            })
            totalDiff += Math.abs(payment.amount - order.amount)
          }
          if (items.length >= limit) break
        }
        break
      }

      case 'CANCEL_REFUND':
      case 'REFUND': {
        const isCancelRefund = type === 'CANCEL_REFUND'
        const txType = isCancelRefund ? 'CANCEL_RESTORE' : 'REFUND'
        const orderStatus = isCancelRefund ? 'CANCELLED' : 'REFUNDED'
        const orderDateField = isCancelRefund ? 'cancelledAt' : 'updatedAt'
        const label = isCancelRefund ? '取消退费' : '退款'
        const refundTxs = await prisma.balanceTransaction.findMany({
          where: {
            type: txType,
            ...(dateStr ? { createdAt: dateRange } : {}),
          },
          select: {
            id: true,
            totalAmount: true,
            orderId: true,
            createdAt: true,
            remark: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 2000,
        })

        const orderIds = refundTxs
          .map((t) => t.orderId)
          .filter(Boolean) as string[]
        const orders = await prisma.order.findMany({
          where: {
            OR: [
              { id: { in: orderIds } },
              {
                status: orderStatus,
                ...(dateStr ? { [orderDateField]: dateRange } : {}),
              },
            ],
          },
          select: {
            id: true,
            orderNo: true,
            refundAmount: true,
            amount: true,
            userId: true,
            cancelledAt: true,
            updatedAt: true,
          },
        })

        const orderMap = new Map(orders.map((o) => [o.id, o]))
        const txMap = new Map<string, number>()
        for (const tx of refundTxs) {
          if (!tx.orderId) continue
          txMap.set(tx.orderId, (txMap.get(tx.orderId) || 0) + (tx.totalAmount || 0))
        }

        for (const order of orders) {
          const orderVal = order.refundAmount || 0
          if (orderVal === 0) continue
          const txVal = txMap.get(order.id) || 0
          if (txVal !== orderVal) {
            items.push({
              id: order.id,
              title: order.orderNo,
              subtitle: `订单金额 ¥${(order.amount / 100).toLocaleString()} · ${format(new Date(isCancelRefund ? (order.cancelledAt || order.updatedAt) : order.updatedAt), 'yyyy-MM-dd HH:mm')}`,
              actual: txVal,
              expected: orderVal,
              diff: txVal - orderVal,
              unit: '元',
              reason:
                txVal === 0
                  ? `订单已记录${label}金额，但缺少对应${label}流水`
                  : txVal < orderVal
                    ? `${label}流水金额少于订单${label}金额`
                    : `${label}流水金额多于订单${label}金额`,
              link: `/orders/${order.id}`,
              canAutoFix: true,
              fixHint: `系统将按差额补一条${label}流水，使${label}流水与订单${label}金额一致。`,
            })
            totalDiff += Math.abs(txVal - orderVal)
          }
          if (items.length >= limit) break
        }

        for (const tx of refundTxs) {
          if (!tx.orderId) continue
          const order = orderMap.get(tx.orderId)
          const txVal = tx.totalAmount || 0
          const orderVal = order?.refundAmount || 0

          if (!order) {
            items.push({
              id: tx.id,
              title: `${label}流水`,
              subtitle: tx.remark || '',
              actual: txVal,
              expected: 0,
              diff: txVal,
              unit: '元',
              reason: `${label}流水关联的订单不存在`,
            })
            totalDiff += txVal
          }
          if (items.length >= limit) break
        }
        break
      }

      case 'POINTS_EARN':
      case 'POINTS_GIFT':
      case 'POINTS_EXCHANGE': {
        const unit = '分'

        if (type === 'POINTS_EARN' || type === 'POINTS_GIFT') {
          // 积分发放/赠送：单边统计，diff 始终为 0
          // 列出按用户汇总的积分记录供参考
          const txType = type === 'POINTS_EARN' ? 'POINTS_EARN' : 'POINTS_GIFT'
          const label = type === 'POINTS_EARN' ? '积分发放累计' : '积分赠送累计'
          const txSums = await prisma.balanceTransaction.groupBy({
            by: ['userId'],
            where: { type: txType, ...(dateStr ? { createdAt: dateRange } : {}) },
            _sum: { pointsAmount: true },
            having: { pointsAmount: { _sum: { gt: 0 } } },
          })

          const userIds = txSums.map((t) => t.userId)
          const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
          const userMap = new Map(users.map((u) => [u.id, u]))

          for (const t of txSums) {
            const sum = (t._sum.pointsAmount as number) || 0
            items.push({
              id: t.userId,
              title: userMap.get(t.userId)?.name || '未知用户',
              subtitle: label,
              actual: sum,
              expected: sum,
              diff: 0,
              unit,
              reason: '单边统计',
            })
            if (items.length >= limit) break
          }
        } else {
          // POINTS_EXCHANGE：积分兑换消耗
          // 1. PointsExchange + PointsOrder 实际消耗
          const [exchanges, pOrders] = await Promise.all([
            prisma.pointsExchange.findMany({
              where: { ...(dateStr ? { createdAt: dateRange } : {}) },
              select: { id: true, userId: true, pointsCost: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 2000,
            }),
            prisma.pointsOrder.findMany({
              where: { status: { not: 'CANCELLED' }, ...(dateStr ? { createdAt: dateRange } : {}) },
              select: { id: true, userId: true, pointsCost: true, createdAt: true, orderNo: true },
              orderBy: { createdAt: 'desc' },
              take: 2000,
            }),
          ])

          // 2. BalanceTransaction POINTS_DEDUCT（orderId=null，即积分商城兑换）
          const txs = await prisma.balanceTransaction.findMany({
            where: { type: 'POINTS_DEDUCT', orderId: null, pointsAmount: { lt: 0 }, ...(dateStr ? { createdAt: dateRange } : {}) },
            select: { id: true, userId: true, pointsAmount: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 2000,
          })

          // 按用户聚合统计
          const exchangeSumByUser = new Map<string, number>()
          for (const e of exchanges) {
            exchangeSumByUser.set(e.userId, (exchangeSumByUser.get(e.userId) || 0) + e.pointsCost)
          }
          for (const o of pOrders) {
            exchangeSumByUser.set(o.userId, (exchangeSumByUser.get(o.userId) || 0) + o.pointsCost)
          }

          const txSumByUser = new Map<string, number>()
          for (const t of txs) {
            txSumByUser.set(t.userId, (txSumByUser.get(t.userId) || 0) + Math.abs(t.pointsAmount || 0))
          }

          // 所有有记录的用户
          const allUserIds = Array.from(new Set([...exchangeSumByUser.keys(), ...txSumByUser.keys()]))
          const users = await prisma.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, name: true },
          })
          const userMap = new Map(users.map((u) => [u.id, u]))

          for (const userId of allUserIds) {
            const exSum = exchangeSumByUser.get(userId) || 0
            const txSum = txSumByUser.get(userId) || 0
            if (exSum !== txSum) {
              items.push({
                id: userId,
                title: userMap.get(userId)?.name || '未知用户',
                subtitle: `兑换消耗 ${exSum}分 / 流水扣减 ${txSum}分`,
                actual: exSum,
                expected: txSum,
                diff: exSum - txSum,
                unit,
                reason: exSum > txSum ? '兑换记录多于流水扣减' : '流水扣减多于兑换记录',
                link: `/users/${userId}`,
              })
              totalDiff += Math.abs(exSum - txSum)
            }
            if (items.length >= limit) break
          }
        }
        break
      }

      case 'COUPON_GIFT':
      case 'EXPERIENCE_GIFT':
      case 'COUPON_USED':
      case 'EXPERIENCE_USED': {
        const isGift = type === 'COUPON_GIFT' || type === 'EXPERIENCE_GIFT'
        const couponType = type === 'COUPON_GIFT' || type === 'COUPON_USED' ? 'DISCOUNT' : 'EXPERIENCE_FREE'
        const label = isGift ? '赠送' : '核销'
        const name = couponType === 'DISCOUNT' ? '折扣券' : '体验券'

        const where: any = {
          type: couponType,
          ...(isGift ? { source: 'MANUAL_GIFT' } : { status: 'USED' }),
          ...(dateStr ? { [isGift ? 'createdAt' : 'usedAt']: dateRange } : {}),
        }

        const records = await prisma.userCoupon.findMany({
          where,
          include: { user: { select: { id: true, name: true } } },
          orderBy: { [isGift ? 'createdAt' : 'usedAt']: 'desc' },
          take: limit,
        })

        for (const r of records) {
          items.push({
            id: r.id,
            title: r.user?.name || '未知用户',
            subtitle: `${label}${name}`,
            actual: 1,
            expected: 1,
            diff: 0,
            unit: '张',
            reason: r.giftReason || (r.source === 'MANUAL_GIFT' ? '管理员赠送' : '用户核销'),
            link: `/users/${r.userId}`,
          })
        }
        break
      }

      default:
        return error(res, '未知的差异类型: ' + type, 400)
    }

    return success(res, {
      type,
      mode,
      date: dateStr || null,
      totalDiff,
      items,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 修复对账差异
 * POST /finance/fix-reconcile-diff
 */
export async function fixReconcileDiff(req: AuthenticatedRequest, res: Response) {
  const { type, targetId, diff, reason } = req.body
  if (!type || !targetId || diff === undefined || diff === null) {
    return error(res, '参数不完整: type, targetId, diff 均为必填', 400)
  }
  const cleanReason = typeof reason === 'string' ? reason.trim() : ''
  if (!cleanReason || cleanReason.length < 4) {
    return error(res, '请填写至少 4 个字的修复原因', 400)
  }

  try {
    let userId: string | null = null
    let shouldUpdateUserBalance = false
    let txData: any = {
      amount: Math.abs(diff),
      totalAmount: Math.abs(diff),
      remark: `对账差异修复: ${type}；原因：${cleanReason}`,
    }

    switch (type) {
      case 'BALANCE_PRINCIPAL': {
        userId = targetId
        txData.type = 'ADJUSTMENT'
        txData.principalAmount = diff
        txData.totalAmount = diff
        break
      }
      case 'BALANCE_BONUS': {
        userId = targetId
        txData.type = 'ADJUSTMENT'
        txData.bonusAmount = diff
        txData.totalAmount = diff
        break
      }
      case 'BALANCE_POINTS': {
        userId = targetId
        txData.type = diff >= 0 ? 'POINTS_EARN' : 'POINTS_DEDUCT'
        txData.pointsAmount = diff
        txData.amount = 0
        txData.totalAmount = 0
        break
      }
      case 'CONSUME_PRINCIPAL': {
        const order = await prisma.order.findUnique({
          where: { id: targetId },
          select: { userId: true, principalDeduction: true },
        })
        const txs = await prisma.balanceTransaction.findMany({
          where: { type: 'DEDUCT', orderId: targetId },
          select: { userId: true, principalAmount: true },
        })
        userId = order?.userId || txs[0]?.userId || null
        const currentTx = txs.reduce((sum, tx) => sum + (tx.principalAmount || 0), 0)
        const orderVal = order?.principalDeduction || 0
        const delta = -orderVal - currentTx
        if (delta === 0) return success(res, { alreadyBalanced: true, type, targetId }, '该差异已平衡，无需重复生成调整单')
        txData.type = 'DEDUCT'
        txData.orderId = targetId
        txData.principalAmount = delta
        txData.totalAmount = delta
        txData.amount = Math.abs(delta)
        break
      }
      case 'CONSUME_BONUS': {
        const order = await prisma.order.findUnique({
          where: { id: targetId },
          select: { userId: true, bonusDeduction: true },
        })
        const txs = await prisma.balanceTransaction.findMany({
          where: { type: 'DEDUCT', orderId: targetId },
          select: { userId: true, bonusAmount: true },
        })
        userId = order?.userId || txs[0]?.userId || null
        const currentTx = txs.reduce((sum, tx) => sum + (tx.bonusAmount || 0), 0)
        const orderVal = order?.bonusDeduction || 0
        const delta = -orderVal - currentTx
        if (delta === 0) return success(res, { alreadyBalanced: true, type, targetId }, '该差异已平衡，无需重复生成调整单')
        txData.type = 'DEDUCT'
        txData.orderId = targetId
        txData.bonusAmount = delta
        txData.totalAmount = delta
        txData.amount = Math.abs(delta)
        break
      }
      case 'RECHARGE_PRINCIPAL': {
        const recharge = await prisma.rechargeRecord.findUnique({
          where: { id: targetId },
          select: { userId: true },
        })
        userId = recharge?.userId || null
        txData.type = 'RECHARGE'
        txData.rechargeId = targetId
        txData.principalAmount = diff
        txData.totalAmount = diff
        break
      }
      case 'RECHARGE_BONUS': {
        const recharge = await prisma.rechargeRecord.findUnique({
          where: { id: targetId },
          select: { userId: true },
        })
        userId = recharge?.userId || null
        txData.type = 'RECHARGE'
        txData.rechargeId = targetId
        txData.bonusAmount = diff
        txData.totalAmount = diff
        break
      }
      case 'DIRECT_PAY': {
        return error(res, '在线支付差异不能通过余额调整单修复，请核对支付渠道流水和订单金额后修正原始记录', 400)
      }
      case 'CANCEL_REFUND':
      case 'REFUND': {
        const isCancelRefund = type === 'CANCEL_REFUND'
        const txType = isCancelRefund ? 'CANCEL_RESTORE' : 'REFUND'
        const order = await prisma.order.findUnique({
          where: { id: targetId },
          select: { id: true, userId: true, refundAmount: true },
        })
        let orderId = order?.id || null
        userId = order?.userId || null

        if (!orderId) {
          const tx = await prisma.balanceTransaction.findUnique({
            where: { id: targetId },
            select: { orderId: true, userId: true },
          })
          orderId = tx?.orderId || null
          userId = tx?.userId || null
        }

        if (!orderId) {
          return error(res, '退款差异缺少订单关联，不能自动生成调整单，请先人工定位退款来源', 400)
        }

        const refundOrder = order || await prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true, userId: true, refundAmount: true },
        })
        userId = userId || refundOrder?.userId || null
        const txSum = await prisma.balanceTransaction.aggregate({
          where: { type: txType, orderId },
          _sum: { totalAmount: true },
        })
        const currentTx = txSum._sum?.totalAmount || 0
        const orderVal = refundOrder?.refundAmount || 0
        const delta = orderVal - currentTx
        if (delta === 0) {
          return success(res, { alreadyBalanced: true, type, targetId: orderId }, '该差异已平衡，无需重复生成调整单')
        }
        txData.type = txType
        txData.orderId = orderId
        txData.amount = Math.abs(delta)
        txData.totalAmount = delta
        break
      }
      case 'POINTS_EXCHANGE': {
        userId = targetId
        txData.type = diff >= 0 ? 'POINTS_EARN' : 'POINTS_DEDUCT'
        txData.pointsAmount = diff
        txData.amount = 0
        txData.totalAmount = 0
        break
      }
      case 'POINTS_EARN':
      case 'POINTS_GIFT':
      case 'COUPON_GIFT':
      case 'EXPERIENCE_GIFT':
      case 'COUPON_USED':
      case 'EXPERIENCE_USED':
        return error(res, '该类型为单边统计，无需修复', 400)
      default:
        return error(res, `不支持的对账类型: ${type}`, 400)
    }

    if (!userId) {
      return error(res, '无法确定关联用户，无法执行修复', 400)
    }

    const userBefore = await prisma.user.findUnique({
      where: { id: userId },
      select: { principalBalance: true, bonusBalance: true, points: true },
    })
    const operator = currentUser(req)

    const tx = await prisma.$transaction(async (db) => {
      const balanceTx = await db.balanceTransaction.create({
        data: { ...txData, userId },
      })

      if (shouldUpdateUserBalance && txData.principalAmount) {
        await db.user.update({
          where: { id: userId! },
          data: { principalBalance: { increment: txData.principalAmount } },
        })
      }
      if (shouldUpdateUserBalance && txData.bonusAmount) {
        await db.user.update({
          where: { id: userId! },
          data: { bonusBalance: { increment: txData.bonusAmount } },
        })
      }
      if (shouldUpdateUserBalance && txData.pointsAmount && txData.type !== 'ADJUSTMENT') {
        await db.user.update({
          where: { id: userId! },
          data: { points: { increment: txData.pointsAmount } },
        })
      }

      const userAfter = await db.user.findUnique({
        where: { id: userId! },
        select: { principalBalance: true, bonusBalance: true, points: true },
      })

      const financeAdjustmentNo = adjustmentNo()
      const adjustment = await db.financeAdjustment.create({
        data: {
          adjustmentNo: financeAdjustmentNo,
          source: 'RECONCILE_DETAIL',
          type,
          status: 'EXECUTED',
          targetType: 'RECONCILE',
          targetId,
          targetDesc: `对账差异修复 - ${type}`,
          amount: Math.abs(txData.totalAmount || txData.amount || 0),
          pointsAmount: Math.abs(txData.pointsAmount || 0),
          beforeValue: { diff, user: userBefore },
          afterValue: { txData, userId, balanceTransactionId: balanceTx.id, user: userAfter },
          reason: cleanReason,
          operatorId: operator.id,
          operatorName: operator.name,
          operatorRole: operator.role,
        },
        select: {
          id: true,
          adjustmentNo: true,
          amount: true,
          pointsAmount: true,
          executedAt: true,
        },
      })

      return { balanceTx, adjustment, userAfter }
    })

    await logAudit(req, {
      targetType: 'RECONCILE',
      targetId: targetId,
      targetDesc: `对账差异修复 - ${type}`,
      action: 'POST',
      actionName: '修复对账差异',
      beforeValue: { diff, user: userBefore },
      afterValue: { txData, userId, adjustmentId: tx.adjustment.id, adjustmentNo: tx.adjustment.adjustmentNo, balanceTransactionId: tx.balanceTx.id, user: tx.userAfter },
      amount: Math.abs(diff),
      reason: cleanReason,
    })

    return success(res, {
      type,
      targetId,
      diff,
      userId,
      reason: cleanReason,
      balanceTransactionId: tx.balanceTx.id,
      adjustmentId: tx.adjustment.id,
      adjustmentNo: tx.adjustment.adjustmentNo,
      adjustmentAmount: tx.adjustment.amount,
      adjustmentPointsAmount: tx.adjustment.pointsAmount,
      executedAt: tx.adjustment.executedAt,
      userBefore,
      userAfter: tx.userAfter,
      txData,
    }, shouldUpdateUserBalance
      ? '修复成功，已创建调整流水并同步更新用户余额'
      : '修复成功，已创建调整流水并更新对账结果')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 全平台累计数据汇总
 * GET /finance/total-summary
 */
export async function totalSummary(req: AuthenticatedRequest, res: Response) {
  try {
    // 1. 现金解缴累计
    const rechargeSum = await prisma.rechargeRecord.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
    })

    const directPaySum = await prisma.payment.aggregate({
      where: {
        status: 'SUCCESS',
        method: { in: ['WECHAT', 'ALIPAY'] },
      },
      _sum: { amount: true },
    })

    const cashRefundSum = await prisma.order.aggregate({
      where: {
        status: { in: ['REFUNDED', 'CANCELLED'] },
        payMethod: { in: ['WECHAT', 'ALIPAY'] },
      },
      _sum: { refundAmount: true },
    })

    const cancelRefundSum = await prisma.order.aggregate({
      where: {
        status: 'CANCELLED',
      },
      _sum: { refundAmount: true },
    })

    const refundDispositionSum = await prisma.order.aggregate({
      where: {
        status: 'REFUNDED',
      },
      _sum: { refundAmount: true },
    })

    const customerRefundSum = await prisma.order.aggregate({
      where: {
        status: { in: ['REFUNDED', 'CANCELLED'] },
      },
      _sum: { refundAmount: true },
    })

    const balanceRefundSum = await prisma.balanceTransaction.aggregate({
      where: { type: { in: ['REFUND', 'CANCEL_RESTORE'] } },
      _sum: { totalAmount: true },
    })

    // 2. 确权营收累计（含预付/已核销拆分）
    const prepaidDirectRevenueSum = await prisma.order.aggregate({
      where: {
        status: 'PAID',
        payMethod: { in: ['WECHAT', 'ALIPAY'] },
      },
      _sum: { amount: true },
    })

    const confirmedDirectRevenueSum = await prisma.order.aggregate({
      where: {
        status: 'COMPLETED',
        payMethod: { in: ['WECHAT', 'ALIPAY'] },
      },
      _sum: { amount: true },
    })

    const prepaidMemberRevenueSum = await prisma.order.aggregate({
      where: {
        status: 'PAID',
        principalDeduction: { gt: 0 },
      },
      _sum: { principalDeduction: true },
    })

    const confirmedMemberRevenueSum = await prisma.order.aggregate({
      where: {
        status: 'COMPLETED',
        principalDeduction: { gt: 0 },
      },
      _sum: { principalDeduction: true },
    })

    // 作废未退收入累计（兼容历史违约金字段）
    const noShowOrders = await prisma.order.findMany({
      where: { status: 'NO_SHOW' },
      select: { amount: true, refundAmount: true, penaltyAmount: true },
    })

    const pointsExchangeCostSum = await prisma.pointsExchange.aggregate({
      _sum: { pointsCost: true },
    })

    const pointsOrderCostSum = await prisma.pointsOrder.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { pointsCost: true },
    })

    const couponDiscountCostSum = await prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'COMPLETED'] },
        couponDiscount: { gt: 0 },
      },
      _sum: { couponDiscount: true },
    })

    const pointsGiftCostSum = await prisma.balanceTransaction.aggregate({
      where: { type: 'POINTS_GIFT' },
      _sum: { pointsAmount: true },
    })

    // 3. 优惠券/体验券累计统计
    const totalCouponGift = await prisma.userCoupon.count({
      where: { source: 'MANUAL_GIFT', type: 'DISCOUNT' }
    })
    const totalExperienceGift = await prisma.userCoupon.count({
      where: { source: 'MANUAL_GIFT', type: 'EXPERIENCE_FREE' }
    })
    const totalCouponCampaign = await prisma.userCoupon.count({
      where: { source: 'CAMPAIGN', type: 'DISCOUNT' }
    })
    const totalExperienceCampaign = await prisma.userCoupon.count({
      where: { source: 'CAMPAIGN', type: 'EXPERIENCE_FREE' }
    })
    const totalCouponUsed = await prisma.userCoupon.count({
      where: { type: 'DISCOUNT', status: 'USED' }
    })
    const totalExperienceUsed = await prisma.userCoupon.count({
      where: { type: 'EXPERIENCE_FREE', status: 'USED' }
    })
    const totalCouponUnused = await prisma.userCoupon.count({
      where: { type: 'DISCOUNT', status: 'UNUSED' }
    })
    const totalExperienceUnused = await prisma.userCoupon.count({
      where: { type: 'EXPERIENCE_FREE', status: 'UNUSED' }
    })

    // 4. 负债存量（当前值）
    const principalLiability = await prisma.user.aggregate({
      _sum: { principalBalance: true },
    })
    const bonusLiability = await prisma.user.aggregate({
      _sum: { bonusBalance: true },
    })

    const ninetyDaysAgo = subDays(new Date(), 90)
    const dormantUsers = await prisma.user.findMany({
      where: {
        principalBalance: { gt: 0 },
        transactions: { none: { createdAt: { gte: ninetyDaysAgo } } },
      },
      select: { principalBalance: true },
    })
    const dormantPrincipal = dormantUsers.reduce((s, u) => s + u.principalBalance, 0)

    const rpi = rechargeSum._sum?.amount || 0
    const dpi = directPaySum._sum?.amount || 0
    const cashRefundOut = cashRefundSum._sum?.refundAmount || 0
    const cancelRefundOut = cancelRefundSum._sum?.refundAmount || 0
    const refundDispositionOut = refundDispositionSum._sum?.refundAmount || 0
    const customerRefundOut = customerRefundSum._sum?.refundAmount || 0
    const balanceRefundOut = balanceRefundSum._sum?.totalAmount || 0
    const pdr = prepaidDirectRevenueSum._sum?.amount || 0
    const cdr = confirmedDirectRevenueSum._sum?.amount || 0
    const pmr = prepaidMemberRevenueSum._sum?.principalDeduction || 0
    const cmr = confirmedMemberRevenueSum._sum?.principalDeduction || 0
    const nsp = noShowOrders.reduce((sum, order) => sum + noShowRetainedIncome(order), 0)
    const pec = (pointsExchangeCostSum._sum?.pointsCost || 0) + (pointsOrderCostSum._sum?.pointsCost || 0)
    const pgc = pointsGiftCostSum._sum?.pointsAmount || 0
    const cdc = couponDiscountCostSum._sum?.couponDiscount || 0
    const tpl = principalLiability._sum?.principalBalance || 0
    const tbl = bonusLiability._sum?.bonusBalance || 0
    const ptsLiability = await prisma.user.aggregate({
      _sum: { points: true }
    })
    const pointsLiab = ptsLiability._sum.points || 0

    return success(res, {
      // 现金解缴累计
      totalRechargePrincipalIn: rpi,
      totalDirectPayIn: dpi,
      totalRefundOut: cashRefundOut,
      totalCashRefundOut: cashRefundOut,
      totalBalanceRefundOut: balanceRefundOut,
      totalCustomerRefundOut: customerRefundOut,
      totalCancelRefundOut: cancelRefundOut,
      totalRefundDispositionOut: refundDispositionOut,
      totalNetCashFlow: rpi + dpi - cashRefundOut,

      // 确权营收累计
      totalDirectRevenue: pdr + cdr,
      totalMemberPrincipalRevenue: pmr + cmr,
      totalRecognizedRevenue: pdr + cdr + pmr + cmr,
      totalPrepaidDirectRevenue: pdr,
      totalConfirmedDirectRevenue: cdr,
      totalPrepaidMemberRevenue: pmr,
      totalConfirmedMemberRevenue: cmr,
      totalNoShowPenalty: nsp,
      totalPointsExchangeCost: pec,
      totalPointsGiftCost: pgc,
      totalCouponDiscountCost: cdc,

      // 优惠券/体验券累计
      totalCouponGift,
      totalExperienceGift,
      totalCouponCampaign,
      totalExperienceCampaign,
      totalCouponUsed,
      totalExperienceUsed,
      totalCouponUnused,
      totalExperienceUnused,

      // 负债存量
      totalPrincipalLiability: tpl,
      totalBonusLiability: tbl,
      totalPointsLiability: pointsLiab,
      dormantPrincipal,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
