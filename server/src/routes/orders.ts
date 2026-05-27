import { Router } from 'express'
import {
  list,
  getById,
  getByOrderNo,
  create,
  updateStatus,
  pay,
  cancel,
  refund,
  createValidators,
} from '../controllers/orderController'
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'

const router = Router()

router.get('/', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER','CUSTOMER'), list)
router.get('/by-no/:orderNo', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER','CUSTOMER'), getByOrderNo)
router.get('/:id', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','FINANCE','MANAGER','CUSTOMER'), getById)
router.post('/', optionalAuthenticate, createValidators, logOperation({ type: '创建订单', content: (req) => `创建订单: ${req.body.venueName || req.body.venueId}` }), create)
router.put('/:id/status', authenticate, logOperation({ type: '修改订单状态', content: (req) => `修改订单状态: ${req.params.id} → ${req.body.status}` }), updateStatus)
router.put('/:id/pay', authenticate, logOperation({ type: '订单支付', content: (req) => `订单支付: ${req.params.id}` }), pay)
router.put('/:id/cancel', authenticate, logOperation({ type: '取消订单', content: (req) => `取消订单: ${req.params.id}` }), cancel)
router.put('/:id/refund', authenticate, logOperation({ type: '订单退款', content: (req) => `订单退款: ${req.params.id}` }), refund)

export default router
