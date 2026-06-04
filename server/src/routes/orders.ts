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
  batchVerify,
  batchRefund,
  markNoShow,
  activate,
  createValidators,
  batchVerifyValidators,
  batchRefundValidators,
} from '../controllers/orderController'
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
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
router.post('/batch-verify', authenticate, requirePermission('order:verify'), batchVerifyValidators, logOperation({ type: '批量核销订单', content: (req) => `批量核销 ${req.body.ids?.length || 0} 个订单` }), batchVerify)
router.post('/batch-refund', authenticate, requirePermission('order:refund'), batchRefundValidators, logOperation({ type: '批量退款订单', content: (req) => `批量退款 ${req.body.ids?.length || 0} 个订单` }), batchRefund)
router.post('/:id/mark-no-show', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER'), logOperation({ type: '标记爽约', content: (req) => `标记订单爽约: ${req.params.id}` }), markNoShow)
router.post('/:id/activate', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER'), logOperation({ type: '激活作废订单', content: (req) => `激活作废订单: ${req.params.id}` }), activate)

export default router
