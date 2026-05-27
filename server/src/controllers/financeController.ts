import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, paginated } from '../utils/response'
import { subDays, format } from 'date-fns'

/* ─── UTC day boundaries ─── */
function dayStart(dateStr: string): Date { return new Date(dateStr + 'T00:00:00.000Z') }
function dayEnd(dateStr: string): Date { return new Date(dateStr + 'T23:59:59.999Z') }

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
    todayRecharge,
    totalUserBalance,
    dailyOrders,
    dailyRecharges,
  ] = await Promise.all([
    // 今日营收（已支付 + 已核销）
    prisma.order.aggregate({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        status: { in: ['PAID', 'COMPLETED'] },
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      _sum: { amount: true },
    }),
    // 今日退款
    prisma.order.aggregate({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        status: 'REFUNDED',
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
        createdAt: { gte: start, lte: end },
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      select: { createdAt: true, amount: true, status: true, refundAmount: true },
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
  const trendMap = new Map<string, { revenue: number; refund: number; recharge: number }>()
  const dateKeys: string[] = []
  let cursor = new Date(start)
  while (cursor <= end) {
    const key = format(cursor, 'yyyy-MM-dd')
    dateKeys.push(key)
    trendMap.set(key, { revenue: 0, refund: 0, recharge: 0 })
    cursor = new Date(cursor.getTime() + 86400000)
  }

  for (const o of dailyOrders) {
    const key = format(o.createdAt, 'yyyy-MM-dd')
    const entry = trendMap.get(key)
    if (!entry) continue
    if (o.status === 'PAID' || o.status === 'COMPLETED') {
      entry.revenue += o.amount
    }
    if (o.status === 'REFUNDED' && o.refundAmount) {
      entry.refund += o.refundAmount
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
    recharge: trendMap.get(date)!.recharge,
  }))

  // Aggregate period totals from trend data
  const periodRevenue = revenueTrend.reduce((s, d) => s + d.revenue, 0)
  const periodRefund = revenueTrend.reduce((s, d) => s + d.refund, 0)
  const periodRecharge = revenueTrend.reduce((s, d) => s + d.recharge, 0)

  // Member recharge consumption: orders paid with BALANCE or BALANCE_POINTS within period
  const rechargeConsumption = await prisma.order.aggregate({
    where: {
      createdAt: { gte: start, lte: end },
      status: { in: ['PAID', 'COMPLETED'] },
      payMethod: { in: ['BALANCE', 'BALANCE_POINTS'] },
      ...(venueId ? { venueId: venueId as string } : {}),
    },
    _sum: { amount: true },
  })

  return success(res, {
    todayRevenue: todayRevenue._sum.amount || 0,
    todayRefund: todayRefund._sum.refundAmount || 0,
    todayRecharge: todayRecharge._sum.amount || 0,
    totalUserBalance: (totalUserBalance._sum.principalBalance || 0) + (totalUserBalance._sum.bonusBalance || 0),
    periodRevenue,
    periodRefund,
    periodRecharge,
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
  const needRecharges = typeList.length === 0 || typeList.includes('RECHARGE')
  const needBalanceTx = typeList.length === 0 || typeList.includes('BALANCE_DEDUCT') || typeList.includes('BALANCE_REFUND')

  const items: any[] = []

  // ── Orders (收入) ──
  if (needOrders) {
    const orders = await prisma.order.findMany({
      where: {
        ...(hasDate ? { createdAt: dateWhere } : {}),
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
        createdAt: o.createdAt.toISOString(),
      })
    }
  }

  // ── Orders (退款) ──
  if (needRefunds) {
    const refunds = await prisma.order.findMany({
      where: {
        ...(hasDate ? { createdAt: dateWhere } : {}),
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
        remark: '订单退款',
        createdAt: o.createdAt.toISOString(),
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
    if (typeList.length === 0 || typeList.includes('BALANCE_REFUND')) txTypes.push('REFUND')

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
        const orderMap = new Map<string, string>()
        if (orderIds.length) {
          const orders = await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNo: true },
          })
          for (const o of orders) orderMap.set(o.id, o.orderNo)
        }
        for (const t of btxs) {
          items.push({
            id: t.id,
            type: t.type === 'DEDUCT' ? 'BALANCE_DEDUCT' : 'BALANCE_REFUND',
            orderNo: t.orderId ? (orderMap.get(t.orderId) || '-') : '-',
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
    where.createdAt = {}
    if (startDate) where.createdAt.gte = dayStart(startDate as string)
    if (endDate) where.createdAt.lte = dayEnd(endDate as string)
  }

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, phone: true } },
        booking: { select: { personName: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return paginated(res, data, pageNum, sizeNum, total)
}
