import { Router } from 'express'
import {
  list,
  publicList,
  publicGetById,
  getById,
  create,
  update,
  remove,
  batchDelete,
  batchUpdateStatus,
  createValidators,
  updateValidators,
} from '../controllers/venueController'
import { authenticate } from '../middleware/auth'
import { requireAnyPermissionOrRole, requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'

const router = Router()

router.get('/public', publicList)
router.get('/public/:id', publicGetById)
router.get('/', authenticate, requireAnyPermissionOrRole([
  'venue:read',
  'booking:read',
  'booking:manage',
  'order:read',
  'finance:read',
  'finance:report',
  'group-buy:read',
  'group-buy:manage',
  'account:read',
  'account:manage',
], ['CUSTOMER']), list)
router.get('/:id', authenticate, requireAnyPermissionOrRole([
  'venue:read',
  'booking:read',
  'booking:manage',
  'order:read',
  'finance:read',
  'finance:report',
  'group-buy:read',
  'group-buy:manage',
  'account:read',
  'account:manage',
], ['CUSTOMER']), getById)
router.post('/', authenticate, requirePermission('venue:manage'), createValidators, logOperation({ type: '新增场地', content: (req) => `新增场地: ${req.body.name}` }), create)
router.put('/:id', authenticate, requireAnyPermissionOrRole(['venue:manage', 'venue:maintenance']), updateValidators, logOperation({ type: '编辑场地', content: (req) => `编辑场地: ${req.body.name || req.params.id}` }), update)
router.delete('/:id', authenticate, requirePermission('venue:manage'), logOperation({ type: '删除场地', content: (req) => `删除场地ID: ${req.params.id}` }), remove)
router.post('/batch-delete', authenticate, requirePermission('venue:manage'), logOperation({ type: '批量删除场地', content: (req) => `批量删除场地: ${req.body.ids?.length}个` }), batchDelete)
router.post('/batch-status', authenticate, requireAnyPermissionOrRole(['venue:manage', 'venue:maintenance']), logOperation({ type: '批量更新场地状态', content: (req) => `批量更新场地状态: ${req.body.ids?.length}个 → ${req.body.status}` }), batchUpdateStatus)

export default router
