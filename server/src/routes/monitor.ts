import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireAnyPermission } from '../middleware/rbac'
import { realtime } from '../controllers/monitorController'

const router = Router()

router.get('/realtime', authenticate, requireAnyPermission('monitor:read', 'audit:read'), realtime)

export default router
