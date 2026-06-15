import { Request, Response } from 'express'
import { format } from 'date-fns'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification, pushAdminNotification } from './notificationController'

function generateOrderNo(): string {
  const dateStr = format(new Date(), 'yyyyMMdd')
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `PM${dateStr}${time}${random}`
}

/**
 * 获取积分商品列表
 * GET /points/products
 */
export async function listProducts(req: AuthenticatedRequest, res: Response) {
  try {
    const { type, status = 'ON_SALE' } = req.query

    const where: any = { status: status as string }
    if (type) where.type = type as string

    const products = await prisma.pointsProduct.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    return success(res, products)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 创建积分商品（管理员）
 * POST /points/products
 */
export async function createProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, description, image, type, pointsCost, discountRate, validityDays, stock, sortOrder } = req.body
    if (!name || !type || !pointsCost) {
      return error(res, '名称、类型和积分价格必填', 400)
    }

    const product = await prisma.pointsProduct.create({
      data: {
        name,
        description,
        image,
        type,
        pointsCost: parseInt(pointsCost),
        discountRate: discountRate !== undefined && discountRate !== '' ? parseInt(discountRate) : null,
        validityDays: validityDays !== undefined && validityDays !== '' ? parseInt(validityDays) : null,
        stock: stock !== undefined ? parseInt(stock) : -1,
        sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      },
    })

    return success(res, product, '商品创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 更新积分商品（管理员）
 * PUT /points/products/:id
 */
export async function updateProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { name, description, image, type, pointsCost, discountRate, validityDays, stock, status, sortOrder } = req.body

    const product = await prisma.pointsProduct.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(image !== undefined && { image }),
        ...(type && { type: type as any }),
        ...(pointsCost !== undefined && { pointsCost: parseInt(pointsCost) }),
        ...(discountRate !== undefined && discountRate !== '' && { discountRate: parseInt(discountRate) }),
        ...(discountRate === '' && { discountRate: null }),
        ...(validityDays !== undefined && validityDays !== '' && { validityDays: parseInt(validityDays) }),
        ...(validityDays === '' && { validityDays: null }),
        ...(stock !== undefined && { stock: parseInt(stock) }),
        ...(status && { status: status as any }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) }),
      },
    })

    return success(res, product, '商品更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 删除积分商品（管理员）
 * DELETE /points/products/:id
 */
export async function deleteProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string

    // 检查是否有进行中的兑换/订单，有则禁止删除
    const pendingExchange = await prisma.pointsExchange.findFirst({
      where: { productId: id, status: 'PENDING' },
    })
    const pendingOrder = await prisma.pointsOrder.findFirst({
      where: { productId: id, status: { in: ['PENDING', 'SHIPPED'] } },
    })
    if (pendingExchange || pendingOrder) {
      return error(res, '该商品存在未完成的兑换或订单，无法删除', 400)
    }

    // 先删除关联记录，再删除商品
    await prisma.$transaction([
      prisma.pointsExchange.deleteMany({ where: { productId: id } }),
      prisma.pointsOrder.deleteMany({ where: { productId: id } }),
      prisma.pointsProduct.delete({ where: { id } }),
    ])

    return success(res, null, '商品删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 兑换积分商品（虚拟商品：体验券/优惠券）
 * POST /points/exchange
 */
export async function exchangeProduct(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id
  if (!userId) return error(res, '请先登录', 401)

  try {
    const { productId } = req.body
    if (!productId) return error(res, '请选择要兑换的商品', 400)

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.pointsProduct.findUnique({ where: { id: productId } })
      if (!product) throw new Error('商品不存在')
      if (product.status !== 'ON_SALE') throw new Error('商品已下架')
      if (product.stock === 0) throw new Error('商品库存不足')
      if (product.type === 'PHYSICAL_GOOD') throw new Error('实物商品请使用下单接口')

      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new Error('用户不存在')
      if (user.points < product.pointsCost) throw new Error(`积分不足，需要 ${product.pointsCost} 积分`)

      // 扣除积分
      await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: product.pointsCost } },
      })

      // 创建兑换记录
      const exchange = await tx.pointsExchange.create({
        data: {
          userId,
          productId,
          pointsCost: product.pointsCost,
          status: 'PENDING',
        },
      })

      // 创建余额流水（积分消费）
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'POINTS_DEDUCT',
          amount: 0,
          pointsAmount: -product.pointsCost,
          remark: `积分兑换「${product.name}」消耗 ${product.pointsCost} 积分`,
        },
      })

      // 自动生成 UserCoupon
      const validFrom = new Date()
      const validTo = product.validityDays
        ? new Date(validFrom.getTime() + product.validityDays * 24 * 60 * 60 * 1000)
        : null

      const coupon = await tx.userCoupon.create({
        data: {
          userId,
          name: product.name,
          type: product.type === 'COUPON' ? 'DISCOUNT' : 'EXPERIENCE_FREE',
          discountRate: product.type === 'COUPON' ? product.discountRate : null,
          status: 'UNUSED',
          validFrom,
          validTo,
          source: '积分兑换',
          exchangeId: exchange.id,
        },
      })

      await tx.pointsExchange.update({
        where: { id: exchange.id },
        data: { status: 'COMPLETED', fulfilledAt: new Date() },
      })

      // 扣减库存
      if (product.stock > 0) {
        await tx.pointsProduct.update({
          where: { id: productId },
          data: { stock: { decrement: 1 } },
        })
        const updated = await tx.pointsProduct.findUnique({ where: { id: productId } })
        if (updated && updated.stock === 0) {
          await tx.pointsProduct.update({
            where: { id: productId },
            data: { status: 'SOLD_OUT' },
          })
        }
      }

      return { exchange, product, coupon }
    })

    await pushNotification(
      userId,
      'MARKETING',
      '积分兑换成功',
      `您使用 ${result.product.pointsCost} 积分兑换了「${result.product.name}」，已发放到优惠券`
    )

    // 管理员通知：商品售出 + 库存检查
    const updatedProduct = await prisma.pointsProduct.findUnique({ where: { id: productId } })
    if (updatedProduct) {
      await pushAdminNotification(
        'ADMIN_PRODUCT_SOLD',
        '积分商品被兑换',
        `用户兑换了「${updatedProduct.name}」，消耗 ${updatedProduct.pointsCost} 积分`,
        'USER'
      )
      if (updatedProduct.stock > 0 && updatedProduct.stock <= 5) {
        await pushAdminNotification(
          'ADMIN_LOW_STOCK',
          '商品库存不足',
          `「${updatedProduct.name}」库存仅剩 ${updatedProduct.stock} 件，请及时补货`
        )
      }
    }

    return success(res, result, '兑换成功')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('积分不足') || msg.includes('库存不足') || msg.includes('已下架') || msg.includes('实物商品')) {
      return error(res, msg, 400)
    }
    return error(res, msg, 500)
  }
}

