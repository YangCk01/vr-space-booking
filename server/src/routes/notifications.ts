import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { list, markRead, unreadCount, clearAll } from '../controllers/notificationController'

const router = Router()

router.get('/', authenticate, list)
router.get('/unread-count', authenticate, unreadCount)
router.patch('/:id/read', authenticate, markRead)
router.delete('/all', authenticate, clearAll)

export default router
