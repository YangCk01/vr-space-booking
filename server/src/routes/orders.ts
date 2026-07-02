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
  noShowDisposition,
  batchVerify,
  batchRefund,
  markNoShow,
  activate,
  redeem,
  redeemCustomer,
  createValidators,
  batchVerifyValidators,
  batchRefundValidators,
  redeemValidators,
  redeemCustomerValidators,
} from '../controllers/orderController'
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth'
import { requireAnyPermissionOrRole, requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'
import { validateRequest } from '../middleware/validateRequest'
import { idParamSchema } from '../contracts/common'
import { payOrderSchema, refundOrderSchema } from '../contracts/order'

const router = Router()

router.get('/', authenticate, requireAnyPermissionOrRole(['order:read', 'group-buy:read'], ['CUSTOMER']), list)
router.get('/by-no/:orderNo', authenticate, requireAnyPermissionOrRole(['order:read', 'group-buy:read'], ['CUSTOMER']), getByOrderNo)
router.get('/:id', authenticate, requireAnyPermissionOrRole(['order:read', 'group-buy:read'], ['CUSTOMER']), getById)
router.post('/', optionalAuthenticate, createValidators, logOperation({ type: '创建订单', content: (req) => `创建订单: ${req.body.venueName || req.body.venueId}` }), create)
router.put('/:id/status', authenticate, logOperation({ type: '修改订单状态', content: (req) => `修改订单状态: ${req.params.id} → ${req.body.status}` }), updateStatus)
router.put('/:id/pay', authenticate, validateRequest({ params: idParamSchema, body: payOrderSchema }), logOperation({ type: '订单支付', content: (req) => `订单支付: ${req.params.id}` }), pay)
router.put('/:id/cancel', authenticate, logOperation({ type: '取消订单', content: (req) => `取消订单: ${req.params.id}` }), cancel)
router.put('/:id/refund', authenticate, requirePermission('order:refund'), validateRequest({ params: idParamSchema, body: refundOrderSchema }), logOperation({ type: '订单退款', content: (req) => `订单退款: ${req.params.id}` }), refund)
router.post('/:id/no-show-disposition', authenticate, requirePermission('order:refund'), logOperation({ type: '已作废退款处置', content: (req) => `已作废退款处置: ${req.params.id}` }), noShowDisposition)
router.post('/batch-verify', authenticate, requirePermission('order:verify'), batchVerifyValidators, logOperation({ type: '批量核销订单', content: (req) => `批量核销 ${req.body.ids?.length || 0} 个订单` }), batchVerify)
router.post('/batch-refund', authenticate, requirePermission('order:refund'), batchRefundValidators, logOperation({ type: '批量退款订单', content: (req) => `批量退款 ${req.body.ids?.length || 0} 个订单` }), batchRefund)
router.post('/:id/mark-no-show', authenticate, requirePermission('order:verify'), logOperation({ type: '标记爽约', content: (req) => `标记订单爽约: ${req.params.id}` }), markNoShow)
router.post('/:id/activate', authenticate, requirePermission('order:verify'), logOperation({ type: '撤销作废订单', content: (req) => `撤销作废订单: ${req.params.id}` }), activate)
router.post('/redeem', authenticate, requirePermission('order:verify'), redeemValidators, logOperation({ type: '团购券核销', content: (req) => `团购券核销: ${req.body.verifyCode || req.body.id}` }), redeem)
router.post('/:id/redeem', authenticate, requireRole('CUSTOMER'), redeemCustomerValidators, logOperation({ type: 'C端团购券预约', content: (req) => `C端团购券预约: ${req.params.id}` }), redeemCustomer)

export default router
