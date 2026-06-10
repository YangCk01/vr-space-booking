import { Router } from 'express'
import {
  approveApproval,
  createOrderRefundApproval,
  createNoShowRefundApproval,
  listApprovals,
  rejectApproval,
} from '../controllers/approvalController'
import { authenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'

const router = Router()

router.get('/', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'FINANCE', 'MANAGER'), listApprovals)

router.post(
  '/orders/:id/no-show-refund',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'FINANCE', 'MANAGER'),
  logOperation({ type: '发起审批', content: (req) => `发起已作废退款审批: ${req.params.id}` }),
  createNoShowRefundApproval
)

router.post(
  '/orders/:id/refund',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'FINANCE', 'MANAGER'),
  logOperation({ type: '发起审批', content: (req) => `发起订单退款审批: ${req.params.id}` }),
  createOrderRefundApproval
)

router.post(
  '/:id/approve',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'MANAGER'),
  logOperation({ type: '审批通过', content: (req) => `审批通过: ${req.params.id}` }),
  approveApproval
)

router.post(
  '/:id/reject',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'MANAGER'),
  logOperation({ type: '审批拒绝', content: (req) => `审批拒绝: ${req.params.id}` }),
  rejectApproval
)

export default router
