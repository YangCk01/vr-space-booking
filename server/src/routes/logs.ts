import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { list, getTypes } from '../controllers/logController'

const router = Router()

router.get('/', authenticate, requirePermission('audit:read'), list)
router.get('/types', authenticate, requirePermission('audit:read'), getTypes)

export default router
