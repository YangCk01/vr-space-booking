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
  venueOccupancy,
  gamePerformance,
} from '../controllers/analyticsController'
import { authenticate } from '../middleware/auth'
import { requireAnyPermission } from '../middleware/rbac'

const router = Router()
const canViewAnalytics = requireAnyPermission('finance:report', 'order:read', 'venue:read')

router.get('/dashboard', authenticate, canViewAnalytics, dashboard)
router.get('/revenue', authenticate, canViewAnalytics, revenue)
router.get('/venue-revenue-ranking', authenticate, canViewAnalytics, venueRevenueRanking)
router.get('/time-distribution', authenticate, canViewAnalytics, timeDistribution)
router.get('/user-growth', authenticate, canViewAnalytics, userGrowth)
router.get('/payment-methods', authenticate, canViewAnalytics, paymentMethodDistribution)
router.get('/order-status', authenticate, canViewAnalytics, orderStatusDistribution)
router.get('/repurchase-rate', authenticate, canViewAnalytics, repurchaseRate)
router.get('/game-popularity', authenticate, canViewAnalytics, gamePopularity)
router.get('/venue-occupancy', authenticate, canViewAnalytics, venueOccupancy)
router.get('/game-performance', authenticate, canViewAnalytics, gamePerformance)

export default router
