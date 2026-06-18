import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireAnyPermission, requirePermission } from '../middleware/rbac'
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

router.post('/', requirePermission('role:manage'), createRoleValidators, createRole)
router.get('/', requireAnyPermission('role:read', 'account:read', 'account:manage'), listRoles)
router.get('/permissions', requireAnyPermission('role:read', 'role:manage'), listPermissions)
router.put('/:id', requirePermission('role:manage'), updateRoleValidators, updateRole)
router.put('/:id/permissions', requirePermission('role:manage'), updateRolePermissionsValidators, updateRole)
router.delete('/:id', requirePermission('role:manage'), deleteRole)

export default router
