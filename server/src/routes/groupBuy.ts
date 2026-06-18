import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import {
  list,
  publicList,
  getById,
  publicGetById,
  create,
  update,
  remove,
  batchUpdateStatus,
  batchDelete,
} from '../controllers/groupBuyController'

const router = Router()

// 公开接口（C端）
router.get('/public', publicList)
router.get('/public/:id', publicGetById)

// 管理接口（B端）
router.use(authenticate)
router.get('/', requirePermission('group-buy:read'), list)
router.get('/:id', requirePermission('group-buy:read'), getById)
router.post('/', requirePermission('group-buy:manage'), create)
router.put('/:id', requirePermission('group-buy:manage'), update)
router.delete('/:id', requirePermission('group-buy:manage'), remove)
router.post('/batch-status', requirePermission('group-buy:manage'), batchUpdateStatus)
router.post('/batch-delete', requirePermission('group-buy:manage'), batchDelete)

export default router
