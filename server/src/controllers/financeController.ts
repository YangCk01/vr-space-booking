import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, paginated, error } from '../utils/response'
import { startOfDay, endOfDay, subDays, format } from 'date-fns'
import { getConfig, updateConfig } from '../services/configService'
import { logAudit } from '../middleware/auditLog'

/* ─── Local business day boundaries ─── */
function dayStart(dateStr: string): Date { return startOfDay(new Date(dateStr + 'T00:00:00')) }
function dayEnd(dateStr: string): Date { return endOfDay(new Date(dateStr + 'T00:00:00')) }

function noShowRetainedIncome(order: { amount: number; refundAmount?: number | null; penaltyAmount?: number | null }): number {
  if (order.penaltyAmount != null) return Math.max(0, order.penaltyAmount)
  const refunded = order.refundAmount || 0
  return Math.max(0, order.amount - refunded)
}

function orderIncomeTime(order: { paidAt?: Date | null; createdAt: Date }): Date {
  return order.paidAt || order.createdAt
}

function orderCancelTime(order: { cancelledAt?: Date | null; updatedAt: Date; createdAt: Date }): Date {
  return order.cancelledAt || order.updatedAt || order.createdAt
}

function orderRefundTime(order: { cancelledAt?: Date | null; updatedAt: Date; createdAt: Date }): Date {
  return order.cancelledAt || order.updatedAt || order.createdAt
}

const defaultAuditConfig = {
  taxRate: 6,
  paymentFeeRates: {
    WECHAT: 0.6,
    ALIPAY: 0.6,
    CASH: 0,
    BALANCE: 0,
    BALANCE_POINTS: 0,
    CARD: 0.6,
  },
  platformFeeRates: {
    MEITUAN: 6,
    DOUYIN: 5,
    DIANPING: 6,
  },
  settlementCycles: {
    WECHAT: 'T+1',
    ALIPAY: 'T+1',
    CASH: '实时',
    BALANCE: '实时',
    BALANCE_POINTS: '实时',
    CARD: 'T+1',
    MEITUAN: 'T+3',
    DOUYIN: 'T+3',
    DIANPING: 'T+7',
  },
}

export function auditConfig() {
  return {
    taxRate: Number(getConfig('finance_tax_rate', defaultAuditConfig.taxRate)),
    paymentFeeRates: {
      ...defaultAuditConfig.paymentFeeRates,
      ...(getConfig('finance_payment_fee_rates', {}) as Record<string, number>),
    } as Record<string, number>,
    platformFeeRates: {
      ...defaultAuditConfig.platformFeeRates,
      ...(getConfig('finance_platform_fee_rates', {}) as Record<string, number>),
    } as Record<string, number>,
    settlementCycles: {
      ...defaultAuditConfig.settlementCycles,
      ...(getConfig('finance_settlement_cycles', {}) as Record<string, string>),
    } as Record<string, string>,
  }
}

function readMeta(metadata: unknown): Record<string, any> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, any> : {}
}

function roundFee(amount: number, rate: number) {
  return Math.round(amount * rate / 100)
}

export function paymentLabel(method?: string | null) {
  const labels: Record<string, string> = {
    WECHAT: '微信支付',
    ALIPAY: '支付宝',
    BALANCE: '储值余额',
    BALANCE_POINTS: '余额+积分',
    CASH: '现金',
    CARD: '刷卡',
  }
  return method ? labels[method] || method : '-'
}

export function computeAuditStatus(actualRecv: number, expectedRecv: number, consumeStatus: string, bankStatus: string) {
  if (consumeStatus === 'refunded') return 'refunded'
  if (bankStatus === 'internal') return 'matched'
  const diff = actualRecv - expectedRecv
  if (diff < -1) return 'short'
  if (diff > 1) return 'over'
  return 'matched'
}

export function buildVouchers(record: any, taxRate: number) {
  const revenue = Math.round(record.expectedRecv / (1 + taxRate / 100))
  const tax = record.expectedRecv - revenue
  if (record.consumeStatus === 'recharge') {
    return [
      { subject: '银行存款', debit: record.actualRecv, credit: 0, summary: '会员充值实收' },
      { subject: '销售费用-支付手续费', debit: Math.abs(record.gatewayFee), credit: 0, summary: '充值支付手续费' },
      { subject: '合同负债-会员本金', debit: 0, credit: record.assetChange?.principal || record.expectedRecv, summary: '会员充值本金' },
      { subject: '合同负债-会员赠金', debit: 0, credit: record.assetChange?.gift || 0, summary: '会员充值赠金' },
    ]
  }
  if (record.consumeStatus === 'refunded') {
    return [
      { subject: '主营业务收入', debit: Math.abs(revenue), credit: 0, summary: '退款冲减收入' },
      { subject: '应交税费-应交增值税（销项）', debit: Math.abs(tax), credit: 0, summary: '退款冲减销项税' },
      { subject: '银行存款', debit: 0, credit: Math.abs(record.actualRecv), summary: '退款原路退回' },
    ]
  }
  if (record.paymentMethod === '储值余额' || record.paymentMethod === '余额+积分') {
    return [
      { subject: '合同负债-会员储值', debit: record.expectedRecv, credit: 0, summary: '储值余额核销' },
      { subject: '主营业务收入', debit: 0, credit: revenue, summary: '确认收入' },
      { subject: '应交税费-应交增值税（销项）', debit: 0, credit: tax, summary: '计提销项税' },
    ]
  }
  return [
    { subject: '应收账款/银行存款', debit: record.actualRecv, credit: 0, summary: '实际收款资产' },
    { subject: '销售费用-平台及支付通道费', debit: Math.abs(record.platformFee) + Math.abs(record.gatewayFee), credit: 0, summary: '平台与支付手续费' },
    { subject: '主营业务收入', debit: 0, credit: revenue, summary: '确认收入' },
    { subject: '应交税费-应交增值税（销项）', debit: 0, credit: tax, summary: '计提销项税' },
  ]
}

