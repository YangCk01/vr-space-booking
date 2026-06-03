import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import * as deviceLogController from '../controllers/deviceLogController'

const router = Router()

router.get('/', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), deviceLogController.listDeviceLogs)
router.post('/', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), deviceLogController.createDeviceLog)
router.post('/batch', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), deviceLogController.batchCreateDeviceLogs)
router.delete('/:id', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), deviceLogController.deleteDeviceLog)
router.get('/stats', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FINANCE'), deviceLogController.getDeviceLogStats)

export default router
