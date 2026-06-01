import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { listConfigs, updateConfigByKey, updateConfigValidators } from '../controllers/systemConfigController'

const router = Router()

router.use(authenticate)
router.use(requireRole('SUPER_ADMIN', 'ADMIN'))

router.get('/', listConfigs)
router.put('/:key', requirePermission('setting:write'), updateConfigValidators, updateConfigByKey)

export default router