/* ─── 1. 财务概览 ─── */
export async function overview(req: AuthenticatedRequest, res: Response) {
  const { range = '7days', startDate, endDate, venueId } = req.query

  // Parse date range
  let start: Date, end: Date
  const now = new Date()
  if (startDate && endDate) {
    start = dayStart(startDate as string)
    end = dayEnd(endDate as string)
  } else if (range === 'today') {
    start = dayStart(format(now, 'yyyy-MM-dd'))
    end = dayEnd(format(now, 'yyyy-MM-dd'))
  } else if (range === '30days') {
    start = dayStart(format(subDays(now, 29), 'yyyy-MM-dd'))
    end = dayEnd(format(now, 'yyyy-MM-dd'))
  } else {
    start = dayStart(format(subDays(now, 6), 'yyyy-MM-dd'))
    end = dayEnd(format(now, 'yyyy-MM-dd'))
  }

  const todayStart = dayStart(format(now, 'yyyy-MM-dd'))
  const todayEnd = dayEnd(format(now, 'yyyy-MM-dd'))

  // Parallel queries
  const [
    todayRevenue,
    todayRefund,
    todayCancelRefund,
    todayRecharge,
    totalUserBalance,
    dailyOrders,
    dailyRecharges,
  ] = await Promise.all([
    // 今日营收（已支付 + 已核销，仅消费订单）
    prisma.order.aggregate({
      where: {
        orderKind: 'NORMAL',
        paidAt: { gte: todayStart, lte: todayEnd },
        status: { in: ['PAID', 'COMPLETED'] },
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      _sum: { amount: true },
    }),
    // 今日退款处置（不含顾客取消订单退费）
    prisma.order.aggregate({
      where: {
        orderKind: 'NORMAL',
        updatedAt: { gte: todayStart, lte: todayEnd },
        status: 'REFUNDED',
        refundAmount: { gt: 0 },
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      _sum: { refundAmount: true },
    }),
    // 今日取消退费（顾客取消订单产生的退回金额）
    prisma.order.aggregate({
      where: {
        orderKind: 'NORMAL',
        cancelledAt: { gte: todayStart, lte: todayEnd },
        status: 'CANCELLED',
        refundAmount: { gt: 0 },
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      _sum: { refundAmount: true },
    }),
    // 今日充值
    prisma.rechargeRecord.aggregate({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        status: 'PAID',
      },
      _sum: { amount: true },
    }),
    // 用户余额总额（双钱包：本金 + 赠送）
    prisma.user.aggregate({ _sum: { principalBalance: true, bonusBalance: true } }),
    // 每日订单（趋势）
    prisma.order.findMany({
      where: {
        orderKind: { not: 'GROUP_PARENT' },
        OR: [
          { createdAt: { gte: start, lte: end } },
          { paidAt: { gte: start, lte: end } },
          { cancelledAt: { gte: start, lte: end } },
          {
            status: { in: ['NO_SHOW', 'REFUNDED'] },
            OR: [
              { noShowAt: { gte: start, lte: end } },
              { updatedAt: { gte: start, lte: end } },
            ],
          },
        ],
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      select: {
        createdAt: true,
        amount: true,
        status: true,
        refundAmount: true,
        penaltyAmount: true,
        rescheduleFeeAmount: true,
        orderKind: true,
        feeType: true,
        paidAt: true,
        cancelledAt: true,
        noShowAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    // 每日充值（趋势）
    prisma.rechargeRecord.findMany({
      where: { createdAt: { gte: start, lte: end }, status: 'PAID' },
      select: { createdAt: true, amount: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // Build daily trend map
  const trendMap = new Map<string, { revenue: number; refund: number; cancelRefund: number; recharge: number; otherIncome: number; rescheduleFee: number; noShowPenalty: number; cancelFee: number }>()
  const dateKeys: string[] = []
  let cursor = new Date(start)
  while (cursor <= end) {
    const key = format(cursor, 'yyyy-MM-dd')
    dateKeys.push(key)
    trendMap.set(key, { revenue: 0, refund: 0, cancelRefund: 0, recharge: 0, otherIncome: 0, rescheduleFee: 0, noShowPenalty: 0, cancelFee: 0 })
    cursor = new Date(cursor.getTime() + 86400000)
  }

  for (const o of dailyOrders) {
    // 改签费订单：按支付日期统计
    if (o.orderKind === 'FEE' && o.feeType === 'RESCHEDULE_FEE' && o.status === 'PAID' && o.paidAt) {
      const key = format(o.paidAt, 'yyyy-MM-dd')
      const entry = trendMap.get(key)
      if (!entry) continue
      entry.rescheduleFee += o.amount
      entry.otherIncome += o.amount
      continue
    }

    // 消费订单营收 / 退款 / 营业外收入
    if (o.orderKind === 'NORMAL' || !o.orderKind) {
      if (o.status === 'PAID' || o.status === 'COMPLETED') {
        const key = format(orderIncomeTime(o), 'yyyy-MM-dd')
        const entry = trendMap.get(key)
        if (!entry) continue
        entry.revenue += o.amount
      }
      if (o.status === 'REFUNDED' && o.refundAmount) {
        const key = format(orderRefundTime(o), 'yyyy-MM-dd')
        const entry = trendMap.get(key)
        if (!entry) continue
        entry.refund += o.refundAmount
      }
      if (o.status === 'CANCELLED' && o.refundAmount) {
        const key = format(orderCancelTime(o), 'yyyy-MM-dd')
        const entry = trendMap.get(key)
        if (!entry) continue
        entry.cancelRefund += o.refundAmount
      }
      // 取消订单：未退部分作为取消费收入
      if (o.status === 'CANCELLED' && o.refundAmount != null) {
        const key = format(orderCancelTime(o), 'yyyy-MM-dd')
        const entry = trendMap.get(key)
        if (!entry) continue
        const cancelFee = o.amount - o.refundAmount
        if (cancelFee > 0) {
          entry.cancelFee += cancelFee
          entry.otherIncome += cancelFee
        }
      }
      // 作废未退款：实收未退部分作为营业外收入单独展示
      if (o.status === 'NO_SHOW') {
        const key = format(o.noShowAt || o.updatedAt || o.createdAt, 'yyyy-MM-dd')
        const entry = trendMap.get(key)
        if (!entry) continue
        const retainedIncome = noShowRetainedIncome(o)
        if (retainedIncome > 0) {
          entry.noShowPenalty += retainedIncome
          entry.otherIncome += retainedIncome
        }
      }
    }
  }

  for (const r of dailyRecharges) {
    const key = format(r.createdAt, 'yyyy-MM-dd')
    const entry = trendMap.get(key)
    if (entry) entry.recharge += r.amount
  }

  const revenueTrend = dateKeys.map((date) => ({
    date,
    revenue: trendMap.get(date)!.revenue,
    refund: trendMap.get(date)!.refund,
    cancelRefund: trendMap.get(date)!.cancelRefund,
    recharge: trendMap.get(date)!.recharge,
    otherIncome: trendMap.get(date)!.otherIncome,
    rescheduleFee: trendMap.get(date)!.rescheduleFee,
    noShowPenalty: trendMap.get(date)!.noShowPenalty,
    cancelFee: trendMap.get(date)!.cancelFee,
  }))

  // Aggregate period totals from trend data
  const periodRevenue = revenueTrend.reduce((s, d) => s + d.revenue, 0)
  const periodRefund = revenueTrend.reduce((s, d) => s + d.refund, 0)
  const periodCancelRefund = revenueTrend.reduce((s, d) => s + d.cancelRefund, 0)
  const periodRecharge = revenueTrend.reduce((s, d) => s + d.recharge, 0)
  const periodOtherIncome = revenueTrend.reduce((s, d) => s + d.otherIncome, 0)
  const periodRescheduleFee = revenueTrend.reduce((s, d) => s + d.rescheduleFee, 0)
  const periodNoShowPenalty = revenueTrend.reduce((s, d) => s + d.noShowPenalty, 0)
  const periodCancelFee = revenueTrend.reduce((s, d) => s + d.cancelFee, 0)

  // 今日营业外收入
  const todayKey = format(now, 'yyyy-MM-dd')
  const todayEntry = trendMap.get(todayKey)
  const todayOtherIncome = todayEntry?.otherIncome || 0

  // Member recharge consumption: orders paid with BALANCE or BALANCE_POINTS within period
  const rechargeConsumption = await prisma.order.aggregate({
    where: {
      orderKind: 'NORMAL',
      paidAt: { gte: start, lte: end },
      status: { in: ['PAID', 'COMPLETED'] },
      payMethod: { in: ['BALANCE', 'BALANCE_POINTS'] },
      ...(venueId ? { venueId: venueId as string } : {}),
    },
    _sum: { amount: true },
  })

  return success(res, {
    todayRevenue: todayRevenue._sum.amount || 0,
    todayRefund: todayRefund._sum.refundAmount || 0,
    todayCancelRefund: todayCancelRefund._sum.refundAmount || 0,
    todayRecharge: todayRecharge._sum.amount || 0,
    todayOtherIncome,
    totalUserBalance: (totalUserBalance._sum.principalBalance || 0) + (totalUserBalance._sum.bonusBalance || 0),
    periodRevenue,
    periodRefund,
    periodCancelRefund,
    periodRecharge,
    periodOtherIncome,
    periodRescheduleFee,
    periodNoShowPenalty,
    periodCancelFee,
    periodRechargeConsumption: rechargeConsumption._sum.amount || 0,
    revenueTrend,
  })
}

/* ─── 2. 财务流水 ─── */
export async function flow(req: AuthenticatedRequest, res: Response) {
  const {
    startDate,
    endDate,
    types,
    payMethod,
    venueId,
    page = '1',
    pageSize = '20',
  } = req.query

  const pageNum = parseInt(page as string, 10)
  const sizeNum = parseInt(pageSize as string, 10)
  const typeList = types ? (types as string).split(',') : []
  const payMethodList = payMethod ? (payMethod as string).split(',') : []

  const dateWhere = {
    ...(startDate ? { gte: dayStart(startDate as string) } : {}),
    ...(endDate ? { lte: dayEnd(endDate as string) } : {}),
  }

  const hasDate = startDate || endDate

  // Type filter mapping
  const needOrders = typeList.length === 0 || typeList.includes('ORDER')
  const needRefunds = typeList.length === 0 || typeList.includes('REFUND')
  const needCancelRefunds = typeList.length === 0 || typeList.includes('CANCEL_REFUND')
  const needRecharges = typeList.length === 0 || typeList.includes('RECHARGE')
  const needRescheduleFees = typeList.length === 0 || typeList.includes('RESCHEDULE_FEE')
  // 余额流水默认不展示，避免与订单收入/退款重复；仅当用户显式筛选时展示
  const needBalanceTx = typeList.includes('BALANCE_DEDUCT') || typeList.includes('BALANCE_REFUND')

  const items: any[] = []

  // ── Orders (收入) ──
  if (needOrders) {
    const orders = await prisma.order.findMany({
      where: {
        ...(hasDate ? { paidAt: dateWhere } : {}),
        orderKind: 'NORMAL',
        status: { in: ['PAID', 'COMPLETED'] },
        ...(payMethodList.length ? { payMethod: { in: payMethodList as any } } : {}),
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    for (const o of orders) {
      items.push({
        id: o.id,
        type: 'ORDER',
        orderNo: o.orderNo,
        userName: (o as any).user?.name || '-',
        userPhone: (o as any).user?.phone || '-',
        amount: o.amount,
        payMethod: o.payMethod,
        remark: '订单收入',
        createdAt: orderIncomeTime(o).toISOString(),
      })
    }
  }

  // ── 作废未退收入（营业外收入） ──
  if (needOrders) {
    const noShowOrders = await prisma.order.findMany({
      where: {
        orderKind: 'NORMAL',
        status: 'NO_SHOW',
        ...(hasDate
          ? {
              OR: [
                { noShowAt: dateWhere },
                { noShowAt: null, updatedAt: dateWhere },
              ],
            }
          : {}),
        ...(payMethodList.length ? { payMethod: { in: payMethodList as any } } : {}),
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    for (const o of noShowOrders) {
      const amount = noShowRetainedIncome(o)
      if (amount <= 0) continue
      const flowTime = o.noShowAt || o.updatedAt || o.createdAt
      items.push({
        id: o.id,
        type: 'NO_SHOW_RETAINED',
        orderNo: o.orderNo,
        userName: (o as any).user?.name || '-',
        userPhone: (o as any).user?.phone || '-',
        amount,
        payMethod: o.payMethod,
        remark: '作废未退收入（营业外收入）',
        createdAt: flowTime.toISOString(),
      })
    }
  }

  // ── Orders (退款处置) ──
  if (needRefunds) {
    const refunds = await prisma.order.findMany({
      where: {
        ...(hasDate ? { updatedAt: dateWhere } : {}),
        orderKind: 'NORMAL',
        status: 'REFUNDED',
        refundAmount: { gt: 0 },
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    for (const o of refunds) {
      items.push({
        id: o.id,
        type: 'REFUND',
        orderNo: o.orderNo,
        userName: (o as any).user?.name || '-',
        userPhone: (o as any).user?.phone || '-',
        amount: -(o.refundAmount || 0),
        payMethod: o.payMethod,
        remark: '退款处置',
        createdAt: orderRefundTime(o).toISOString(),
      })
    }
  }

  // ── Orders (取消退费) ──
  if (needCancelRefunds) {
    const cancelRefunds = await prisma.order.findMany({
      where: {
        ...(hasDate ? { cancelledAt: dateWhere } : {}),
        orderKind: 'NORMAL',
        status: 'CANCELLED',
        refundAmount: { gt: 0 },
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
      },
      orderBy: { cancelledAt: 'desc' },
    })
    for (const o of cancelRefunds) {
      items.push({
        id: o.id,
        type: 'CANCEL_REFUND',
        orderNo: o.orderNo,
        userName: (o as any).user?.name || '-',
        userPhone: (o as any).user?.phone || '-',
        amount: -(o.refundAmount || 0),
        payMethod: o.payMethod,
        remark: '顾客取消订单退费',
        createdAt: orderCancelTime(o).toISOString(),
      })
    }
  }

  // ── 改签费收入 ──
  if (needRescheduleFees) {
    const feeOrders = await prisma.order.findMany({
      where: {
        ...(hasDate ? { paidAt: dateWhere } : {}),
        orderKind: 'FEE',
        feeType: 'RESCHEDULE_FEE',
        status: 'PAID',
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
        parentOrder: { select: { orderNo: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    for (const o of feeOrders) {
      items.push({
        id: o.id,
        type: 'RESCHEDULE_FEE',
        orderNo: o.orderNo,
        parentOrderNo: o.parentOrder?.orderNo || '-',
        userName: (o as any).user?.name || '-',
        userPhone: (o as any).user?.phone || '-',
        amount: o.amount,
        payMethod: o.payMethod,
        remark: o.feeReason || '改签手续费',
        createdAt: orderIncomeTime(o).toISOString(),
      })
    }
  }

  // ── Recharges ──
  // 充值记录不属于特定门店，门店筛选时跳过
  if (needRecharges && !venueId) {
    const recharges = await prisma.rechargeRecord.findMany({
      where: {
        ...(hasDate ? { createdAt: dateWhere } : {}),
        status: 'PAID',
        ...(payMethodList.length ? { payMethod: { in: payMethodList as any } } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    for (const r of recharges) {
      items.push({
        id: r.id,
        type: 'RECHARGE',
        orderNo: '-',
        userName: (r as any).user?.name || '-',
        userPhone: (r as any).user?.phone || '-',
        amount: r.amount,
        payMethod: r.payMethod,
        remark: '会员充值',
        createdAt: r.createdAt.toISOString(),
      })
    }
  }

  // ── Balance Transactions ──
  if (needBalanceTx) {
    const txTypes: string[] = []
    if (typeList.length === 0 || typeList.includes('BALANCE_DEDUCT')) txTypes.push('DEDUCT')
    if (typeList.length === 0 || typeList.includes('BALANCE_REFUND')) txTypes.push('REFUND', 'CANCEL_RESTORE')

    if (txTypes.length) {
      // 若按门店筛选，先查出该门店的所有订单 ID，再通过 orderId 过滤余额交易
      let venueOrderIds: string[] = []
      if (venueId) {
        const venueOrders = await prisma.order.findMany({
          where: { venueId: venueId as string },
          select: { id: true },
        })
        venueOrderIds = venueOrders.map((o) => o.id)
      }

      // 门店筛选下若该门店没有任何订单，则跳过余额交易
      if (!venueId || venueOrderIds.length > 0) {
        const btxs = await prisma.balanceTransaction.findMany({
          where: {
            ...(hasDate ? { createdAt: dateWhere } : {}),
            type: { in: txTypes },
            ...(venueId ? { orderId: { in: venueOrderIds } } : {}),
          },
          include: {
            user: { select: { name: true, phone: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
        // Fetch orderNos for balance transactions that have orderId
        const orderIds = btxs.map((t) => t.orderId).filter(Boolean) as string[]
        const orderMap = new Map<string, { orderNo: string; orderKind: string }>()
        if (orderIds.length) {
          const orders = await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNo: true, orderKind: true },
          })
          for (const o of orders) orderMap.set(o.id, { orderNo: o.orderNo, orderKind: o.orderKind })
        }
        for (const t of btxs) {
          const orderInfo = t.orderId ? orderMap.get(t.orderId) : undefined
          // 团购父订单的余额流水已在子券订单中体现，避免重复展示
          if (orderInfo?.orderKind === 'GROUP_PARENT') continue
          items.push({
            id: t.id,
            type: t.type === 'DEDUCT' ? 'BALANCE_DEDUCT' : 'BALANCE_REFUND',
            orderNo: orderInfo?.orderNo || (t.orderId ? '-' : '-'),
            userName: (t as any).user?.name || '-',
            userPhone: (t as any).user?.phone || '-',
            amount: t.type === 'DEDUCT' ? -t.amount : t.amount,
            payMethod: 'BALANCE',
            remark: t.remark || (t.type === 'DEDUCT' ? '余额扣款' : '余额退款'),
            createdAt: t.createdAt.toISOString(),
          })
        }
      }
    }
  }

  // Sort by createdAt desc
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const total = items.length
  const paginatedItems = items.slice((pageNum - 1) * sizeNum, pageNum * sizeNum)

  return paginated(res, paginatedItems, pageNum, sizeNum, total)
}

/* ─── 3. 退款记录 ─── */
export async function refunds(req: AuthenticatedRequest, res: Response) {
  const { startDate, endDate, venueId, page = '1', pageSize = '20' } = req.query
  const pageNum = parseInt(page as string, 10)
  const sizeNum = parseInt(pageSize as string, 10)

  const where: any = { status: 'REFUNDED', refundAmount: { gt: 0 } }
  if (venueId) where.venueId = venueId as string
  if (startDate || endDate) {
    where.updatedAt = {}
    if (startDate) where.updatedAt.gte = dayStart(startDate as string)
    if (endDate) where.updatedAt.lte = dayEnd(endDate as string)
  }

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { name: true, phone: true } },
        booking: { select: { personName: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return paginated(res, data, pageNum, sizeNum, total)
}

export async function getAuditConfig(req: AuthenticatedRequest, res: Response) {
  return success(res, auditConfig())
}

export async function updateAuditConfig(req: AuthenticatedRequest, res: Response) {
  try {
    const config = auditConfig()
    const nextTaxRate = Number(req.body?.taxRate ?? config.taxRate)
    const nextPaymentFeeRates = {
      ...config.paymentFeeRates,
      ...(req.body?.paymentFeeRates || {}),
    }
    const nextPlatformFeeRates = {
      ...config.platformFeeRates,
      ...(req.body?.platformFeeRates || {}),
    }
    const nextSettlementCycles = {
      ...config.settlementCycles,
      ...(req.body?.settlementCycles || {}),
    }

    if (!Number.isFinite(nextTaxRate) || nextTaxRate < 0 || nextTaxRate > 100) {
      return error(res, '税率必须在 0-100 之间', 400)
    }
    for (const [name, value] of Object.entries({ ...nextPaymentFeeRates, ...nextPlatformFeeRates })) {
      const rate = Number(value)
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return error(res, `${name} 费率必须在 0-100 之间`, 400)
      }
    }

    await updateConfig('finance_tax_rate', nextTaxRate, req.user?.id)
    await updateConfig('finance_payment_fee_rates', nextPaymentFeeRates, req.user?.id)
    await updateConfig('finance_platform_fee_rates', nextPlatformFeeRates, req.user?.id)
    await updateConfig('finance_settlement_cycles', nextSettlementCycles, req.user?.id)

    await logAudit(req, {
      action: 'FINANCE_AUDIT_CONFIG_UPDATE',
      actionName: '更新业财审计费率配置',
      targetType: 'FINANCE_CONFIG',
      targetId: 'finance_audit_config',
      targetDesc: '业财审计费率配置',
      beforeValue: config,
      afterValue: {
        taxRate: nextTaxRate,
        paymentFeeRates: nextPaymentFeeRates,
        platformFeeRates: nextPlatformFeeRates,
        settlementCycles: nextSettlementCycles,
      },
      reason: req.body?.reason || '财务管理页面调整费率',
    })

    return success(res, auditConfig(), '配置已保存')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function buildAuditRecords(params: {
  startDate?: string
  endDate?: string
  venueId?: string
  search?: string
  status?: string
  store?: string
}) {
  const config = auditConfig()
  const dateWhere = {
    ...(params.startDate ? { gte: dayStart(params.startDate) } : {}),
    ...(params.endDate ? { lte: dayEnd(params.endDate) } : {}),
  }
  const hasDate = params.startDate || params.endDate
  const whereDateOr = hasDate
    ? [
        { paidAt: dateWhere },
        { cancelledAt: dateWhere },
        { updatedAt: dateWhere },
        { createdAt: dateWhere },
      ]
    : undefined

  const [orders, recharges, auditLogs] = await Promise.all([
    prisma.order.findMany({
      where: {
        orderKind: { not: 'GROUP_PARENT' },
        status: { in: ['PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'NO_SHOW'] },
        ...(whereDateOr ? { OR: whereDateOr } : {}),
        ...(params.venueId ? { venueId: params.venueId } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
        booking: {
          include: {
            game: { select: { title: true } },
            venue: { select: { name: true } },
          },
        },
        payments: true,
        feeOrders: {
          where: { orderKind: 'FEE', feeType: 'RESCHEDULE_FEE', status: { in: ['PAID', 'READY_TO_VERIFY', 'COMPLETED', 'REFUNDED'] } },
          select: {
            amount: true,
            originalAmount: true,
            payMethod: true,
            status: true,
            refundAmount: true,
            principalDeduction: true,
            bonusDeduction: true,
            payments: { select: { amount: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    params.venueId
      ? Promise.resolve([])
      : prisma.rechargeRecord.findMany({
          where: {
            status: 'PAID',
            ...(hasDate ? { createdAt: dateWhere } : {}),
          },
          include: { user: { select: { name: true, phone: true } } },
          orderBy: { createdAt: 'desc' },
        }),
    prisma.auditLog.findMany({
      where: {
        targetType: 'FINANCE_AUDIT_RECORD',
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const auditLogMap = new Map<string, typeof auditLogs>()
  for (const log of auditLogs) {
    const list = auditLogMap.get(log.targetId) || []
    list.push(log)
    auditLogMap.set(log.targetId, list)
  }

  const records: any[] = []
  for (const order of orders) {
    // 改签费订单合并到关联的原订单中开票/核销，不生成独立财务记录
    if (order.orderKind === 'FEE') continue

    const meta = readMeta(order.metadata)
    const thirdPartySource = meta.thirdPartyCoupon?.source as string | undefined
    const channel = thirdPartySource || (order.source === 'ONLINE' ? '微信小程序' : '线下收银台')
    const payMethod = order.payMethod || order.payments[0]?.method || 'CASH'
    const isRefunded = order.status === 'REFUNDED' || (order.refundAmount || 0) > 0
    // 已支付的改签费合并到原订单，改签费本身不递延、不单独开票
    const rescheduleFees = (order.feeOrders || []) as Array<{
      amount: number
      payMethod?: string | null
      refundAmount?: number | null
      principalDeduction?: number | null
      bonusDeduction?: number | null
      payments: Array<{ amount: number }>
    }>
    const rescheduleFeeTotal = rescheduleFees.reduce((sum, f) => sum + f.amount, 0)
    const rescheduleFeeActual = rescheduleFees.reduce(
      (sum, f) => sum + (f.payments?.reduce((s, p) => s + p.amount, 0) || f.amount),
      0,
    )
    const rescheduleFeeRefundTotal = rescheduleFees.reduce((sum, f) => sum + (f.refundAmount || 0), 0)
    const rescheduleFeePrincipalUsed = rescheduleFees.reduce((sum, f) => sum + (f.principalDeduction || 0), 0)
    const rescheduleFeeGiftUsed = rescheduleFees.reduce((sum, f) => sum + (f.bonusDeduction || 0), 0)
    const originalPrice = isRefunded
      ? -((order.originalAmount || order.amount) + rescheduleFeeTotal)
      : (order.originalAmount || order.amount) + rescheduleFeeTotal
    const discountBreakdown = [
      order.discountAmount > 0 ? { name: '会员优惠', amount: -order.discountAmount } : null,
      order.couponDiscount > 0
        ? { name: meta.thirdPartyCoupon?.name || (order.userCouponId ? '系统优惠券抵扣' : '优惠券抵扣'), amount: -order.couponDiscount }
        : null,
      order.pointsDeduction > 0 ? { name: '积分抵扣', amount: -order.pointsDeduction } : null,
    ].filter(Boolean)
    const platformRate = thirdPartySource ? Number(config.platformFeeRates[thirdPartySource] || 0) : 0
    const payRate = Number(config.paymentFeeRates[payMethod] || 0)
    const baseAmount = isRefunded ? -((order.refundAmount || order.amount) + rescheduleFeeRefundTotal) : order.amount
    const platformFee = thirdPartySource ? -roundFee(Math.abs(order.amount), platformRate) : 0
    const gatewayFee = ['WECHAT', 'ALIPAY', 'CARD'].includes(payMethod)
      ? -roundFee(Math.abs(order.amount), payRate)
      : 0
    const rescheduleFeePlatformFee = thirdPartySource ? -roundFee(rescheduleFeeTotal, platformRate) : 0
    const rescheduleFeeGatewayFee = ['WECHAT', 'ALIPAY', 'CARD'].includes(payMethod)
      ? -roundFee(rescheduleFeeTotal, payRate)
      : 0
    const expectedRecv = isRefunded
      ? baseAmount
      : order.amount + platformFee + gatewayFee + rescheduleFeeTotal + rescheduleFeePlatformFee + rescheduleFeeGatewayFee
    const actualRecv = isRefunded
      ? -((order.refundAmount || order.amount) + rescheduleFeeRefundTotal)
      : (order.payments.reduce((sum, payment) => sum + payment.amount, 0) || order.amount) + rescheduleFeeActual
    const consumeStatus = isRefunded
      ? 'refunded'
      : order.status === 'PAID'
        ? 'unconsumed'
        : 'consumed'
    const bankStatus = ['BALANCE', 'BALANCE_POINTS'].includes(payMethod)
      ? 'internal'
      : ['WECHAT', 'ALIPAY', 'CARD'].includes(payMethod)
        ? 'in_transit'
        : 'arrived'
    const hasBalanceFee = rescheduleFees.some((f) => ['BALANCE', 'BALANCE_POINTS'].includes(f.payMethod || ''))
    const paymentMethodLabel = hasBalanceFee && !['BALANCE', 'BALANCE_POINTS'].includes(payMethod)
      ? `${paymentLabel(payMethod)} + 余额`
      : paymentLabel(payMethod)
    const id = order.orderNo
    const record: any = {
      id,
      sourceId: order.id,
      sourceType: 'ORDER',
      store: order.booking?.venue?.name || order.venueName || '-',
      operator: order.source === 'ONLINE' ? '用户自助' : '系统管理员',
      channel,
      paymentMethod: paymentMethodLabel,
      payMethod,
      feePayMethods: rescheduleFees.map((f) => f.payMethod).filter(Boolean) as string[],
      type:
        (order.booking?.game?.title || order.feeReason || 'VR体验订单') +
        (rescheduleFeeTotal > 0
          ? `（含改签费${rescheduleFees.some((f) => ['BALANCE', 'BALANCE_POINTS'].includes(f.payMethod || '')) ? '·余额' : ''}）`
          : ''),
      consumeStatus,
      originalPrice,
      discountBreakdown,
      platformFee,
      gatewayFee,
      expectedRecv,
      actualRecv,
      settlementCycle: config.settlementCycles[thirdPartySource || payMethod] || '实时',
      bankStatus,
      assetChange:
        (order.principalDeduction || 0) + (order.bonusDeduction || 0) + rescheduleFeePrincipalUsed + rescheduleFeeGiftUsed > 0
          ? {
              type: 'balance_used',
              value: order.amount + rescheduleFeeActual,
              principalUsed: (order.principalDeduction || 0) + rescheduleFeePrincipalUsed,
              giftUsed: (order.bonusDeduction || 0) + rescheduleFeeGiftUsed,
            }
          : null,
      invoice: {
        status: expectedRecv > 0 ? 'pending' : isRefunded ? 'red_ink' : 'none',
        amount: Math.round(expectedRecv / (1 + config.taxRate / 100)),
        taxRate: config.taxRate,
      },
      orderTime: format(order.createdAt, 'yyyy-MM-dd HH:mm'),
      reconTime: format(order.updatedAt, 'yyyy-MM-dd HH:mm'),
      remark: meta.thirdPartyCoupon ? `平台券：${meta.thirdPartyCoupon.name}` : '',
      relatedOrderId: order.parentOrderId || null,
      userName: order.user?.name || order.booking?.personName || '-',
      userPhone: order.user?.phone || order.booking?.personPhone || '-',
      auditLog: auditLogMap.get(id) || [],
    }
    record.status = computeAuditStatus(record.actualRecv, record.expectedRecv, record.consumeStatus, record.bankStatus)
    if (record.auditLog.some((log: any) => log.action === 'FINANCE_AUDIT_FORCE_MATCH')) {
      record.status = 'matched'
      record.forceMatched = true
      record.forceMatchReason = record.auditLog.find((log: any) => log.action === 'FINANCE_AUDIT_FORCE_MATCH')?.reason || ''
    }
    record.vouchers = buildVouchers(record, config.taxRate)
    records.push(record)
  }

  for (const recharge of recharges) {
    const payMethod = recharge.payMethod || 'WECHAT'
    const payRate = Number(config.paymentFeeRates[payMethod] || 0)
    const gatewayFee = ['WECHAT', 'ALIPAY', 'CARD'].includes(payMethod)
      ? -roundFee(recharge.amount, payRate)
      : 0
    const expectedRecv = recharge.amount + gatewayFee
    const id = `RECHARGE-${recharge.id}`
    const record: any = {
      id,
      sourceId: recharge.id,
      sourceType: 'RECHARGE',
      store: '会员中心',
      operator: '用户自助',
      channel: '会员充值',
      paymentMethod: paymentLabel(payMethod),
      payMethod,
      type: `会员充值（充${(recharge.amount / 100).toFixed(2)}得${((recharge.amount + recharge.bonus) / 100).toFixed(2)}）`,
      consumeStatus: 'recharge',
      originalPrice: recharge.amount,
      discountBreakdown: [],
      platformFee: 0,
      gatewayFee,
      expectedRecv,
      actualRecv: recharge.amount,
      settlementCycle: config.settlementCycles[payMethod] || '实时',
      bankStatus: ['WECHAT', 'ALIPAY', 'CARD'].includes(payMethod) ? 'in_transit' : 'arrived',
      assetChange: { type: 'recharge', principal: recharge.amount, gift: recharge.bonus },
      invoice: {
        status: 'pending',
        amount: Math.round(expectedRecv / (1 + config.taxRate / 100)),
        taxRate: config.taxRate,
      },
      orderTime: format(recharge.createdAt, 'yyyy-MM-dd HH:mm'),
      reconTime: format(recharge.paidAt || recharge.createdAt, 'yyyy-MM-dd HH:mm'),
      remark: '',
      relatedOrderId: null,
      userName: recharge.user?.name || '-',
      userPhone: recharge.user?.phone || '-',
      auditLog: auditLogMap.get(id) || [],
    }
    record.status = computeAuditStatus(record.actualRecv, record.expectedRecv, record.consumeStatus, record.bankStatus)
    if (record.auditLog.some((log: any) => log.action === 'FINANCE_AUDIT_FORCE_MATCH')) {
      record.status = 'matched'
      record.forceMatched = true
      record.forceMatchReason = record.auditLog.find((log: any) => log.action === 'FINANCE_AUDIT_FORCE_MATCH')?.reason || ''
    }
    record.vouchers = buildVouchers(record, config.taxRate)
    records.push(record)
  }

  return records
    .filter((record) => !params.search || [
      record.id,
      record.store,
      record.channel,
      record.paymentMethod,
      record.type,
      record.userName,
      record.userPhone,
    ].some((value) => String(value || '').toLowerCase().includes(params.search!.toLowerCase())))
    .filter((record) => !params.status || params.status === 'all' || record.status === params.status)
    .filter((record) => !params.store || params.store === 'all' || record.store === params.store)
    .sort((a, b) => new Date(b.reconTime).getTime() - new Date(a.reconTime).getTime())
}

export async function auditRecords(req: AuthenticatedRequest, res: Response) {
  try {
    const page = parseInt(String(req.query.page || '1'), 10)
    const pageSize = parseInt(String(req.query.pageSize || '20'), 10)
    const records = await buildAuditRecords({
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      venueId: req.query.venueId as string | undefined,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      store: req.query.store as string | undefined,
    })
    const summary = {
      total: records.length,
      matched: records.filter((r) => r.status === 'matched').length,
      exceptions: records.filter((r) => ['short', 'over'].includes(r.status)).length,
      expectedRecv: records.reduce((sum, r) => sum + r.expectedRecv, 0),
      actualRecv: records.reduce((sum, r) => sum + r.actualRecv, 0),
      diff: records.reduce((sum, r) => sum + (r.actualRecv - r.expectedRecv), 0),
      stores: Array.from(new Set(records.map((r) => r.store).filter(Boolean))),
    }
    const data = records.slice((page - 1) * pageSize, page * pageSize)
    return success(res, {
      data,
      meta: {
        page,
        pageSize,
        total: records.length,
        totalPages: Math.max(1, Math.ceil(records.length / pageSize)),
      },
      summary,
      config: auditConfig(),
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function auditRecordDetail(req: AuthenticatedRequest, res: Response) {
  try {
    const records = await buildAuditRecords({})
    const record = records.find((item) => item.id === req.params.id || item.sourceId === req.params.id)
    if (!record) return error(res, '审计流水不存在', 404)
    return success(res, record)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function forceMatchAuditRecord(req: AuthenticatedRequest, res: Response) {
  try {
    const { reason, approver } = req.body || {}
    if (!reason || !String(reason).trim()) return error(res, '请填写平账原因', 400)
    const records = await buildAuditRecords({})
    const record = records.find((item) => item.id === req.params.id || item.sourceId === req.params.id)
    if (!record) return error(res, '审计流水不存在', 404)

    await logAudit(req, {
      action: 'FINANCE_AUDIT_FORCE_MATCH',
      actionName: '业财审计人工平账',
      targetType: 'FINANCE_AUDIT_RECORD',
      targetId: record.id,
      targetDesc: `${record.store} ${record.type}`,
      beforeValue: {
        expectedRecv: record.expectedRecv,
        actualRecv: record.actualRecv,
        status: record.status,
      },
      afterValue: {
        expectedRecv: record.expectedRecv,
        actualRecv: record.expectedRecv,
        status: 'matched',
        approver: approver || '',
      },
      diffValue: { diff: record.actualRecv - record.expectedRecv },
      amount: record.actualRecv - record.expectedRecv,
      reason: `${reason}${approver ? `；审批人：${approver}` : ''}`,
    })

    return success(res, { id: record.id, status: 'matched' }, '已记录人工平账')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
