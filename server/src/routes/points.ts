import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import * as pointsController from '../controllers/pointsController'

const router = Router()

// 公共接口
router.get('/products', pointsController.listProducts)

// 需要登录
router.post('/exchange', authenticate, pointsController.exchangeProduct)
router.get('/exchanges', authenticate, pointsController.listMyExchanges)
router.get('/coupons', authenticate, pointsController.listMyCoupons)
router.get('/coupons/usable', authenticate, pointsController.listUsableCoupons)

// 实物商品订单
router.post('/orders', authenticate, pointsController.createPointsOrder)
router.get('/orders', authenticate, pointsController.listMyPointsOrders)
router.post('/orders/:id/return', authenticate, pointsController.requestReturn)

// 积分商城管理接口
router.post('/products', authenticate, requirePermission('points:mall'), pointsController.createProduct)
router.put('/products/:id', authenticate, requirePermission('points:mall'), pointsController.updateProduct)
router.delete('/products/:id', authenticate, requirePermission('points:mall'), pointsController.deleteProduct)
router.get('/exchanges/all', authenticate, requirePermission('points:mall'), pointsController.listAllExchanges)
router.put('/exchanges/:id/fulfill', authenticate, requirePermission('points:mall'), pointsController.fulfillExchange)

// 积分商城订单管理
router.get('/orders/all', authenticate, requirePermission('points:mall'), pointsController.listAllPointsOrders)
router.put('/orders/:id/ship', authenticate, requirePermission('points:mall'), pointsController.shipPointsOrder)
router.put('/orders/:id/complete', authenticate, requirePermission('points:mall'), pointsController.completePointsOrder)
router.put('/orders/:id/approve-return', authenticate, requirePermission('points:mall'), pointsController.approveReturn)

export default router
