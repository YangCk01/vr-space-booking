import dotenv from 'dotenv'
dotenv.config()

import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import app from './app'
import { setSocketIO } from './utils/socket'
import { prisma } from './utils/prisma'
import { startReminderJob } from './utils/reminder'
import cron from 'node-cron'
import { runDailyReport } from './controllers/financialController'
import { subDays, format } from 'date-fns'

const PORT = parseInt(process.env.PORT || '4000', 10)

/* ─── Global error handling ─── */
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err)
  // Give logger time to flush, then exit
  setTimeout(() => process.exit(1), 1000)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
})

/* ─── Create HTTP server ─── */
const httpServer = createServer(app)

/* ─── Socket.io ─── */
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGIN?.split(',') || ['https://yourdomain.com'])
      : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
    credentials: true,
  },
})
setSocketIO(io)

/* ─── Graceful shutdown ─── */
let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`)

  // Close HTTP server (stop accepting new connections)
  httpServer.close((err) => {
    if (err) console.error('Error closing HTTP server:', err)
    console.log('✅ HTTP server closed')
  })

  // Disconnect Socket.io clients
  try {
    io.close()
    console.log('✅ Socket.io closed')
  } catch (e) {
    console.error('Error closing Socket.io:', e)
  }

  // Disconnect Prisma (release DB connections)
  try {
    await prisma.$disconnect()
    console.log('✅ Prisma disconnected')
  } catch (e) {
    console.error('Error disconnecting Prisma:', e)
  }

  console.log('👋 Goodbye')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

/* ─── Health check endpoint (internal) ─── */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
  })
})

/* ─── Start listening ─── */
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VR Space API server running on port ${PORT}`)
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🕐 Started at: ${new Date().toISOString()}`)
  startReminderJob()

  // 每日 00:05 执行财务跑批
  cron.schedule('5 0 * * *', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    console.log(`[Cron] Generating financial report for ${yesterday}`)
    try {
      await runDailyReport(yesterday)
      console.log(`[Cron] Financial report generated for ${yesterday}`)
    } catch (e) {
      console.error(`[Cron] Failed to generate report for ${yesterday}:`, e)
    }
  })
  console.log('[Cron] Daily financial report job scheduled (00:05)')
})
