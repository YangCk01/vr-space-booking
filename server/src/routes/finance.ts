import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { overview, flow, refunds } from '../controllers/financeController'
import * as financialController from '../controllers/financialController'
import * as refundController from '../controllers/refundController'

const router = Router()

// 原有接口
router.get('/overview', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), overview)
router.get('/flow', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), flow)
router.get('/refunds', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), refunds)

// 新增：每日财务报表
router.get('/daily-report', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.getDailyReport)
router.get('/daily-reports', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.listDailyReports)
router.post('/generate-report', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.generateReport)
router.post('/daily-report/confirm', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.confirmDailyReport)
router.post('/daily-report/reopen', authenticate, requireRole('SUPER_ADMIN','ADMIN'), financialController.reopenDailyReport)

// 新增：对账
router.get('/reconcile', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.reconcile)
router.get('/reconcile-details', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.reconcileDetails)
router.post('/fix-reconcile-diff', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.fixReconcileDiff)

// 新增：全平台累计汇总
router.get('/total-summary', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.totalSummary)

// 新增：流水查询
router.get('/transactions', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), financialController.listTransactions)

// 新增：退款清算
router.get('/users/:id/refund-audit', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), refundController.auditRefund)
router.post('/users/:id/refund-clear', authenticate, requireRole('SUPER_ADMIN','ADMIN','FINANCE'), refundController.executeRefundClear)

export default router
