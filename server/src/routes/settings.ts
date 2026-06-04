import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'
import * as controller from '../controllers/settingsController'

const router = Router()

// 公开接口：会员配置（供C端使用，无需管理员权限）
router.get('/member-public', controller.memberPublic)
// 公开接口：退款规则（供C端订单页展示阶梯退费规则）
router.get('/refund-rules', controller.refundRules)

router.use(authenticate, requireRole('SUPER_ADMIN','ADMIN'))

router.get('/', controller.list)
router.get('/:key', controller.getByKey)
router.post('/', logOperation({ type: '更新设置', content: (req) => `更新设置: ${req.body.key}` }), controller.update)
router.post('/bulk', logOperation({ type: '批量更新设置', content: '批量更新系统设置' }), controller.bulkUpdate)

export default router
