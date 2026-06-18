import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../types'
import { error } from '../utils/response'

export function requirePermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return error(res, '未认证', 401)
    }

    const userPermissions = req.user.permissions || []

    const hasAll = permissions.every((p) => userPermissions.includes(p))
    if (!hasAll) {
      return error(res, '权限不足', 403)
    }

    next()
  }
}

export function requireAnyPermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return error(res, '未认证', 401)
    }

    const userPermissions = req.user.permissions || []
    if (!permissions.some((p) => userPermissions.includes(p))) {
      return error(res, '权限不足', 403)
    }

    next()
  }
}

export function requireAnyPermissionOrRole(permissions: string[], roles: string[] = []) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return error(res, '未认证', 401)
    }

    if (roles.includes(req.user.role)) {
      return next()
    }

    const userPermissions = req.user.permissions || []
    if (!permissions.some((p) => userPermissions.includes(p))) {
      return error(res, '权限不足', 403)
    }

    next()
  }
}
