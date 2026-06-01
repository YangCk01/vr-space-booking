import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import * as controller from '../controllers/campaignController'

const router = Router()

router.get('/', authenticate, controller.list)
router.post('/', authenticate, requireAdmin, controller.create)
router.get('/:id', authenticate, controller.getById)
router.get('/:id/stats', authenticate, controller.stats)
router.post('/:id/pause', authenticate, requireAdmin, controller.pause)
router.post('/:id/end', authenticate, requireAdmin, controller.end)
router.post('/:id/activate', authenticate, requireAdmin, controller.activate)

export default router
