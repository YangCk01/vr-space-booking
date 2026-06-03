import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import * as controller from '../controllers/couponEffectController'

const router = Router()

router.get('/', authenticate, requirePermission('marketing:campaign'), controller.list)
router.get('/summary', authenticate, requirePermission('marketing:campaign'), controller.summary)

export default router
