import { Router } from 'express'
import { verify, listMy, lookup, adminOverview } from '../controllers/couponController'
import { authenticate } from '../middleware/auth'
import { requireAnyPermission } from '../middleware/rbac'

const router = Router()

router.post('/verify', authenticate, requireAnyPermission('order:verify', 'group-buy:manage'), verify)
router.get('/my', authenticate, listMy)
router.get('/admin/overview', authenticate, requireAnyPermission('member:marketing', 'user:read'), adminOverview)
router.get('/lookup', authenticate, requireAnyPermission('order:verify', 'group-buy:read', 'member:marketing', 'user:read'), lookup)

export default router
