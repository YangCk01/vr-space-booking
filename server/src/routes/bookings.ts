import { Router } from 'express'
import {
  list,
  calendar,
  getById,
  create,
  update,
  remove,
  checkConflict,
  createValidators,
} from '../controllers/bookingController'
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'

const router = Router()

router.get('/', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER','CUSTOMER'), list)
router.get('/calendar', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER','CUSTOMER'), calendar)
router.get('/check-conflict', authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER','CUSTOMER'), checkConflict)
router.get('/:id', authenticate, getById)
router.post('/', optionalAuthenticate, createValidators, logOperation({ type: '新增预约', content: (req) => `新增预约: ${req.body.title || req.body.venueId}` }), create)
router.put('/:id', authenticate, logOperation({ type: '编辑预约', content: (req) => `编辑预约ID: ${req.params.id}` }), update)
router.delete('/:id', authenticate, logOperation({ type: '取消预约', content: (req) => `取消预约ID: ${req.params.id}` }), remove)

export default router
