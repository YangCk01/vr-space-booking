import { Router } from 'express'
import { NextFunction, Response } from 'express'
import { requireAnyPermission } from '../middleware/rbac'
import { authenticate } from '../middleware/auth'
import { listConfigs, updateConfigByKey, updateConfigValidators } from '../controllers/systemConfigController'
import { AuthenticatedRequest } from '../types'
import { error } from '../utils/response'

const router = Router()

const memberMarketingConfigKeys = new Set([
  'member_level_names',
  'member_level_thresholds',
  'member_discount_rates',
  'member_free_reschedule_quotas',
  'points_earn_ratio',
  'points_deduct_ratio',
  'points_gift_daily_limit',
  'coupon_gift_daily_limit',
])

function requireSystemConfigWrite(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return error(res, '未认证', 401)

  const permissions = req.user.permissions || []
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key
  if (permissions.includes('setting:write')) return next()
  if (permissions.includes('user:gift') && memberMarketingConfigKeys.has(key)) return next()

  return error(res, '权限不足', 403)
}

router.use(authenticate)

router.get('/', requireAnyPermission(
  'setting:read',
  'booking:read',
  'booking:manage',
  'user:read',
  'user:gift',
  'marketing:campaign',
  'finance:read',
  'order:read'
), listConfigs)
router.put('/:key', requireSystemConfigWrite, updateConfigValidators, updateConfigByKey)

export default router
