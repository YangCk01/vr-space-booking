import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import {
  giftPoints,
  giftCoupon,
  listPointsRecords,
  listCouponRecords,
  giftPointsValidators,
  giftCouponValidators,
} from '../controllers/giftController'

const router = Router()

router.use(authenticate)
router.use(requireRole('SUPER_ADMIN', 'ADMIN'))

router.post('/points', giftPointsValidators, giftPoints)
router.post('/coupon', giftCouponValidators, giftCoupon)
router.get('/points-records', listPointsRecords)
router.get('/coupon-records', listCouponRecords)

export default router
