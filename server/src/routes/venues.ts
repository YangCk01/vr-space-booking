import { Router } from 'express'
import {
  list,
  getById,
  create,
  update,
  remove,
  batchDelete,
  batchUpdateStatus,
  createValidators,
  updateValidators,
} from '../controllers/venueController'
import { authenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'

const router = Router()

router.get('/', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER','CUSTOMER'), list)
router.get('/:id', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER','CUSTOMER'), getById)
router.post('/', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR'), createValidators, logOperation({ type: '新增场地', content: (req) => `新增场地: ${req.body.name}` }), create)
router.put('/:id', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR'), updateValidators, logOperation({ type: '编辑场地', content: (req) => `编辑场地: ${req.body.name || req.params.id}` }), update)
router.delete('/:id', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR'), logOperation({ type: '删除场地', content: (req) => `删除场地ID: ${req.params.id}` }), remove)
router.post('/batch-delete', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR'), logOperation({ type: '批量删除场地', content: (req) => `批量删除场地: ${req.body.ids?.length}个` }), batchDelete)
router.post('/batch-status', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR'), logOperation({ type: '批量更新场地状态', content: (req) => `批量更新场地状态: ${req.body.ids?.length}个 → ${req.body.status}` }), batchUpdateStatus)

export default router
