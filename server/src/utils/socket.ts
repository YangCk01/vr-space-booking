import { Server as SocketIOServer } from 'socket.io'
import { prisma } from './prisma'
import { startOfDay, endOfDay } from 'date-fns'

let io: SocketIOServer | null = null
const monitorClients = new Set<string>()

export function setSocketIO(instance: SocketIOServer) {
  io = instance

  io.on('connection', (socket) => {
    console.log(`[Socket.io] 客户端连接: ${socket.id}`)

    socket.on('monitor:subscribe', () => {
      monitorClients.add(socket.id)
      socket.join('monitor')
      console.log(`[Socket.io] 客户端 ${socket.id} 订阅大屏监控`)
      pushMonitorData(socket)
    })

    socket.on('monitor:unsubscribe', () => {
      monitorClients.delete(socket.id)
      socket.leave('monitor')
      console.log(`[Socket.io] 客户端 ${socket.id} 取消订阅大屏监控`)
    })

    socket.on('disconnect', () => {
      monitorClients.delete(socket.id)
      console.log(`[Socket.io] 客户端断开: ${socket.id}`)
    })
  })

  // 定时推送（每 30 秒）
  setInterval(() => {
    if (monitorClients.size > 0) {
      pushMonitorData()
    }
  }, 30000)
}

async function pushMonitorData(target?: any) {
  if (!io) return

  try {
    const today = new Date()
    const todayStart = startOfDay(today)
    const todayEnd = endOfDay(today)

    const [todayBookings, todayUsed, todayRevenueAgg, totalVenues, inUseVenues, venues, recentBookings, recentOrders] = await Promise.all([
      prisma.booking.count({ where: { date: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } } }),
      prisma.booking.count({ where: { date: { gte: todayStart, lte: todayEnd }, status: { in: ['CHECKED_IN', 'COMPLETED'] } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: todayStart, lte: todayEnd }, status: { in: ['PAID', 'COMPLETED'] } }, _sum: { amount: true } }),
      prisma.venue.count(),
      prisma.venue.count({ where: { status: 'IN_USE' } }),
      prisma.venue.findMany({ select: { id: true, name: true, theme: true, status: true, capacity: true }, orderBy: { name: 'asc' } }),
      prisma.booking.findMany({
        where: { date: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { venue: { select: { id: true, name: true, theme: true } } },
      }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, orderNo: true, venueName: true, amount: true, status: true, createdAt: true } }),
    ])

    const data = {
      stats: {
        todayBookings,
        todayUsed,
        todayRevenue: todayRevenueAgg._sum.amount || 0,
        totalVenues,
        inUseVenues,
        usageRate: totalVenues > 0 ? Math.round((inUseVenues / totalVenues) * 100) : 0,
      },
      venues: venues.map((v) => ({ id: v.id, name: v.name, theme: v.theme, status: v.status, capacity: v.capacity })),
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
      timestamp: new Date().toISOString(),
    }

    if (target) {
      target.emit('monitor:data', data)
    } else {
      io.to('monitor').emit('monitor:data', data)
    }
  } catch (err) {
    console.error('[Socket.io] 推送监控数据失败:', err)
  }
}

export function notifyMonitorUpdate() {
  if (monitorClients.size > 0) {
    pushMonitorData()
  }
}
