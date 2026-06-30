import { Router } from 'express'
import { verify, listMy, lookup, adminOverview } from '../controllers/couponController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.post('/verify', authenticate, verify)
router.get('/my', authenticate, listMy)
router.get('/admin/overview', authenticate, adminOverview)
router.get('/lookup', authenticate, lookup)

export default router
