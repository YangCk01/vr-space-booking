import { Router } from 'express'
import {
  list,
  getById,
  create,
  update,
  remove,
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

export default router