/**
 * 实物商品下单
 * POST /points/orders
 */
export async function createPointsOrder(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id
  if (!userId) return error(res, '请先登录', 401)

  try {
    const { productId, deliveryType, recipientName, recipientPhone, address, venueId } = req.body
    if (!productId) return error(res, '请选择商品', 400)
    if (!deliveryType) return error(res, '请选择收货方式', 400)
    if (deliveryType === 'DELIVERY' && (!recipientName || !recipientPhone || !address)) {
      return error(res, '邮寄订单请填写完整的收货信息', 400)
    }
    if (deliveryType === 'PICKUP' && !venueId) {
      return error(res, '线下领取请选择领取门店', 400)
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.pointsProduct.findUnique({ where: { id: productId } })
      if (!product) throw new Error('商品不存在')
      if (product.status !== 'ON_SALE') throw new Error('商品已下架')
      if (product.stock === 0) throw new Error('商品库存不足')
      if (product.type !== 'PHYSICAL_GOOD') throw new Error('虚拟商品请直接兑换')

      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new Error('用户不存在')
      if (user.points < product.pointsCost) throw new Error(`积分不足，需要 ${product.pointsCost} 积分`)

      // 扣除积分
      await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: product.pointsCost } },
      })

      // 创建订单
      const order = await tx.pointsOrder.create({
        data: {
          orderNo: generateOrderNo(),
          userId,
          productId,
          productName: product.name,
          productType: product.type,
          pointsCost: product.pointsCost,
          deliveryType,
          recipientName: recipientName || null,
          recipientPhone: recipientPhone || null,
          address: address || null,
          venueId: venueId || null,
          status: 'PENDING',
        },
      })

      // 创建余额流水
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'POINTS_DEDUCT',
          amount: 0,
          pointsAmount: -product.pointsCost,
          remark: `积分商城下单「${product.name}」消耗 ${product.pointsCost} 积分`,
        },
      })

      // 扣减库存
      if (product.stock > 0) {
        await tx.pointsProduct.update({
          where: { id: productId },
          data: { stock: { decrement: 1 } },
        })
        const updated = await tx.pointsProduct.findUnique({ where: { id: productId } })
        if (updated && updated.stock === 0) {
          await tx.pointsProduct.update({
            where: { id: productId },
            data: { status: 'SOLD_OUT' },
          })
        }
      }

      return { order, product }
    })

    await pushNotification(
      userId,
      'MARKETING',
      '下单成功',
      `您使用 ${result.product.pointsCost} 积分兑换了「${result.product.name}」，订单号 ${result.order.orderNo}`
    )

    // 管理员通知：商品售出 + 库存检查
    const updatedProduct = await prisma.pointsProduct.findUnique({ where: { id: productId } })
    if (updatedProduct) {
      await pushAdminNotification(
        'ADMIN_PRODUCT_SOLD',
        '积分商品被下单',
        `用户下单了「${updatedProduct.name}」，订单号 ${result.order.orderNo}，消耗 ${updatedProduct.pointsCost} 积分`,
        'USER'
      )
      if (updatedProduct.stock > 0 && updatedProduct.stock <= 5) {
        await pushAdminNotification(
          'ADMIN_LOW_STOCK',
          '商品库存不足',
          `「${updatedProduct.name}」库存仅剩 ${updatedProduct.stock} 件，请及时补货`
        )
      }
    }

    return success(res, result, '下单成功')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('积分不足') || msg.includes('库存不足') || msg.includes('已下架') || msg.includes('虚拟商品') || msg.includes('收货方式')) {
      return error(res, msg, 400)
    }
    return error(res, msg, 500)
  }
}

