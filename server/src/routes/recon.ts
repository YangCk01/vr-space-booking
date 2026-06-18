import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import * as reconController from '../controllers/reconController'
import * as reconConfigController from '../controllers/reconConfigController'

const router = Router()

router.get('/batches', authenticate, requirePermission('finance:reconcile'), reconController.listBatches)
router.get('/batches/:id', authenticate, requirePermission('finance:reconcile'), reconController.getBatch)
router.post('/run', authenticate, requirePermission('finance:reconcile'), reconController.runRecon)
router.delete('/clear', authenticate, requirePermission('finance:adjust'), reconController.clearReconData)
router.get('/exceptions', authenticate, requirePermission('finance:reconcile'), reconController.listExceptions)
router.get('/exceptions/:id', authenticate, requirePermission('finance:reconcile'), reconController.getException)
router.put('/exceptions/:id/handle', authenticate, requirePermission('finance:adjust'), reconController.handleException)
router.get('/summary', authenticate, requirePermission('finance:reconcile'), reconController.getSummary)

router.get('/configs', authenticate, requirePermission('finance:reconcile'), reconConfigController.listConfigs)
router.get('/configs/:key', authenticate, requirePermission('finance:reconcile'), reconConfigController.getConfig)
router.put('/configs', authenticate, requirePermission('finance:adjust'), reconConfigController.upsertConfig)
router.delete('/configs/:key', authenticate, requirePermission('finance:adjust'), reconConfigController.deleteConfig)

router.post('/webhook-test', authenticate, requirePermission('finance:reconcile'), reconController.testWebhook)

export default router
