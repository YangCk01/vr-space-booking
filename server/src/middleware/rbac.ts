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
