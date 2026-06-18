import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireAnyPermission, requirePermission } from '../middleware/rbac'
import * as deviceLogController from '../controllers/deviceLogController'

const router = Router()

router.get('/', authenticate, requireAnyPermission('venue:read', 'audit:read', 'finance:reconcile'), deviceLogController.listDeviceLogs)
router.post('/', authenticate, requireAnyPermission('venue:maintenance', 'venue:manage'), deviceLogController.createDeviceLog)
router.post('/batch', authenticate, requireAnyPermission('venue:maintenance', 'venue:manage'), deviceLogController.batchCreateDeviceLogs)
router.delete('/:id', authenticate, requirePermission('venue:manage'), deviceLogController.deleteDeviceLog)
router.get('/stats', authenticate, requireAnyPermission('venue:read', 'audit:read', 'finance:reconcile'), deviceLogController.getDeviceLogStats)

export default router
