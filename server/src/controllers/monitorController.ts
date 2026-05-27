import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { startOfDay, endOfDay } from 'date-fns'
import { success } from '../utils/response'

export async function realtime(req: Request, res: Response) {
  try {
    const today = new Date()
    const todayStart = startOfDay(today)
    const todayEnd = endOfDay(today)

    // 今日预约数
    const todayBookings = await prisma.booking.count({
      where: {
        date: { gte: todayStart, lte: todayEnd },
        status: { not: 'CANCELLED' },
      },
    })

    // 今日已完成/进行中场次
    const todayUsed = await prisma.booking.count({
      where: {
        date: { gte: todayStart, lte: todayEnd },
        status: { in: ['CHECKED_IN', 'COMPLETED'] },
      },
    })

    // 今日营业额（已支付订单）
    const todayRevenue = await prisma.order.aggregate({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        status: { in: ['PAID', 'COMPLETED'] },
      },
      _sum: { amount: true },
    })

    // 场地总数
    const totalVenues = await prisma.venue.count()

    // 使用中场地数
    const inUseVenues = await prisma.venue.count({
      where: { status: 'IN_USE' },
    })

    // 场地使用率
    const usageRate = totalVenues > 0 ? Math.round((inUseVenues / totalVenues) * 100) : 0

    // 所有场地状态
    const venues = await prisma.venue.findMany({
      select: {
        id: true,
        name: true,
        theme: true,
        status: true,
        capacity: true,
      },
      orderBy: { name: 'asc' },
    })

    // 今日最新预约动态
    const recentBookings = await prisma.booking.findMany({
      where: {
        date: { gte: todayStart, lte: todayEnd },
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        venue: { select: { id: true, name: true, theme: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
    })

    // 最近订单动态
    const recentOrders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNo: true,
        venueName: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    })

    return success(res, {
      stats: {
        todayBookings,
        todayUsed,
        todayRevenue: todayRevenue._sum.amount || 0,
        totalVenues,
        inUseVenues,
        usageRate,
      },
      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        theme: v.theme,
        status: v.status,
        capacity: v.capacity,
        currentBooking: null, // 可由前端根据 bookings 计算
      })),
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        venueName: b.venue?.name || '未知场地',
        venueTheme: b.venue?.theme || '',
        personName: b.personName,
        personPhone: b.personPhone,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        createdAt: b.createdAt,
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        venueName: o.venueName,
        amount: o.amount,
        status: o.status,
        createdAt: o.createdAt,
      })),
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: (err as Error).message,
    })
  }
}
