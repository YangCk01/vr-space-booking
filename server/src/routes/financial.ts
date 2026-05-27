import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import * as controller from '../controllers/financialController'
import * as refundController from '../controllers/refundController'

const router = Router()

router.use(authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'))

// 财务报表
router.get('/daily-report', controller.getDailyReport)
router.get('/daily-reports', controller.listDailyReports)
router.post('/generate-report', controller.generateReport)

// 对账
router.get('/reconcile', controller.reconcile)

// 流水查询
router.get('/transactions', controller.listTransactions)

// 退款清算
router.get('/users/:id/refund-audit', refundController.auditRefund)
router.post('/users/:id/refund-clear', refundController.executeRefundClear)

export default router
