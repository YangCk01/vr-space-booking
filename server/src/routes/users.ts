import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { requireAnyPermission, requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'
import * as controller from '../controllers/usersController'
import { assignRolesToUser, getUserRoles, assignRoleValidators } from '../controllers/roleController'

const router = Router()

router.use(authenticate)

// Staff management routes (SUPER_ADMIN and ADMIN only)
router.get('/staff', requirePermission('account:read'), controller.listStaff)
router.post(
  '/staff',
  requirePermission('account:manage'),
  logOperation({ type: '新增员工', content: (req) => `新增员工: ${req.body.name}` }),
  controller.createStaff
)
router.put(
  '/staff/:id',
  requirePermission('account:manage'),
  logOperation({ type: '编辑员工', content: (req) => `编辑员工: ${req.body.name || req.params.id}` }),
  controller.updateStaff
)
router.delete(
  '/staff/:id',
  requirePermission('account:manage'),
  logOperation({ type: '删除员工', content: (req) => `删除员工ID: ${req.params.id}` }),
  controller.deleteStaff
)
router.post(
  '/staff/:id/reset-password',
  requirePermission('account:manage'),
  logOperation({ type: '重置密码', content: (req) => `重置员工密码: ${req.params.id}` }),
  controller.resetPassword
)
router.post(
  '/staff/:id/assign-venues',
  requirePermission('account:manage'),
  logOperation({ type: '分配场地', content: (req) => `分配场地给员工: ${req.params.id}` }),
  controller.assignVenues
)

// User role assignment routes
router.post('/:id/roles', requirePermission('account:manage'), assignRoleValidators, assignRolesToUser)
router.get('/:id/roles', requirePermission('account:read'), getUserRoles)

// 用户标签（P1）
import * as userTagController from '../controllers/userTagController'
router.get('/tags/stats', authenticate, requireAnyPermission('user:read', 'marketing:campaign'), userTagController.tagStats)

// Existing customer user routes
router.get('/', requireAnyPermission('user:read', 'booking:manage', 'marketing:campaign'), controller.list)
router.post('/', requirePermission('user:edit'), logOperation({ type: '新增用户', content: (req) => `新增用户: ${req.body.name}` }), controller.create)
router.get('/:id', requirePermission('user:read'), controller.getById)
router.put('/:id', requirePermission('user:edit'), controller.updateValidators, logOperation({ type: '编辑用户', content: (req) => `编辑用户: ${req.body.name || req.params.id}` }), controller.update)
router.delete('/:id', requirePermission('user:edit'), logOperation({ type: '删除用户', content: (req) => `删除用户ID: ${req.params.id}` }), controller.remove)
router.get('/:id/tags', authenticate, userTagController.getUserTags)

export default router
