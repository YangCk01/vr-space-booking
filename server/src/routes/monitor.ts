import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { realtime } from '../controllers/monitorController'

const router = Router()

router.get('/realtime', authenticate, realtime)

export default router
