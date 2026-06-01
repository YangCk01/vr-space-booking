import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { subDays, format, parseISO } from 'date-fns'

/* ─── UTC day boundaries (for @db.Date comparison) ─── */
function dayStart(d: Date): Date { return new Date(format(d, 'yyyy-MM-dd') + 'T00:00:00.000Z') }
function dayEnd(d: Date): Date { return new Date(format(d, 'yyyy-MM-dd') + 'T23:59:59.999Z') }

/* ─── Format UTC date as MM-dd (consistent with UTC day boundaries) ─── */
function formatUtcDate(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/* ─── 日期范围解析工具 ─── */
function parseDateRange(req: AuthenticatedRequest | Request, defaultRange = '7days'): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const { range = defaultRange, startDate, endDate } = req.query
  const now = new Date()
  let start: Date, end: Date, prevStart: Date, prevEnd: Date

  if (range === 'today') {
    start = dayStart(now)
    end = dayEnd(now)
    const yesterday = subDays(now, 1)
    prevStart = dayStart(yesterday)
    prevEnd = dayEnd(yesterday)
  } else if (range === '7days') {
    start = dayStart(subDays(now, 6))
    end = dayEnd(now)
    prevStart = dayStart(subDays(now, 13))
    prevEnd = dayEnd(subDays(now, 7))
  } else if (range === '30days') {
    start = dayStart(subDays(now, 29))
    end = dayEnd(now)
    prevStart = dayStart(subDays(now, 59))
    prevEnd = dayEnd(subDays(now, 30))
  } else if (range === '90days') {
    start = dayStart(subDays(now, 89))
    end = dayEnd(now)
    prevStart = dayStart(subDays(now, 179))
    prevEnd = dayEnd(subDays(now, 90))
  } else if (range === 'custom' && startDate && endDate) {
    start = dayStart(parseISO(startDate as string))
    end = dayEnd(parseISO(endDate as string))
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    prevStart = dayStart(subDays(start, daysDiff))
    prevEnd = dayEnd(subDays(start, 1))
  } else {
    start = dayStart(subDays(now, 6))
    end = dayEnd(now)
    prevStart = dayStart(subDays(now, 13))
    prevEnd = dayEnd(subDays(now, 7))
  }

  return { start, end, prevStart, prevEnd }
}

