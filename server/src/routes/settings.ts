import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'
import * as controller from '../controllers/settingsController'

const router = Router()

// 公开接口：会员配置（供C端使用，无需管理员权限）
router.get('/member-public', controller.memberPublic)
// 公开接口：页面展示配置（供C端首页使用）
router.get('/page-public', controller.pagePublic)
// 公开接口：退款规则（供C端订单页展示阶梯退费规则）
router.get('/refund-rules', controller.refundRules)
// 公开接口：预约配置（供C端使用）
router.get('/booking-config', controller.bookingConfig)
// 公开接口：生命周期配置（供C端使用）
router.get('/booking-lifecycle', controller.bookingLifecycle)
// 公开接口：第三方平台配置（供C端券码兑换/支付使用）
router.get('/platform-public', controller.platformPublic)

router.use(authenticate)

router.get('/', requirePermission('setting:read'), controller.list)
router.get('/:key', requirePermission('setting:read'), controller.getByKey)
router.post('/', requirePermission('setting:write'), logOperation({ type: '更新设置', content: (req) => `更新设置: ${req.body.key}` }), controller.update)
router.post('/bulk', requirePermission('setting:write'), logOperation({ type: '批量更新设置', content: '批量更新系统设置' }), controller.bulkUpdate)

export default router
