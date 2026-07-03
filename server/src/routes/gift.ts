import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import {
  giftPoints,
  giftCoupon,
  listPointsRecords,
  listCouponRecords,
  batchGiftPoints,
  batchGiftCoupon,
  getGiftApprovalPolicy,
  updateGiftApprovalPolicy,
  giftPointsValidators,
  giftCouponValidators,
  batchGiftPointsValidators,
  batchGiftCouponValidators,
} from '../controllers/giftController'

const router = Router()

router.use(authenticate)

router.get('/approval-policy', getGiftApprovalPolicy)
router.put('/approval-policy', updateGiftApprovalPolicy)

router.use(requirePermission('user:gift'))

router.post('/points', requirePermission('user:gift'), giftPointsValidators, giftPoints)
router.post('/coupon', requirePermission('user:gift'), giftCouponValidators, giftCoupon)
router.post('/batch-gift-points', requirePermission('user:gift'), batchGiftPointsValidators, batchGiftPoints)
router.post('/batch-gift-coupon', requirePermission('user:gift'), batchGiftCouponValidators, batchGiftCoupon)
router.get('/points-records', listPointsRecords)
router.get('/coupon-records', listCouponRecords)

export default router