/* ─── Dashboard ─── */
export async function dashboard(req: AuthenticatedRequest, res: Response) {
  try {
    const range = (req.query.range as string) || 'today'
    const { start, end, prevStart, prevEnd } = parseDateRange(req, 'today')
    const isToday = range === 'today'

    // MANAGER 数据隔离：只统计被分配的场地
    const venueIds = req.user?.role === 'MANAGER' ? req.user.managedVenueIds : undefined
    const venueWhere = venueIds?.length ? { venueId: { in: venueIds } } : {}
    const venueWhereBooking = venueIds?.length ? { venueId: { in: venueIds } } : {}
    const venueCountWhere = venueIds?.length ? { id: { in: venueIds } } : {}

    // 当前周期数据
    const currentBookings = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: { notIn: ['PENDING', 'CANCELLED'] }, ...venueWhere },
    })
    const currentUsed = await prisma.booking.count({
      where: { date: { gte: start, lte: end }, status: 'COMPLETED', ...venueWhereBooking },
    })
    const currentPlayers = await prisma.booking.aggregate({
      where: { date: { gte: start, lte: end }, status: 'COMPLETED', ...venueWhereBooking },
      _sum: { personCount: true },
    })
    const currentRevenue = await prisma.order.aggregate({
      where: { createdAt: { gte: start, lte: end }, status: { in: ['PAID', 'COMPLETED'] }, ...venueWhere },
      _sum: { amount: true },
    })

    // 上一周期数据
    const prevBookings = await prisma.order.count({
      where: { createdAt: { gte: prevStart, lte: prevEnd }, status: { notIn: ['PENDING', 'CANCELLED'] }, ...venueWhere },
    })
    const prevPlayers = await prisma.booking.aggregate({
      where: { date: { gte: prevStart, lte: prevEnd }, status: 'COMPLETED', ...venueWhereBooking },
      _sum: { personCount: true },
    })
    const prevRevenue = await prisma.order.aggregate({
      where: { createdAt: { gte: prevStart, lte: prevEnd }, status: { in: ['PAID', 'COMPLETED'] }, ...venueWhere },
      _sum: { amount: true },
    })

    // 场地使用率
    const totalVenues = await prisma.venue.count({ where: venueCountWhere })
    const activeVenues = venueIds?.length
      ? await prisma.venue.count({
          where: {
            id: { in: venueIds },
            bookings: {
              some: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
            },
          },
        })
      : await prisma.venue.count({
          where: {
            bookings: {
              some: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
            },
          },
        })
    const usageRate = totalVenues > 0 ? Math.round((activeVenues / totalVenues) * 100) : 0

    // 待处理订单
    const pendingOrders = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: 'PENDING', ...venueWhere },
    })

    // 取消订单 & 退款订单
    const cancelledOrders = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: 'CANCELLED', ...venueWhere },
    })
    const refundedOrders = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: 'REFUNDED', ...venueWhere },
    })

    // 最新订单
    const latestOrders = await prisma.order.findMany({
      where: { status: { not: 'CANCELLED' }, ...venueWhere },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, phone: true } } },
    })

    const bookingTrend = prevBookings > 0
      ? Math.round(((currentBookings - prevBookings) / prevBookings) * 100)
      : null
    const revenueTrend = prevRevenue._sum.amount
      ? Math.round(((currentRevenue._sum.amount || 0) - prevRevenue._sum.amount) / prevRevenue._sum.amount * 100)
      : null
    const prevPlayerCount = prevPlayers._sum.personCount || 0
    const currPlayerCount = currentPlayers._sum.personCount || 0
    const playersTrend = prevPlayerCount > 0
      ? Math.round(((currPlayerCount || 0) - prevPlayerCount) / prevPlayerCount * 100)
      : null

    // 客单价（分→元）
    const currentAOV = currentBookings > 0 ? Math.round((currentRevenue._sum.amount || 0) / currentBookings) : 0
    const prevAOV = prevBookings > 0 ? Math.round((prevRevenue._sum.amount || 0) / prevBookings) : 0
    const aovTrend = prevAOV > 0 ? Math.round(((currentAOV - prevAOV) / prevAOV) * 100) : 0

    return success(res, {
      stats: {
        todayBookings: currentBookings,
        yesterdayBookings: prevBookings,
        bookingTrend,
        todayUsed: currentUsed,
        todayRevenue: currentRevenue._sum.amount || 0,
        yesterdayRevenue: prevRevenue._sum.amount || 0,
        revenueTrend,
        usageRate,
        totalVenues,
        todayActiveVenues: activeVenues,
        pendingOrders,
        isRange: !isToday,
        todayPlayers: currentPlayers._sum.personCount || 0,
        yesterdayPlayers: prevPlayers._sum.personCount || 0,
        playersTrend,
        avgOrderValue: currentAOV,
        prevAvgOrderValue: prevAOV,
        aovTrend,
        cancelledOrders,
        refundedOrders,
      },
      latestOrders,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Revenue trend ─── */
export async function revenue(req: AuthenticatedRequest, res: Response) {
  try {
    const { range = '7days' } = req.query
    const now = new Date()
    let days: number
    let start: Date, end: Date

    if (range === 'today') {
      start = dayStart(now)
      end = dayEnd(now)
      days = 1
    } else if (range === '30days') {
      days = 30
      end = dayEnd(now)
      start = dayStart(subDays(now, 29))
    } else if (range === '90days') {
      days = 90
      end = dayEnd(now)
      start = dayStart(subDays(now, 89))
    } else {
      // 7days default
      days = 7
      end = dayEnd(now)
      start = dayStart(subDays(now, 6))
    }

    // MANAGER 数据隔离：只统计被分配场地的订单
    const venueIds = req.user?.role === 'MANAGER' ? req.user.managedVenueIds : undefined
    const venueWhere = venueIds?.length ? { venueId: { in: venueIds } } : {}

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: { not: 'CANCELLED' },
        ...venueWhere,
      },
      select: { createdAt: true, source: true, amount: true },
      orderBy: { createdAt: 'asc' },
    })

    const dataMap = new Map<string, { onlineAmount: number; offlineAmount: number; onlineCount: number; offlineCount: number }>()
    for (let i = 0; i < days; i++) {
      const d = subDays(end, days - 1 - i)
      const key = formatUtcDate(d)
      dataMap.set(key, { onlineAmount: 0, offlineAmount: 0, onlineCount: 0, offlineCount: 0 })
    }

    for (const o of orders) {
      const key = formatUtcDate(o.createdAt)
      const existing = dataMap.get(key)
      if (existing) {
        if (o.source === 'ONLINE') {
          existing.onlineAmount += o.amount
          existing.onlineCount += 1
        } else {
          existing.offlineAmount += o.amount
          existing.offlineCount += 1
        }
      }
   }

    const data = Array.from(dataMap.entries()).map(([date, val]) => ({
      date,
      label: date,
      onlineAmount: val.onlineAmount,
      offlineAmount: val.offlineAmount,
      onlineCount: val.onlineCount,
      offlineCount: val.offlineCount,
    }))

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Venue revenue ranking ─── */
export async function venueRevenueRanking(req: AuthenticatedRequest, res: Response) {
  try {
    const { start, end } = parseDateRange(req)

    const venues = await prisma.venue.findMany({
      select: { id: true, name: true, theme: true },
    })

    const venueRevenues = await Promise.all(
      venues.map(async (v) => {
        const agg = await prisma.order.aggregate({
          where: {
            venueId: v.id,
            createdAt: { gte: start, lte: end },
            status: { in: ['PAID', 'COMPLETED'] },
          },
          _sum: { amount: true },
          _count: { id: true },
        })
        return {
          id: v.id,
          name: v.name,
          theme: v.theme,
          revenue: agg._sum.amount || 0,
          orderCount: agg._count.id,
        }
      })
    )

    const sorted = venueRevenues
      .sort((a, b) => b.revenue - a.revenue)
      .map((v, i) => ({
        rank: String(i + 1).padStart(2, '0'),
        name: v.name,
        theme: v.theme,
        revenue: v.revenue,
        orderCount: v.orderCount,
      }))

    return success(res, sorted)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Time distribution ─── */
export async function timeDistribution(req: AuthenticatedRequest, res: Response) {
  try {
    const { start, end } = parseDateRange(req)

    const bookings = await prisma.booking.findMany({
      where: {
        date: { gte: start, lte: end },
        status: { not: 'CANCELLED' },
      },
      select: { startTime: true },
    })

    const timeRanges = [
      { time: '08:00-10:00', count: 0 },
      { time: '10:00-12:00', count: 0 },
      { time: '12:00-14:00', count: 0 },
      { time: '14:00-16:00', count: 0 },
      { time: '16:00-18:00', count: 0 },
      { time: '18:00-20:00', count: 0 },
      { time: '20:00-22:00', count: 0 },
    ]

    for (const b of bookings) {
      const hour = parseInt(b.startTime.split(':')[0])
      if (hour >= 8 && hour < 10) timeRanges[0].count++
      else if (hour >= 10 && hour < 12) timeRanges[1].count++
      else if (hour >= 12 && hour < 14) timeRanges[2].count++
      else if (hour >= 14 && hour < 16) timeRanges[3].count++
      else if (hour >= 16 && hour < 18) timeRanges[4].count++
      else if (hour >= 18 && hour < 20) timeRanges[5].count++
      else if (hour >= 20 && hour < 22) timeRanges[6].count++
    }

    return success(res, timeRanges)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── User growth ─── */
export async function userGrowth(req: AuthenticatedRequest, res: Response) {
  try {
    const { range = '7days' } = req.query
    const now = new Date()
    let days: number
    let start: Date, end: Date

    if (range === 'today') {
      start = dayStart(now)
      end = dayEnd(now)
      days = 1
    } else if (range === '30days') {
      days = 30
      start = dayStart(subDays(now, 29))
      end = dayEnd(now)
    } else if (range === '90days') {
      days = 90
      start = dayStart(subDays(now, 89))
      end = dayEnd(now)
    } else {
      days = 7
      start = dayStart(subDays(now, 6))
      end = dayEnd(now)
    }

    const users = await prisma.user.findMany({
      where: {
        registerDate: { gte: start, lte: end },
        role: 'CUSTOMER',
      },
      select: { registerDate: true },
      orderBy: { registerDate: 'asc' },
    })

    const dataMap = new Map<string, number>()
    for (let i = 0; i < days; i++) {
      const d = subDays(end, days - 1 - i)
      dataMap.set(formatUtcDate(d), 0)
    }

    for (const u of users) {
      const key = formatUtcDate(u.registerDate)
      if (dataMap.has(key)) {
        dataMap.set(key, (dataMap.get(key) || 0) + 1)
      }
    }

    const data = Array.from(dataMap.entries()).map(([date, users]) => ({
      date,
      label: date,
      users,
    }))

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Payment method distribution ─── */
export async function paymentMethodDistribution(req: AuthenticatedRequest, res: Response) {
  try {
    const { start, end } = parseDateRange(req)

    const orders = await prisma.order.groupBy({
      by: ['payMethod'],
      where: {
        createdAt: { gte: start, lte: end },
        status: { in: ['PAID', 'COMPLETED'] },
      },
      _sum: { amount: true },
      _count: { id: true },
    })

    const methodMap: Record<string, string> = {
      WECHAT: '微信支付',
      ALIPAY: '支付宝',
      CASH: '现金',
      CARD: '刷卡',
      BALANCE: '余额支付',
      BALANCE_POINTS: '余额+积分',
    }

    const data = orders.map((o) => ({
      method: methodMap[o.payMethod || ''] || o.payMethod || '其他',
      amount: o._sum.amount || 0,
      count: o._count.id,
    }))

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Order status distribution ─── */
export async function orderStatusDistribution(req: AuthenticatedRequest, res: Response) {
  try {
    const { start, end } = parseDateRange(req)

    const orders = await prisma.order.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: start, lte: end },
      },
      _count: { id: true },
    })

    const statusMap: Record<string, string> = {
      PENDING: '待支付',
      PAID: '已支付',
      COMPLETED: '已完成',
      CANCELLED: '已取消',
      REFUNDING: '退款中',
      REFUNDED: '已退款',
    }

    const data = orders.map((o) => ({
      status: statusMap[o.status] || o.status,
      count: o._count.id,
    }))

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Repurchase rate ─── */
export async function repurchaseRate(req: AuthenticatedRequest, res: Response) {
  try {
    const { start, end } = parseDateRange(req)

    const customers = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: { in: ['PAID', 'COMPLETED'] },
        userId: { not: null },
      },
      select: { userId: true },
    })

    const userOrderCount = new Map<string, number>()
    for (const o of customers) {
      if (o.userId) {
        userOrderCount.set(o.userId, (userOrderCount.get(o.userId) || 0) + 1)
      }
    }

    const totalCustomers = userOrderCount.size
    const repeatCustomers = Array.from(userOrderCount.values()).filter((c) => c > 1).length
    const rate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0

    return success(res, {
      totalCustomers,
      repeatCustomers,
      rate,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Game popularity ─── */
export async function gamePopularity(req: AuthenticatedRequest, res: Response) {
  try {
    const { start, end } = parseDateRange(req)

    const games = await prisma.game.findMany({
      select: {
        id: true,
        title: true,
        coverImage: true,
        price: true,
        _count: {
          select: {
            bookings: {
              where: {
                date: { gte: start, lte: end },
                status: { not: 'CANCELLED' },
              },
            },
          },
        },
      },
      orderBy: { bookings: { _count: 'desc' } },
      take: 10,
    })

    const data = games.map((g, i) => ({
      rank: String(i + 1).padStart(2, '0'),
      id: g.id,
      title: g.title,
      coverImage: g.coverImage,
      price: g.price,
      bookingCount: g._count.bookings,
    }))

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
