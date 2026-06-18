import { Router } from 'express'
import { requirePermission } from '../middleware/rbac'
import { authenticate } from '../middleware/auth'
import * as controller from '../controllers/triggerRuleController'

const router = Router()

router.get('/', authenticate, requirePermission('marketing:rule'), controller.list)
router.post('/', authenticate, requirePermission('marketing:rule'), controller.create)
router.put('/:id', authenticate, requirePermission('marketing:rule'), controller.update)
router.delete('/:id', authenticate, requirePermission('marketing:rule'), controller.remove)
router.post('/:id/toggle', authenticate, requirePermission('marketing:rule'), controller.toggle)

export default router
