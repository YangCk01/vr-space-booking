import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import {
  createRole,
  listRoles,
  listPermissions,
  updateRole,
  deleteRole,
  createRoleValidators,
  updateRoleValidators,
  updateRolePermissionsValidators,
} from '../controllers/roleController'

const router = Router()

router.use(authenticate)
router.use(requireRole('SUPER_ADMIN', 'ADMIN'))

router.post('/', requirePermission('setting:write'), createRoleValidators, createRole)
router.get('/', listRoles)
router.get('/permissions', listPermissions)
router.put('/:id', requirePermission('setting:write'), updateRoleValidators, updateRole)
router.put('/:id/permissions', requirePermission('setting:write'), updateRolePermissionsValidators, updateRole)
router.delete('/:id', requirePermission('setting:write'), deleteRole)

export default router
