import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { notifyMonitorUpdate } from '../utils/socket'

/**
 * 操作日志中间件
 * 自动记录 POST/PUT/DELETE 请求的操作日志
 *
 * 使用方法：
 * router.post('/', authenticate, logOperation('新增场地'), create)
 */

interface LogConfig {
  type: string
  content?: string | ((req: AuthenticatedRequest) => string)
}

export function logOperation(config: LogConfig | string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { method } = req
    const user = req.user

    // 只记录 POST/PUT/DELETE
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next()
    }

    // 拦截 res.end 以在响应完成后记录日志
    const originalEnd = res.end.bind(res)
    let ended = false

    res.end = function (...args: any[]) {
      if (ended) {
        return res as any
      }
      ended = true

      // 恢复原始方法
      res.end = originalEnd

      // 在原始 end 执行后检查状态码并记录日志
      const statusCode = res.statusCode

      if (statusCode >= 200 && statusCode < 300) {
        const logType = typeof config === 'string' ? config : config.type
        let logContent: string

        if (typeof config === 'string') {
          logContent = buildDefaultContent(req)
        } else if (typeof config.content === 'function') {
          logContent = config.content(req)
        } else if (typeof config.content === 'string') {
          logContent = config.content
        } else {
          logContent = buildDefaultContent(req)
        }

        // 异步记录日志，不阻塞响应
        prisma.operationLog.create({
          data: {
            userId: user?.id || null,
            operator: user?.name || user?.phone || '未知用户',
            type: logType,
            content: logContent,
            ip: req.ip || req.socket.remoteAddress || null,
          },
        }).then(() => {
          // 关键操作触发大屏监控更新
          notifyMonitorUpdate()
        }).catch((err) => {
          console.error('[OperationLog] 记录失败:', err)
        })
      }

      // 调用原始 end 方法
      return originalEnd.apply(res, args as any)
    }

    next()
  }
}

function buildDefaultContent(req: AuthenticatedRequest): string {
  const { method, originalUrl, body, params } = req
  const parts: string[] = []

  if (params && Object.keys(params).length > 0) {
    parts.push(`参数: ${JSON.stringify(params)}`)
  }

  if (body && typeof body === 'object' && Object.keys(body).length > 0) {
    // 过滤敏感字段
    const safeBody = { ...body }
    delete safeBody.password
    delete safeBody.token
    parts.push(`数据: ${JSON.stringify(safeBody)}`)
  }

  return parts.join(' | ') || `${method} ${originalUrl}`
}
