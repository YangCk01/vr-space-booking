import { Router } from 'express'
import { getConfig, create, confirm, list, listMy, listMyTransactions } from '../controllers/rechargeController'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'

const router = Router()

router.get('/config', getConfig)
router.post('/', authenticate, create)
router.post('/confirm', authenticate, confirm)
router.get('/my', authenticate, listMy)
router.get('/my-transactions', authenticate, listMyTransactions)
router.get('/', authenticate, requirePermission('finance:read'), list)

export default router
