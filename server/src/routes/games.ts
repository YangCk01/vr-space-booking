import { Router } from 'express'
import {
  list,
  getById,
  create,
  update,
  remove,
  batchDelete,
  batchUpdateStatus,
  batchUpdatePrice,
  createValidators,
} from '../controllers/gameController'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'

const router = Router()

// 公开接口
router.get('/', list)
router.get('/:id', getById)

// 管理接口
router.post(
  '/',
  authenticate,
  requirePermission('content:manage'),
  createValidators,
  logOperation({ type: '创建游戏内容', content: (req) => `创建游戏: ${req.body.title}` }),
  create
)
router.put(
  '/:id',
  authenticate,
  requirePermission('content:manage'),
  createValidators,
  logOperation({ type: '更新游戏内容', content: (req) => `更新游戏ID: ${req.params.id}` }),
  update
)
router.delete(
  '/:id',
  authenticate,
  requirePermission('content:manage'),
  logOperation({ type: '删除游戏内容', content: (req) => `删除游戏ID: ${req.params.id}` }),
  remove
)
router.post(
  '/batch-delete',
  authenticate,
  requirePermission('content:manage'),
  logOperation({ type: '批量删除游戏内容', content: (req) => `批量删除游戏: ${req.body.ids?.length}个` }),
  batchDelete
)
router.post(
  '/batch-status',
  authenticate,
  requirePermission('content:manage'),
  logOperation({ type: '批量更新游戏状态', content: (req) => `批量更新游戏状态: ${req.body.ids?.length}个 → ${req.body.status}` }),
  batchUpdateStatus
)
router.post(
  '/batch-price',
  authenticate,
  requirePermission('content:manage'),
  logOperation({ type: '批量更新游戏价格', content: (req) => `批量更新游戏价格: ${req.body.ids?.length}个 → ¥${req.body.price / 100}` }),
  batchUpdatePrice
)

export default router
