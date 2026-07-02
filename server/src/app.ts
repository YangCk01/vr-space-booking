import express from 'express'
import cors from 'cors'
import path from 'path'
import routes from './routes'
import docsRoutes from './routes/docs'
import { errorHandler } from './middleware/errorHandler'
import { requestIdMiddleware } from './middleware/requestId'
import { requestLogger } from './middleware/requestLogger'
import { loadConfig } from './services/configService'
import { seedPermissions } from './utils/seedPermissions'

const app = express()

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

// 全局请求 ID（最早注入，便于日志与错误追踪串联）
app.use(requestIdMiddleware)
app.use(requestLogger)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 静态文件
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API 路由：v1 为当前规范版本，/api 保持向后兼容
app.use('/api/v1', routes)
app.use('/api', routes)
app.use('/api', docsRoutes)

// 错误处理
app.use(errorHandler)

// 启动时加载系统配置并初始化权限
seedPermissions()
  .then(() => loadConfig())
  .catch((err) => console.error('[App] Seed/Config init error:', err))

export default app
