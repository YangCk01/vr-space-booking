import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth'
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

// 管理员接口
router.post('/products', authenticate, requireAdmin, pointsController.createProduct)
router.put('/products/:id', authenticate, requireAdmin, pointsController.updateProduct)
router.delete('/products/:id', authenticate, requireAdmin, pointsController.deleteProduct)
router.get('/exchanges/all', authenticate, requireAdmin, pointsController.listAllExchanges)
router.put('/exchanges/:id/fulfill', authenticate, requireAdmin, pointsController.fulfillExchange)

// 管理员：商城订单管理
router.get('/orders/all', authenticate, requireAdmin, pointsController.listAllPointsOrders)
router.put('/orders/:id/ship', authenticate, requireAdmin, pointsController.shipPointsOrder)
router.put('/orders/:id/complete', authenticate, requireAdmin, pointsController.completePointsOrder)
router.put('/orders/:id/approve-return', authenticate, requireAdmin, pointsController.approveReturn)

export default router
