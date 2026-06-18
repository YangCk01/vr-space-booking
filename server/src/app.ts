import express from 'express'
import cors from 'cors'
import path from 'path'
import routes from './routes'
import { errorHandler } from './middleware/errorHandler'
import { startReconJob } from './jobs/reconciliationJob'
import { startDataConsistencyJob } from './jobs/dataConsistencyJob'
import { startUserTagJob } from './jobs/userTagJob'
import { startTriggerJob } from './jobs/triggerJob'
import { startCouponEffectJob } from './jobs/couponEffectJob'
import { startOrderTimeoutJob } from './jobs/orderTimeoutJob'
import { startBookingLifecycleJob } from './jobs/bookingLifecycleJob'
import { startBookingReminderJob } from './jobs/bookingReminderJob'
import { loadConfig } from './services/configService'
import { seedPermissions } from './utils/seedPermissions'

const app = express()
const jobsEnabled = process.env.ENABLE_JOBS !== 'false'

// 中间件
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : process.env.NODE_ENV === 'production'
    ? []
    : true

app.use(cors({
  origin: Array.isArray(corsOrigin) && corsOrigin.length === 0 ? false : corsOrigin,
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 静态文件
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API 路由
app.use('/api', routes)

// 错误处理
app.use(errorHandler)

if (jobsEnabled) {
  // 启动对账定时任务
  startReconJob()

  // 启动数据一致性校验定时任务
  startDataConsistencyJob()

  // 启动 P1 运营增长定时任务
  startUserTagJob()
  startTriggerJob()
  startCouponEffectJob()

  // 启动订单超时自动取消任务
  startOrderTimeoutJob()

  // 启动预约生命周期定时任务（状态自动流转 + No-Show 处理）
  startBookingLifecycleJob()

  // 启动预约提醒定时任务（开场前2小时/核销提前量通知）
  startBookingReminderJob()
} else {
  console.log('[App] Background jobs disabled by ENABLE_JOBS=false')
}

// 启动时加载系统配置并初始化权限
seedPermissions()
  .then(() => loadConfig())
  .catch((err) => console.error('[App] Seed/Config init error:', err))

export default app
