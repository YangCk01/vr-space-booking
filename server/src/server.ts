import dotenv from 'dotenv'
import path from 'path'

// 先加载基础 .env
dotenv.config()

// 通过 --dev 参数加载开发环境覆盖配置
if (process.argv.includes('--dev')) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.dev'), override: true })
}

import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import app from './app'
import { setSocketIO } from './utils/socket'
import { prisma } from './utils/prisma'
import { startBackgroundJobs } from './jobs/jobBootstrap'
import { getCorsOrigins } from './utils/securityConfig'

const PORT = parseInt(process.env.PORT || '4000', 10)
const jobsEnabled = process.env.ENABLE_JOBS !== 'false'
const socketOrigins = getCorsOrigins()

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
    origin: socketOrigins,
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

  if (jobsEnabled) {
    startBackgroundJobs()
  } else {
    console.log('[Server] Background jobs disabled by ENABLE_JOBS=false')
  }
})
