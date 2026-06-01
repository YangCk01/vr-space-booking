import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import * as controller from '../controllers/triggerRuleController'

const router = Router()

router.get('/', authenticate, controller.list)
router.post('/', authenticate, requireAdmin, controller.create)
router.put('/:id', authenticate, requireAdmin, controller.update)
router.delete('/:id', authenticate, requireAdmin, controller.remove)
router.post('/:id/toggle', authenticate, requireAdmin, controller.toggle)

export default router
