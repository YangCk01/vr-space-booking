import { Router } from 'express'
import { verify, listMy, useCoupon } from '../controllers/couponController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.post('/verify', authenticate, verify)
router.get('/my', authenticate, listMy)
router.put('/:id/use', authenticate, useCoupon)

export default router
