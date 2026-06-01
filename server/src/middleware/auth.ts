import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AuthenticatedRequest, TokenPayload } from '../types'
import { error } from '../utils/response'

const JWT_SECRET = process.env.JWT_SECRET || 'vr-space-secret-key-change-in-production'

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, '未提供认证令牌', 401)
  }

  const token = authHeader.substring(7)

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
    req.user = {
      id: decoded.userId,
      phone: decoded.phone,
      name: decoded.name || '',
      role: decoded.role,
      managedVenueIds: decoded.managedVenueIds,
    }
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return error(res, '令牌已过期', 401)
    }
    return error(res, '无效的令牌', 401)
  }
}

export function optionalAuthenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
      req.user = {
        id: decoded.userId,
        phone: decoded.phone,
        name: decoded.name || '',
        role: decoded.role,
        managedVenueIds: decoded.managedVenueIds,
      }
    } catch {
      // Token invalid or expired, continue as anonymous
    }
  }
  next()
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return error(res, '未认证', 401)
    }
    if (!roles.includes(req.user.role)) {
      return error(res, '权限不足', 403)
    }
    next()
  }
}

export const requireAdmin = requireRole('ADMIN', 'SUPER_ADMIN')
