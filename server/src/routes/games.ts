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
import { authenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'

const router = Router()

// 公开接口
router.get('/', list)
router.get('/:id', getById)

// 管理接口
router.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'),
  createValidators,
  logOperation({ type: '创建游戏内容', content: (req) => `创建游戏: ${req.body.title}` }),
  create
)
router.put(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'),
  createValidators,
  logOperation({ type: '更新游戏内容', content: (req) => `更新游戏ID: ${req.params.id}` }),
  update
)
router.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'),
  logOperation({ type: '删除游戏内容', content: (req) => `删除游戏ID: ${req.params.id}` }),
  remove
)
router.post(
  '/batch-delete',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'),
  logOperation({ type: '批量删除游戏内容', content: (req) => `批量删除游戏: ${req.body.ids?.length}个` }),
  batchDelete
)
router.post(
  '/batch-status',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'),
  logOperation({ type: '批量更新游戏状态', content: (req) => `批量更新游戏状态: ${req.body.ids?.length}个 → ${req.body.status}` }),
  batchUpdateStatus
)
router.post(
  '/batch-price',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'),
  logOperation({ type: '批量更新游戏价格', content: (req) => `批量更新游戏价格: ${req.body.ids?.length}个 → ¥${req.body.price / 100}` }),
  batchUpdatePrice
)

export default router
