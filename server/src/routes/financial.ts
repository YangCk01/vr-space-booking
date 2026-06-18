import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import * as controller from '../controllers/financialController'
import * as refundController from '../controllers/refundController'

const router = Router()

router.use(authenticate)

// 财务报表
router.get('/daily-report', requirePermission('finance:report'), controller.getDailyReport)
router.get('/daily-reports', requirePermission('finance:report'), controller.listDailyReports)
router.post('/generate-report', requirePermission('finance:report'), controller.generateReport)

// 对账
router.get('/reconcile', requirePermission('finance:reconcile'), controller.reconcile)

// 流水查询
router.get('/transactions', requirePermission('finance:read'), controller.listTransactions)

// 退款清算
router.get('/users/:id/refund-audit', requirePermission('finance:read'), refundController.auditRefund)
router.post('/users/:id/refund-clear', requirePermission('finance:adjust'), refundController.executeRefundClear)

export default router
