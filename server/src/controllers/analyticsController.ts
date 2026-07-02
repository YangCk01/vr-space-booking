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

function retainedIncome(order: { amount: number; refundAmount?: number | null; penaltyAmount?: number | null }): number {
  const refunded = order.refundAmount || 0
  if (refunded > 0) return Math.max(0, order.amount - refunded)
  return order.amount || order.penaltyAmount || 0
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
    // 预约场次按 Booking.date（预约日期）统计，和排场页保持一致
    const currentBookings = await prisma.booking.count({
      where: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' }, ...venueWhereBooking },
    })
    const currentUsed = await prisma.booking.count({
      where: { date: { gte: start, lte: end }, status: 'COMPLETED', ...venueWhereBooking },
    })
    const currentPlayers = await prisma.booking.aggregate({
      where: { date: { gte: start, lte: end }, status: 'COMPLETED', ...venueWhereBooking },
      _sum: { personCount: true },
    })
    // 收入：正常营业额 + 营业外收入（取消费 / 作废未退）
    const currentPeriodOrders = await prisma.order.findMany({
      where: {
        OR: [
          { createdAt: { gte: start, lte: end }, status: { in: ['PAID', 'COMPLETED', 'CANCELLED'] } },
          { status: 'NO_SHOW', OR: [{ noShowAt: { gte: start, lte: end } }, { noShowAt: null, updatedAt: { gte: start, lte: end } }] },
        ],
        ...venueWhere,
      },
      select: { status: true, amount: true, refundAmount: true, penaltyAmount: true },
    })
    let currentOperatingRevenue = 0
    let currentOtherIncome = 0
    for (const o of currentPeriodOrders) {
      if (o.status === 'PAID' || o.status === 'COMPLETED') {
        currentOperatingRevenue += o.amount
      } else if (o.status === 'CANCELLED') {
        const refundAmount = o.refundAmount || 0
        if (refundAmount > 0) currentOtherIncome += Math.max(0, o.amount - refundAmount)
      } else if (o.status === 'NO_SHOW') {
        currentOtherIncome += retainedIncome(o)
      }
    }
    const currentRevenue = currentOperatingRevenue + currentOtherIncome

    // 上一周期数据
    const prevBookings = await prisma.booking.count({
      where: { date: { gte: prevStart, lte: prevEnd }, status: { not: 'CANCELLED' }, ...venueWhereBooking },
    })
    const prevPlayers = await prisma.booking.aggregate({
      where: { date: { gte: prevStart, lte: prevEnd }, status: 'COMPLETED', ...venueWhereBooking },
      _sum: { personCount: true },
    })
    // 上一周期收入
    const prevPeriodOrders = await prisma.order.findMany({
      where: {
        OR: [
          { createdAt: { gte: prevStart, lte: prevEnd }, status: { in: ['PAID', 'COMPLETED', 'CANCELLED'] } },
          { status: 'NO_SHOW', OR: [{ noShowAt: { gte: prevStart, lte: prevEnd } }, { noShowAt: null, updatedAt: { gte: prevStart, lte: prevEnd } }] },
        ],
        ...venueWhere,
      },
      select: { status: true, amount: true, refundAmount: true, penaltyAmount: true },
    })
    let prevOperatingRevenue = 0
    let prevOtherIncome = 0
    for (const o of prevPeriodOrders) {
      if (o.status === 'PAID' || o.status === 'COMPLETED') {
        prevOperatingRevenue += o.amount
      } else if (o.status === 'CANCELLED') {
        const refundAmount = o.refundAmount || 0
        if (refundAmount > 0) prevOtherIncome += Math.max(0, o.amount - refundAmount)
      } else if (o.status === 'NO_SHOW') {
        prevOtherIncome += retainedIncome(o)
      }
    }
    const prevRevenue = prevOperatingRevenue + prevOtherIncome

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

    // 待处理订单（仅统计主订单，不含改签费/团购父订单）
    const pendingOrders = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: 'PENDING', orderKind: 'NORMAL', ...venueWhere },
    })

    // 取消订单 & 退款订单（仅统计主订单，不含改签费/团购父订单）
    const cancelledOrders = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: 'CANCELLED', orderKind: 'NORMAL', ...venueWhere },
    })
    const refundedOrders = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: 'REFUNDED', orderKind: 'NORMAL', ...venueWhere },
    })

    // No-Show 统计（仅统计主订单，不含改签费/团购父订单）
    const noShowCount = await prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, status: 'NO_SHOW', orderKind: 'NORMAL', ...venueWhere },
    })
    const noShowLoss = await prisma.order.aggregate({
      where: { createdAt: { gte: start, lte: end }, status: 'NO_SHOW', ...venueWhere },
      _sum: { penaltyAmount: true },
    })
    const totalAppointments = await prisma.booking.count({
      where: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' }, ...venueWhereBooking },
    })
    const noShowRate = totalAppointments > 0 ? Math.round((noShowCount / totalAppointments) * 100) : 0

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
    const revenueTrend = prevRevenue > 0
      ? Math.round(((currentRevenue || 0) - prevRevenue) / prevRevenue * 100)
      : null
    const prevPlayerCount = prevPlayers._sum.personCount || 0
    const currPlayerCount = currentPlayers._sum.personCount || 0
    const playersTrend = prevPlayerCount > 0
      ? Math.round(((currPlayerCount || 0) - prevPlayerCount) / prevPlayerCount * 100)
      : null

    // 客单价（分→元）
    const currentAOV = currentBookings > 0 ? Math.round((currentRevenue || 0) / currentBookings) : 0
    const prevAOV = prevBookings > 0 ? Math.round((prevRevenue || 0) / prevBookings) : 0
    const aovTrend = prevAOV > 0 ? Math.round(((currentAOV - prevAOV) / prevAOV) * 100) : 0

    return success(res, {
      stats: {
        todayBookings: currentBookings,
        yesterdayBookings: prevBookings,
        bookingTrend,
        todayUsed: currentUsed,
        todayRevenue: currentRevenue || 0,
        todayOperatingRevenue: currentOperatingRevenue || 0,
        todayOtherIncome: currentOtherIncome || 0,
        yesterdayRevenue: prevRevenue || 0,
        yesterdayOperatingRevenue: prevOperatingRevenue || 0,
        yesterdayOtherIncome: prevOtherIncome || 0,
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
        noShowCount,
        noShowRate,
        noShowLoss: noShowLoss._sum.penaltyAmount || 0,
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
        OR: [
          { createdAt: { gte: start, lte: end }, status: { in: ['PAID', 'COMPLETED'] } },
          { status: 'NO_SHOW', OR: [{ noShowAt: { gte: start, lte: end } }, { noShowAt: null, updatedAt: { gte: start, lte: end } }] },
        ],
        ...venueWhere,
      },
      select: { createdAt: true, updatedAt: true, noShowAt: true, source: true, amount: true, status: true, refundAmount: true, penaltyAmount: true },
      orderBy: { createdAt: 'asc' },
    })

    const dataMap = new Map<string, { onlineAmount: number; offlineAmount: number; otherIncome: number; onlineCount: number; offlineCount: number; otherIncomeCount: number }>()
    for (let i = 0; i < days; i++) {
      const d = subDays(end, days - 1 - i)
      const key = formatUtcDate(d)
      dataMap.set(key, { onlineAmount: 0, offlineAmount: 0, otherIncome: 0, onlineCount: 0, offlineCount: 0, otherIncomeCount: 0 })
    }

    for (const o of orders) {
      const key = formatUtcDate(o.status === 'NO_SHOW' ? (o.noShowAt || o.updatedAt || o.createdAt) : o.createdAt)
      const existing = dataMap.get(key)
      if (existing) {
        if (o.status === 'NO_SHOW') {
          existing.otherIncome += retainedIncome(o)
          existing.otherIncomeCount += 1
          continue
        }
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
      otherIncome: val.otherIncome,
      onlineCount: val.onlineCount,
      offlineCount: val.offlineCount,
      otherIncomeCount: val.otherIncomeCount,
    }))

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Venue occupancy heatmap ─── */
export async function venueOccupancy(req: AuthenticatedRequest, res: Response) {
  try {
    const { venueId, startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return error(res, 'startDate, endDate 必填', 400)
    }

    const s = new Date(startDate as string)
    const e = new Date(endDate as string)
    e.setHours(23, 59, 59, 999)

    let capacityMap: Map<string, number>
    let bookingsWhere: any

    if (venueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId as string },
        select: { capacity: true, name: true },
      })
      if (!venue) return error(res, '场地不存在', 404)
      capacityMap = new Map([[venueId as string, venue.capacity]])
      bookingsWhere = {
        venueId: venueId as string,
        date: { gte: s, lte: e },
        status: { not: 'CANCELLED' },
      }
    } else {
      const venues = await prisma.venue.findMany({
        select: { id: true, capacity: true },
      })
      capacityMap = new Map(venues.map((v) => [v.id, v.capacity]))
      bookingsWhere = {
        date: { gte: s, lte: e },
        status: { not: 'CANCELLED' },
      }
    }

    const bookings = await prisma.booking.findMany({
      where: bookingsWhere,
      select: {
        date: true,
        startTime: true,
        personCount: true,
        venueId: true,
      },
    })

    // 按 date + hour 聚合
    const hourMap = new Map<string, { bookings: number; totalPlayers: number; totalCapacity: number }>()
    for (const b of bookings) {
      const dateStr = format(b.date, 'yyyy-MM-dd')
      const hour = parseInt(b.startTime.split(':')[0], 10)
      const key = `${dateStr}_${hour}`
      const existing = hourMap.get(key) || { bookings: 0, totalPlayers: 0, totalCapacity: 0 }
      existing.bookings += 1
      existing.totalPlayers += b.personCount
      existing.totalCapacity += (capacityMap.get(b.venueId) || 0)
      hourMap.set(key, existing)
    }

    const data: {
      date: string
      hour: number
      occupancyRate: number
      bookings: number
      totalPlayers: number
    }[] = []

    for (const [key, val] of hourMap) {
      const [date, hourStr] = key.split('_')
      const hour = parseInt(hourStr, 10)
      const occupancyRate = val.totalCapacity > 0
        ? Math.min(100, Math.round((val.totalPlayers / val.totalCapacity) * 100))
        : 0
      data.push({
        date,
        hour,
        occupancyRate,
        bookings: val.bookings,
        totalPlayers: val.totalPlayers,
      })
    }

    data.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.hour - b.hour
    })

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Game performance ─── */
export async function gamePerformance(req: AuthenticatedRequest, res: Response) {
  try {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return error(res, 'startDate, endDate 必填', 400)
    }

    const s = new Date(startDate as string)
    const e = new Date(endDate as string)
    e.setHours(23, 59, 59, 999)

    const games = await prisma.game.findMany({
      select: { id: true, title: true },
    })

    const venueIdFilter = req.query.venueId as string | undefined
    const bookings = await prisma.booking.findMany({
      where: {
        date: { gte: s, lte: e },
        status: { not: 'CANCELLED' },
        gameId: { not: null },
        ...(venueIdFilter ? { venueId: venueIdFilter } : {}),
      },
      select: {
        gameId: true,
        personCount: true,
        venueId: true,
        userId: true,
      },
    })

    // 获取场地容量
    const venues = await prisma.venue.findMany({
      select: { id: true, capacity: true },
    })
    const venueCapacityMap = new Map(venues.map((v) => [v.id, v.capacity]))

    // 按 game 聚合
    const gameMap = new Map<string, {
      bookingCount: number
      totalPlayers: number
      totalCapacity: number
      userIds: Set<string>
    }>()

    for (const b of bookings) {
      if (!b.gameId) continue
      const g = gameMap.get(b.gameId) || {
        bookingCount: 0,
        totalPlayers: 0,
        totalCapacity: 0,
        userIds: new Set<string>(),
      }
      g.bookingCount += 1
      g.totalPlayers += b.personCount
      g.totalCapacity += (venueCapacityMap.get(b.venueId) || 0)
      if (b.userId) g.userIds.add(b.userId)
      gameMap.set(b.gameId, g)
    }

    // 复购率：查询这些用户在此日期范围内是否多次预约同一游戏
    const gameIds = Array.from(gameMap.keys())
    let userGameBookings: { gameId: string; userId: string }[] = []
    if (gameIds.length > 0) {
      const rows = await prisma.booking.findMany({
        where: {
          date: { gte: s, lte: e },
          status: { not: 'CANCELLED' },
          gameId: { in: gameIds },
          userId: { not: null },
        },
        select: { gameId: true, userId: true },
      })
      userGameBookings = rows
        .filter((r) => r.gameId !== null && r.userId !== null)
        .map((r) => ({ gameId: r.gameId as string, userId: r.userId as string }))
    }

    const userGameCount = new Map<string, number>()
    for (const b of userGameBookings) {
      const key = `${b.gameId}_${b.userId}`
      userGameCount.set(key, (userGameCount.get(key) || 0) + 1)
    }

    const data = games.map((game) => {
      const stats = gameMap.get(game.id)
      if (!stats) {
        return {
          id: game.id,
          title: game.title,
          bookingCount: 0,
          avgOccupancyRate: 0,
          repurchaseRate: 0,
        }
      }

      const avgOccupancyRate = stats.totalCapacity > 0
        ? Math.round((stats.totalPlayers / stats.totalCapacity) * 100)
        : 0

      let repeatUsers = 0
      for (const userId of stats.userIds) {
        const key = `${game.id}_${userId}`
        if ((userGameCount.get(key) || 0) > 1) {
          repeatUsers += 1
        }
      }
      const repurchaseRate = stats.userIds.size > 0
        ? Math.round((repeatUsers / stats.userIds.size) * 100)
        : 0

      return {
        id: game.id,
        gameName: game.title,
        bookingCount: stats.bookingCount,
        avgOccupancyRate,
        repurchaseRate,
      }
    })

    // 按场次排序
    data.sort((a, b) => b.bookingCount - a.bookingCount)

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
        const noShowOrders = await prisma.order.findMany({
          where: {
            venueId: v.id,
            status: 'NO_SHOW',
            OR: [
              { noShowAt: { gte: start, lte: end } },
              { noShowAt: null, updatedAt: { gte: start, lte: end } },
            ],
          },
          select: { amount: true, refundAmount: true, penaltyAmount: true },
        })
        const otherIncome = noShowOrders.reduce((sum, order) => sum + retainedIncome(order), 0)
        const operatingRevenue = agg._sum.amount || 0
        return {
          id: v.id,
          name: v.name,
          theme: v.theme,
          revenue: operatingRevenue + otherIncome,
          operatingRevenue,
          otherIncome,
          orderCount: agg._count.id,
          otherIncomeCount: noShowOrders.filter((order) => retainedIncome(order) > 0).length,
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
        operatingRevenue: v.operatingRevenue,
        otherIncome: v.otherIncome,
        orderCount: v.orderCount,
        otherIncomeCount: v.otherIncomeCount,
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
      // 订单状态分布仅统计主订单（NORMAL），不含改签费/团购父订单
      where: {
        createdAt: { gte: start, lte: end },
        orderKind: 'NORMAL',
      },
      _count: { id: true },
    })

    const statusMap: Record<string, string> = {
      PENDING: '待支付',
      PAID: '已支付',
      READY_TO_VERIFY: '待核销',
      PLAYING: '游戏中',
      COMPLETED: '已完成',
      CANCELLED: '已取消',
      REFUNDING: '退款中',
      REFUNDED: '已退款',
      NO_SHOW: '已作废',
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
