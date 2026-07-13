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
const canViewBusinessAnalytics = requireAnyPermission('finance:report')
const canViewVenueAnalytics = requireAnyPermission('finance:report', 'venue:read')

router.get('/dashboard', authenticate, canViewBusinessAnalytics, dashboard)
router.get('/revenue', authenticate, canViewBusinessAnalytics, revenue)
router.get('/venue-revenue-ranking', authenticate, canViewBusinessAnalytics, venueRevenueRanking)
router.get('/time-distribution', authenticate, canViewBusinessAnalytics, timeDistribution)
router.get('/user-growth', authenticate, canViewBusinessAnalytics, userGrowth)
router.get('/payment-methods', authenticate, canViewBusinessAnalytics, paymentMethodDistribution)
router.get('/order-status', authenticate, canViewBusinessAnalytics, orderStatusDistribution)
router.get('/repurchase-rate', authenticate, canViewBusinessAnalytics, repurchaseRate)
router.get('/game-popularity', authenticate, canViewBusinessAnalytics, gamePopularity)
router.get('/venue-occupancy', authenticate, canViewVenueAnalytics, venueOccupancy)
router.get('/game-performance', authenticate, canViewVenueAnalytics, gamePerformance)

export default router
