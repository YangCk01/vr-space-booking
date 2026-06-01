import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../types'
import { recordAuditLog, AuditLogInput } from '../services/auditLogService'

/**
 * 可复用的 auditLog 辅助函数
 * 在控制器方法中手动调用，记录关键业务操作
 */
export async function logAudit(
  req: AuthenticatedRequest,
  data: Omit<AuditLogInput, 'operatorId' | 'operatorName' | 'operatorRole' | 'ipAddress' | 'userAgent'>
) {
  const user = req.user
  if (!user) return

  await recordAuditLog({
    ...data,
    operatorId: user.id,
    operatorName: user.name || user.phone || '未知用户',
    operatorRole: user.role,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  })
}

/**
 * Express 中间件版（用于路由级别自动记录）
 * 用法: router.post('/path', auditLog('ACTION_NAME', '目标描述'), handler)
 *
 * 注意：此中间件只记录请求进入，不保证业务成功。
 * 建议在业务成功后使用 logAudit() 手动记录。
 */
export function auditLogMiddleware(actionName: string, targetType: string, getTargetId?: (req: AuthenticatedRequest) => string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const user = req.user
    if (user) {
      recordAuditLog({
        operatorId: user.id,
        operatorName: user.name || user.phone || '未知用户',
        operatorRole: user.role,
        targetType,
        targetId: getTargetId ? getTargetId(req) : '-',
        action: req.method,
        actionName,
        reason: '操作请求',
        ipAddress: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      }).catch(() => {})
    }
    next()
  }
}
