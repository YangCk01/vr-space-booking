import { Router } from 'express'
import {
  approveApproval,
  createOrderRefundApproval,
  createNoShowRefundApproval,
  listApprovals,
  rejectApproval,
} from '../controllers/approvalController'
import { authenticate } from '../middleware/auth'
import { requireAnyPermission, requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'

const router = Router()

router.get('/', authenticate, requireAnyPermission('approval:read', 'approval:request', 'approval:approve'), listApprovals)

router.post(
  '/orders/:id/no-show-refund',
  authenticate,
  requirePermission('approval:request'),
  logOperation({ type: '发起审批', content: (req) => `发起已作废退款审批: ${req.params.id}` }),
  createNoShowRefundApproval
)

router.post(
  '/orders/:id/refund',
  authenticate,
  requirePermission('approval:request'),
  logOperation({ type: '发起审批', content: (req) => `发起订单退款审批: ${req.params.id}` }),
  createOrderRefundApproval
)

router.post(
  '/:id/approve',
  authenticate,
  requirePermission('approval:approve'),
  logOperation({ type: '审批通过', content: (req) => `审批通过: ${req.params.id}` }),
  approveApproval
)

router.post(
  '/:id/reject',
  authenticate,
  requirePermission('approval:approve'),
  logOperation({ type: '审批拒绝', content: (req) => `审批拒绝: ${req.params.id}` }),
  rejectApproval
)

export default router
