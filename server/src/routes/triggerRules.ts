import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import * as controller from '../controllers/triggerRuleController'

const router = Router()

router.get('/', authenticate, controller.list)
router.post('/', authenticate, requirePermission('marketing:rule'), controller.create)
router.put('/:id', authenticate, requirePermission('marketing:rule'), controller.update)
router.delete('/:id', authenticate, requirePermission('marketing:rule'), controller.remove)
router.post('/:id/toggle', authenticate, requirePermission('marketing:rule'), controller.toggle)

export default router
