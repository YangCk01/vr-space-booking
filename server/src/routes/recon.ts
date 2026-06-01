import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import * as reconController from '../controllers/reconController'
import * as reconConfigController from '../controllers/reconConfigController'

const router = Router()

router.get('/batches', authenticate, requireAdmin, reconController.listBatches)
router.get('/batches/:id', authenticate, requireAdmin, reconController.getBatch)
router.post('/run', authenticate, requireAdmin, reconController.runRecon)
router.delete('/clear', authenticate, requireAdmin, reconController.clearReconData)
router.get('/exceptions', authenticate, requireAdmin, reconController.listExceptions)
router.get('/exceptions/:id', authenticate, requireAdmin, reconController.getException)
router.put('/exceptions/:id/handle', authenticate, requireAdmin, reconController.handleException)
router.get('/summary', authenticate, requireAdmin, reconController.getSummary)

router.get('/configs', authenticate, requireAdmin, reconConfigController.listConfigs)
router.get('/configs/:key', authenticate, requireAdmin, reconConfigController.getConfig)
router.put('/configs', authenticate, requireAdmin, reconConfigController.upsertConfig)
router.delete('/configs/:key', authenticate, requireAdmin, reconConfigController.deleteConfig)

router.post('/webhook-test', authenticate, requireAdmin, reconController.testWebhook)

export default router
