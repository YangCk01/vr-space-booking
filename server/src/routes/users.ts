import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'
import * as controller from '../controllers/usersController'
import { assignRolesToUser, getUserRoles, assignRoleValidators } from '../controllers/roleController'

const router = Router()

router.use(authenticate)

// Staff management routes (SUPER_ADMIN and ADMIN only)
router.get('/staff', requireRole('SUPER_ADMIN', 'ADMIN'), controller.listStaff)
router.post(
  '/staff',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  logOperation({ type: '新增员工', content: (req) => `新增员工: ${req.body.name}` }),
  controller.createStaff
)
router.put(
  '/staff/:id',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  logOperation({ type: '编辑员工', content: (req) => `编辑员工: ${req.body.name || req.params.id}` }),
  controller.updateStaff
)
router.delete(
  '/staff/:id',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  logOperation({ type: '删除员工', content: (req) => `删除员工ID: ${req.params.id}` }),
  controller.deleteStaff
)
router.post(
  '/staff/:id/reset-password',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  logOperation({ type: '重置密码', content: (req) => `重置员工密码: ${req.params.id}` }),
  controller.resetPassword
)
router.post(
  '/staff/:id/assign-venues',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  logOperation({ type: '分配场地', content: (req) => `分配场地给员工: ${req.params.id}` }),
  controller.assignVenues
)

// User role assignment routes
router.post('/:id/roles', requireRole('SUPER_ADMIN', 'ADMIN'), assignRoleValidators, assignRolesToUser)
router.get('/:id/roles', requireRole('SUPER_ADMIN', 'ADMIN'), getUserRoles)

// Existing customer user routes
router.get('/', controller.list)
router.post('/', logOperation({ type: '新增用户', content: (req) => `新增用户: ${req.body.name}` }), controller.create)
router.get('/:id', controller.getById)
router.put('/:id', controller.updateValidators, logOperation({ type: '编辑用户', content: (req) => `编辑用户: ${req.body.name || req.params.id}` }), controller.update)
router.delete('/:id', logOperation({ type: '删除用户', content: (req) => `删除用户ID: ${req.params.id}` }), controller.remove)

// 用户标签（P1）
import * as userTagController from '../controllers/userTagController'
router.get('/:id/tags', authenticate, userTagController.getUserTags)
router.get('/tags/stats', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), userTagController.tagStats)

export default router
