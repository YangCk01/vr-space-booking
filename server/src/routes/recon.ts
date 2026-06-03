import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import * as reconController from '../controllers/reconController'
import * as reconConfigController from '../controllers/reconConfigController'

const router = Router()

router.get('/batches', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.listBatches)
router.get('/batches/:id', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.getBatch)
router.post('/run', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.runRecon)
router.delete('/clear', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.clearReconData)
router.get('/exceptions', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.listExceptions)
router.get('/exceptions/:id', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.getException)
router.put('/exceptions/:id/handle', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.handleException)
router.get('/summary', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.getSummary)

router.get('/configs', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconConfigController.listConfigs)
router.get('/configs/:key', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconConfigController.getConfig)
router.put('/configs', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconConfigController.upsertConfig)
router.delete('/configs/:key', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconConfigController.deleteConfig)

router.post('/webhook-test', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), reconController.testWebhook)

export default router
