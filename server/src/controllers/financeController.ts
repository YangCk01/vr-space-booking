import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, paginated } from '../utils/response'
import { startOfDay, endOfDay, subDays, format } from 'date-fns'

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
