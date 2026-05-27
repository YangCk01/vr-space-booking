import { Router } from 'express'
import authRoutes from './auth'
import venueRoutes from './venues'
import bookingRoutes from './bookings'
import orderRoutes from './orders'
import analyticsRoutes from './analytics'
import equipmentRoutes from './equipment'
import usersRoutes from './users'
import settingsRoutes from './settings'
import logsRoutes from './logs'
import monitorRoutes from './monitor'
import uploadRoutes from './upload'
import searchRoutes from './search'
import gameRoutes from './games'
import rechargeRoutes from './recharges'
import financeRoutes from './finance'
import notificationRoutes from './notifications'
import couponRoutes from './coupons'

const router = Router()

router.use('/auth', authRoutes)
router.use('/venues', venueRoutes)
router.use('/bookings', bookingRoutes)
router.use('/orders', orderRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/equipment', equipmentRoutes)
router.use('/users', usersRoutes)
router.use('/settings', settingsRoutes)
router.use('/logs', logsRoutes)
router.use('/monitor', monitorRoutes)
router.use('/upload', uploadRoutes)
router.use('/search', searchRoutes)
router.use('/games', gameRoutes)
router.use('/recharges', rechargeRoutes)
router.use('/finance', financeRoutes)
router.use('/notifications', notificationRoutes)
router.use('/coupons', couponRoutes)

export default router
