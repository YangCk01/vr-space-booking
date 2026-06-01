import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import * as controller from '../controllers/couponEffectController'

const router = Router()

router.get('/', authenticate, requireAdmin, controller.list)
router.get('/summary', authenticate, requireAdmin, controller.summary)

export default router
