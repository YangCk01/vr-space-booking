import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { list, getTypes } from '../controllers/logController'

const router = Router()

router.get('/', authenticate, requireRole('SUPER_ADMIN','ADMIN'), list)
router.get('/types', authenticate, requireRole('SUPER_ADMIN','ADMIN'), getTypes)

export default router
