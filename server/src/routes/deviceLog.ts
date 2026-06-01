import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
import * as deviceLogController from '../controllers/deviceLogController'

const router = Router()

router.get('/', authenticate, requireAdmin, deviceLogController.listDeviceLogs)
router.post('/', authenticate, requireAdmin, deviceLogController.createDeviceLog)
router.post('/batch', authenticate, requireAdmin, deviceLogController.batchCreateDeviceLogs)
router.delete('/:id', authenticate, requireAdmin, deviceLogController.deleteDeviceLog)
router.get('/stats', authenticate, requireAdmin, deviceLogController.getDeviceLogStats)

export default router
