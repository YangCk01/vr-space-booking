import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import {
  overview,
  flow,
  refunds,
  auditRecords,
  auditRecordDetail,
  getAuditConfig,
  updateAuditConfig,
  forceMatchAuditRecord,
} from '../controllers/financeController'
import * as complianceController from '../controllers/complianceController'
import * as financialController from '../controllers/financialController'
import * as refundController from '../controllers/refundController'

const router = Router()

// 原有接口
router.get('/overview', authenticate, requirePermission('finance:read'), overview)
router.get('/flow', authenticate, requirePermission('finance:read'), flow)
router.get('/refunds', authenticate, requirePermission('finance:read'), refunds)
router.get('/audit/config', authenticate, requirePermission('finance:read'), getAuditConfig)
router.put('/audit/config', authenticate, requirePermission('finance:adjust'), updateAuditConfig)
router.get('/audit/records', authenticate, requirePermission('finance:read'), auditRecords)
router.get('/audit/records/:id', authenticate, requirePermission('finance:read'), auditRecordDetail)
router.post('/audit/records/:id/force-match', authenticate, requirePermission('finance:adjust'), forceMatchAuditRecord)

// 新增：每日财务报表
router.get('/daily-report', authenticate, requirePermission('finance:report'), financialController.getDailyReport)
router.get('/daily-reports', authenticate, requirePermission('finance:report'), financialController.listDailyReports)
router.post('/generate-report', authenticate, requirePermission('finance:report'), financialController.generateReport)
router.post('/daily-report/confirm', authenticate, requirePermission('finance:adjust'), financialController.confirmDailyReport)
router.post('/daily-report/reopen', authenticate, requirePermission('finance:adjust'), financialController.reopenDailyReport)

// 新增：对账
router.get('/reconcile', authenticate, requirePermission('finance:reconcile'), financialController.reconcile)
router.get('/reconcile-details', authenticate, requirePermission('finance:reconcile'), financialController.reconcileDetails)
router.post('/fix-reconcile-diff', authenticate, requirePermission('finance:adjust'), financialController.fixReconcileDiff)

// 新增：全平台累计汇总
router.get('/total-summary', authenticate, requirePermission('finance:report'), financialController.totalSummary)

// 新增：流水查询
router.get('/transactions', authenticate, requirePermission('finance:read'), financialController.listTransactions)

// 新增：退款清算
router.get('/users/:id/refund-audit', authenticate, requirePermission('finance:read'), refundController.auditRefund)
router.post('/users/:id/refund-clear', authenticate, requirePermission('finance:adjust'), refundController.executeRefundClear)

// 业财合规控制台
router.get('/compliance/records', authenticate, requirePermission('finance:read'), complianceController.getComplianceRecords)
router.get('/compliance/overview', authenticate, requirePermission('finance:read'), complianceController.getComplianceOverview)
router.post('/compliance/records/:id/force-match', authenticate, requirePermission('finance:adjust'), complianceController.forceMatchComplianceRecord)
router.post('/compliance/records/:id/invoice', authenticate, requirePermission('finance:adjust'), complianceController.invoiceComplianceRecord)
router.post('/compliance/batch-invoice', authenticate, requirePermission('finance:adjust'), complianceController.batchInvoiceComplianceRecords)
router.post('/compliance/bank-import', authenticate, requirePermission('finance:reconcile'), complianceController.importBankStatements)

export default router
