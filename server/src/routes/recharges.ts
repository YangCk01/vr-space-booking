import { Router } from 'express'
import { getConfig, create, confirm, list, listMy, listMyTransactions } from '../controllers/rechargeController'
import { authenticate, requireRole } from '../middleware/auth'

const router = Router()

router.get('/config', getConfig)
router.post('/', authenticate, create)
router.post('/confirm', authenticate, confirm)
router.get('/my', authenticate, listMy)
router.get('/my-transactions', authenticate, listMyTransactions)
router.get('/', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE'), list)

export default router
