import { Router } from 'express'
import {
  dashboard,
  revenue,
  venueRevenueRanking,
  timeDistribution,
  userGrowth,
  paymentMethodDistribution,
  orderStatusDistribution,
  repurchaseRate,
  gamePopularity,
} from '../controllers/analyticsController'
import { authenticate, requireRole } from '../middleware/auth'

const router = Router()

router.get('/dashboard', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), dashboard)
router.get('/revenue', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), revenue)
router.get('/venue-revenue-ranking', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), venueRevenueRanking)
router.get('/time-distribution', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), timeDistribution)
router.get('/user-growth', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), userGrowth)
router.get('/payment-methods', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), paymentMethodDistribution)
router.get('/order-status', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), orderStatusDistribution)
router.get('/repurchase-rate', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), repurchaseRate)
router.get('/game-popularity', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER'), gamePopularity)

export default router