/**
 * 获取我的订单列表
 * GET /points/orders
 */
export async function listMyPointsOrders(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id
  if (!userId) return error(res, '请先登录', 401)

  try {
    const { status, page = '1', pageSize = '20' } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = { userId }
    if (status) where.status = status as string

    const total = await prisma.pointsOrder.count({ where })
    const orders = await prisma.pointsOrder.findMany({
      where,
      include: { product: { select: { id: true, name: true, image: true, type: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
    })

    return paginated(res, orders, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 申请退货
 * POST /points/orders/:id/return
 */
export async function requestReturn(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id
  if (!userId) return error(res, '请先登录', 401)

  try {
    const id = req.params.id as string
    const { reason } = req.body
    if (!reason) return error(res, '请填写退货原因', 400)

    const order = await prisma.pointsOrder.findUnique({ where: { id } })
    if (!order) return error(res, '订单不存在', 404)
    if (order.userId !== userId) return error(res, '无权操作', 403)
    if (order.status !== 'PENDING' && order.status !== 'SHIPPED') {
      return error(res, '当前状态不可申请退货', 400)
    }

    await prisma.pointsOrder.update({
      where: { id },
      data: {
        status: 'RETURNED',
        returnReason: reason,
        returnedAt: new Date(),
      },
    })

    return success(res, null, '退货申请已提交')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取我的兑换记录
 * GET /points/exchanges
 */
export async function listMyExchanges(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id
  if (!userId) return error(res, '请先登录', 401)

  try {
    const { page = '1', pageSize = '20' } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const total = await prisma.pointsExchange.count({ where: { userId } })
    const exchanges = await prisma.pointsExchange.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
    })

    return paginated(res, exchanges, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取我的优惠券
 * GET /points/coupons
 */
export async function listMyCoupons(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id
  if (!userId) return error(res, '请先登录', 401)

  try {
    const { status } = req.query
    const where: any = { userId }
    if (status) where.status = status as string

    const coupons = await prisma.userCoupon.findMany({
      where,
      orderBy: [{ status: 'asc' }, { validTo: 'asc' }],
    })

    // 过滤掉无效的 DISCOUNT 类型券（discountRate 为 null）
    const validCoupons = coupons.filter(
      (c) => c.type !== 'DISCOUNT' || c.discountRate !== null
    )

    return success(res, validCoupons)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取当前用户可用的优惠券（下单时选择）
 * GET /points/coupons/usable
 */
export async function listUsableCoupons(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id
  if (!userId) return error(res, '请先登录', 401)

  try {
    const now = new Date()
    const coupons = await prisma.userCoupon.findMany({
      where: {
        userId,
        status: 'UNUSED',
        AND: [
          {
            OR: [
              { validFrom: null },
              { validFrom: { lte: now } },
            ],
          },
          {
            OR: [
              { validTo: null },
              { validTo: { gte: now } },
            ],
          },
        ],
        // 排除无效的 DISCOUNT 类型券（discountRate 为 null 则无法计算折扣）
        NOT: {
          type: 'DISCOUNT',
          discountRate: null,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return success(res, coupons)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

// ============== 管理员接口 ==============

/**
 * 管理员：获取全部实物订单
 * GET /points/orders/all
 */
export async function listAllPointsOrders(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId, status, page = '1', pageSize = '20' } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}
    if (userId) where.userId = userId as string
    if (status) where.status = status as string

    const total = await prisma.pointsOrder.count({ where })
    const orders = await prisma.pointsOrder.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, image: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
    })

    return paginated(res, orders, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 管理员：发货
 * PUT /points/orders/:id/ship
 */
export async function shipPointsOrder(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { trackingNumber } = req.body

    const order = await prisma.pointsOrder.update({
      where: { id },
      data: {
        status: 'SHIPPED',
        trackingNumber: trackingNumber || null,
        shippedAt: new Date(),
      },
      include: { user: { select: { id: true } } },
    })

    if (order.user?.id) {
      await pushNotification(
        order.user.id,
        'MARKETING',
        '订单已发货',
        `您的积分商城订单 ${order.orderNo} 已发货${trackingNumber ? '，物流单号：' + trackingNumber : ''}`
      )
    }

    return success(res, order, '发货成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 管理员：完成订单
 * PUT /points/orders/:id/complete
 */
export async function completePointsOrder(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string

    const order = await prisma.pointsOrder.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: { user: { select: { id: true } } },
    })

    if (order.user?.id) {
      await pushNotification(
        order.user.id,
        'MARKETING',
        '订单已完成',
        `您的积分商城订单 ${order.orderNo} 已完成`
      )
    }

    return success(res, order, '订单已完成')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 管理员：同意退货
 * PUT /points/orders/:id/approve-return
 */
export async function approveReturn(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string

    const order = await prisma.pointsOrder.findUnique({ where: { id } })
    if (!order) return error(res, '订单不存在', 404)
    if (order.status !== 'RETURNED') return error(res, '订单未申请退货', 400)

    await prisma.$transaction(async (tx) => {
      // 退回积分
      await tx.user.update({
        where: { id: order.userId },
        data: { points: { increment: order.pointsCost } },
      })

      // 创建积分退回流水
      await tx.balanceTransaction.create({
        data: {
          userId: order.userId,
          type: 'POINTS_EARN',
          amount: 0,
          pointsAmount: order.pointsCost,
          remark: `积分商城退货退款「${order.productName}」退回 ${order.pointsCost} 积分`,
        },
      })

      // 冲正原始 POINTS_DEDUCT 流水
      await tx.balanceTransaction.create({
        data: {
          userId: order.userId,
          type: 'POINTS_DEDUCT',
          amount: 0,
          pointsAmount: order.pointsCost,
          remark: `积分商城退货冲正「${order.productName}」${order.pointsCost} 积分`,
        },
      })

      // 更新订单状态
      await tx.pointsOrder.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
    })

    await pushNotification(
      order.userId,
      'MARKETING',
      '退货退款成功',
      `您的积分商城订单 ${order.orderNo} 已退货，${order.pointsCost} 积分已退回`
    )

    return success(res, null, '退货已处理，积分已退回')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 管理员：获取全部兑换记录
 * GET /points/exchanges/all
 */
export async function listAllExchanges(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId, status, page = '1', pageSize = '20' } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}
    if (userId) where.userId = userId as string
    if (status) where.status = status as string

    const total = await prisma.pointsExchange.count({ where })
    const exchanges = await prisma.pointsExchange.findMany({
      where,
      include: {
        product: true,
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
    })

    return paginated(res, exchanges, total, pageNum, sizeNum)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 管理员：处理兑换（实物商品发货/核销）
 * PUT /points/exchanges/:id/fulfill
 */
export async function fulfillExchange(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { remark } = req.body

    const exchange = await prisma.pointsExchange.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        fulfilledAt: new Date(),
        remark,
      },
      include: { product: true, user: { select: { id: true, name: true, phone: true } } },
    })

    return success(res, exchange, '兑换处理完成')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
