import { Router } from 'express'
import { getConfig, create, confirm, list, listMy, listMyTransactions, staffRecharge } from '../controllers/rechargeController'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { validateRequest } from '../middleware/validateRequest'
import { createRechargeSchema, confirmRechargeSchema, staffRechargeSchema } from '../contracts/recharge'

const router = Router()

router.get('/config', getConfig)
router.post('/staff', authenticate, requirePermission('recharge:staff'), validateRequest({ body: staffRechargeSchema }), staffRecharge)
router.post('/', authenticate, validateRequest({ body: createRechargeSchema }), create)
router.post('/confirm', authenticate, validateRequest({ body: confirmRechargeSchema }), confirm)
router.get('/my', authenticate, listMy)
router.get('/my-transactions', authenticate, listMyTransactions)
router.get('/', authenticate, requirePermission('finance:read'), list)

export default router
