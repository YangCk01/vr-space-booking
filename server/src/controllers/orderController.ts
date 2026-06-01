import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification, pushAdminNotification } from '../controllers/notificationController'
import { format } from 'date-fns'
import { getDiscountByLevel, getPointsConfig } from '../utils/memberConfig'
import { getUserWallet, hasEnoughBalance, deductProportional } from '../utils/wallet'

export const createValidators = [
  body('venueId').notEmpty().withMessage('场地不能为空'),
  body('amount').isInt({ min: 0 }).withMessage('金额必须为正整数'),
  body('bookingTime').notEmpty().withMessage('预约时间不能为空'),
]

function generateOrderNo(): string {
  const dateStr = format(new Date(), 'yyyyMMdd')
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `VR${dateStr}${time}${random}`
}

function dayStart(dateStr: string): Date { return new Date(dateStr + 'T00:00:00.000Z') }
function dayEnd(dateStr: string): Date { return new Date(dateStr + 'T23:59:59.999Z') }

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const { status, search, page = '1', pageSize = '10', startDate, endDate, source } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}

    if (status && status !== 'all') {
      where.status = status as string
    }

    if (source && source !== 'all') {
      where.source = source as string
    }

    if (search) {
      where.OR = [
        { orderNo: { contains: search as string, mode: 'insensitive' } },
        { venueName: { contains: search as string, mode: 'insensitive' } },
      ]
    }

    // 日期范围筛选（按创建时间）
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = dayStart(startDate as string)
      }
      if (endDate) {
        where.createdAt.lte = dayEnd(endDate as string)
      }
    }

    // 普通用户只能查看自己的订单
    if (req.user?.role === 'CUSTOMER') {
      where.userId = req.user.id
    }

    // MANAGER 只能查看被分配场地的订单
    if (req.user?.role === 'MANAGER' && req.user.managedVenueIds?.length) {
      where.venueId = { in: req.user.managedVenueIds }
    } else if (req.user?.role === 'MANAGER') {
      return paginated(res, [], pageNum, sizeNum, 0)
    }

    // 查询列表、总数、各状态统计（统计去掉 status 过滤，确保各 tab 角标稳定）
    const countWhere = { ...where }
    delete countWhere.status

    const [orders, total, statusGroups] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          booking: { include: { game: { select: { id: true, title: true } } } },
          userCoupon: { select: { name: true, type: true, discountRate: true, source: true, giftReason: true, giftRemark: true } },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ['status'],
        where: countWhere,
        _count: { status: true },
      }),
    ])

    // 构建各状态数量映射
    const statusCounts: Record<string, number> = {}
    for (const g of statusGroups) {
      statusCounts[g.status.toLowerCase()] = g._count.status
    }

    const response: any = {
      success: true,
      data: orders,
      message: 'success',
      meta: {
        page: pageNum,
        pageSize: sizeNum,
        total,
        totalPages: Math.ceil(total / sizeNum),
        statusCounts,
      },
    }
    return res.status(200).json(response)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        booking: { include: { venue: true, game: true } },
        payments: true,
        userCoupon: { select: { name: true, type: true, discountRate: true, source: true, giftReason: true, giftRemark: true } },
      },
    })

    if (!order) {
      return error(res, '订单不存在', 404)
    }

    return success(res, order)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getByOrderNo(req: AuthenticatedRequest, res: Response) {
  try {
    const orderNo = req.params.orderNo as string
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        booking: { include: { venue: true, game: true } },
        payments: true,
      },
    })

    if (!order) {
      return error(res, '订单不存在', 404)
    }

    return success(res, order)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const { bookingId, venueId, venueName, amount, bookingTime, userId, source, payMethod, userCouponId } = req.body
    const currentUserId = userId || req.user?.id

    // 如果有 bookingId，检查预约是否存在
    if (bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (!booking) {
        return error(res, '预约不存在', 404)
      }
    }

    // 自动获取 venueName
    let finalVenueName = venueName
    if (!finalVenueName && venueId) {
      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      finalVenueName = venue?.name || ''
    }

    const parsedAmount = parseInt(amount)

    // 1. 先获取会员折扣率
    let discount = 100
    if (currentUserId) {
      const user = await prisma.user.findUnique({ where: { id: currentUserId } })
      if (user) {
        discount = await getDiscountByLevel(user.level)
      }
    }

    // 2. 验证优惠券并计算折扣顺序
    // 体验券：先抵扣1人原价，剩余再打会员折扣
    // 优惠券（DISCOUNT）：先会员折扣，再折上折
    let couponDiscount = 0
    let finalAmount = parsedAmount
    let finalUserCouponId: string | null = null
    let couponType: string | null = null

    if (userCouponId && currentUserId) {
      const coupon = await prisma.userCoupon.findUnique({ where: { id: userCouponId } })
      if (!coupon) throw new Error('优惠券不存在')
      if (coupon.userId !== currentUserId) throw new Error('优惠券不属于当前用户')
      if (coupon.status !== 'UNUSED') throw new Error('优惠券已被使用')
      if (coupon.validTo && coupon.validTo < new Date()) throw new Error('优惠券已过期')

      finalUserCouponId = userCouponId
      couponType = coupon.type

      if (coupon.type === 'EXPERIENCE_FREE') {
        // 体验券：先抵扣1人原价，剩余再打会员折扣
        let personCount = 1
        if (bookingId) {
          const bookingInfo = await prisma.booking.findUnique({ where: { id: bookingId } })
          personCount = bookingInfo?.personCount || 1
        } else if (req.body.personCount) {
          personCount = parseInt(req.body.personCount) || 1
        }
        const unitPrice = Math.round(parsedAmount / personCount)
        couponDiscount = unitPrice
        const afterCoupon = Math.max(0, parsedAmount - couponDiscount)
        finalAmount = Math.round(afterCoupon * discount / 100)
      } else if (coupon.type === 'DISCOUNT' && coupon.discountRate) {
        // 优惠券：先会员折扣，再折上折
        finalAmount = Math.round(parsedAmount * discount / 100)
        const beforeCoupon = finalAmount
        finalAmount = Math.round(finalAmount * coupon.discountRate / 100)
        couponDiscount = beforeCoupon - finalAmount
      }
    } else {
      // 没有优惠券，只打会员折扣
      finalAmount = Math.round(parsedAmount * discount / 100)
    }

    const pointsConfig = await getPointsConfig()
    const remainingAmount = finalAmount

    // discountAmount：会员优惠金额（基于实际打折基数）
    let discountBase = parsedAmount
    if (couponType === 'EXPERIENCE_FREE') {
      discountBase = Math.max(0, parsedAmount - couponDiscount)
    }
    const discountAmount = discountBase - Math.round(discountBase * discount / 100)

    // 余额支付：等比扣除双钱包（支持组合支付）
    if (payMethod === 'BALANCE' && currentUserId) {
      const result = await prisma.$transaction(async (tx) => {
        const freshUser = await tx.user.findUnique({ where: { id: currentUserId } })
        if (!freshUser) throw new Error('用户不存在')

        // 等比扣除双钱包
        const wallet = {
          principal: freshUser.principalBalance,
          bonus: freshUser.bonusBalance,
        }
        if (!hasEnoughBalance(wallet, remainingAmount)) {
          const total = wallet.principal + wallet.bonus
          throw new Error(`余额不足，当前总余额 ¥${total / 100}`)
        }
        const { principalDeduction, bonusDeduction } = deductProportional(wallet, remainingAmount)

        await tx.user.update({
          where: { id: currentUserId },
          data: {
            principalBalance: { decrement: principalDeduction },
            bonusBalance: { decrement: bonusDeduction },
          },
        })

        // 如果使用了优惠券，更新优惠券状态
        if (finalUserCouponId) {
          await tx.userCoupon.update({
            where: { id: finalUserCouponId },
            data: { status: 'USED', usedAt: new Date() },
          })
        }

        // 创建订单（记录所有明细）
        const order = await tx.order.create({
          data: {
            orderNo: generateOrderNo(),
            bookingId: bookingId || null,
            userId: currentUserId,
            venueId,
            venueName: finalVenueName,
            originalAmount: parsedAmount,
            amount: remainingAmount,
            discountRate: discount,
            discountAmount,
            couponDiscount,
            userCouponId: finalUserCouponId,
            principalDeduction,
            bonusDeduction,
            pointsUsed: 0,
            pointsDeduction: 0,
            status: 'PAID',
            source: source === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
            payMethod: 'BALANCE',
            paidAt: new Date(),
            bookingTime,
          },
          include: {
            user: { select: { id: true, name: true, phone: true } },
            booking: true,
          },
        })

        // 记录余额变动流水（拆分记录）
        await tx.balanceTransaction.create({
          data: {
            userId: currentUserId,
            type: 'DEDUCT',
            amount: remainingAmount,
            principalAmount: -principalDeduction,
            bonusAmount: -bonusDeduction,
            totalAmount: -remainingAmount,
            orderId: order.id,
            remark: `订单消费 ${finalVenueName}（本金¥${principalDeduction / 100}+赠送¥${bonusDeduction / 100}）`,
          },
        })

        // 赠送积分（仅由本金消耗产生）
        const earned = Math.floor(principalDeduction / 100 * pointsConfig.earnRate)
        if (earned > 0) {
          await tx.user.update({
            where: { id: currentUserId },
            data: { points: { increment: earned } },
          })
          await tx.balanceTransaction.create({
            data: {
              userId: currentUserId,
              type: 'POINTS_EARN',
              amount: 0,
              pointsAmount: earned,
              orderId: order.id,
              remark: `消费赠送积分 ${earned}（本金消费¥${principalDeduction / 100}）`,
            },
          })
        }

        // 更新用户累计本金消费
        await tx.user.update({
          where: { id: currentUserId },
          data: { totalSpent: { increment: principalDeduction } }
        })

        return order
      })

      // 管理员通知：新订单
      await pushAdminNotification(
        'ADMIN_NEW_ORDER',
        '新订单已支付',
        `${result.user?.name || '用户'} 在 ${finalVenueName} 消费 ¥${(result.amount / 100).toFixed(2)}，订单号 ${result.orderNo}`
      )

      return success(res, result, '支付成功', 201)
    }

    // 普通订单创建（待支付）—— 在线支付也享受折扣
    // 使用事务确保订单和优惠券状态一致
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          orderNo: generateOrderNo(),
          bookingId: bookingId || null,
          userId: currentUserId || null,
          venueId,
          venueName: finalVenueName,
          originalAmount: parsedAmount,
          amount: remainingAmount,
          discountRate: discount,
          discountAmount,
          couponDiscount,
          userCouponId: finalUserCouponId,
          pointsUsed: 0,
          pointsDeduction: 0,
          status: 'PENDING',
          source: source === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
          bookingTime,
        },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          booking: true,
        },
      }),
      ...(finalUserCouponId ? [
        prisma.userCoupon.update({
          where: { id: finalUserCouponId },
          data: { status: 'USED', usedAt: new Date() },
        })
      ] as any : []),
    ])

    return success(res, order, '订单创建成功', 201)
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '余额不足') return error(res, msg, 400)
    return error(res, msg, 500)
  }
}

export async function updateStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { status } = req.body

    const existing = await prisma.order.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '订单不存在', 404)
    }

    const data: any = { status }

    if (status === 'PAID') {
      data.paidAt = new Date()
    } else if (status === 'CANCELLED') {
      data.cancelledAt = new Date()
    }

    const order = await prisma.order.update({
      where: { id },
      data,
    })

    // 核销订单时，同步将关联排场标记为已完成
    if (status === 'COMPLETED' && order.bookingId) {
      await prisma.booking.update({
        where: { id: order.bookingId },
        data: { status: 'COMPLETED' },
      })
    }

    // 取消订单时，同步将关联排场标记为已取消
    if (status === 'CANCELLED' && order.bookingId) {
      await prisma.booking.update({
        where: { id: order.bookingId },
        data: { status: 'CANCELLED' },
      })
    }

    // 发送取消通知
    if (status === 'CANCELLED' && order.userId) {
      await pushNotification(
        order.userId,
        'BOOKING_CANCEL',
        '预约取消',
        `您的预约/订单 ${order.orderNo} 已取消`
      )
    }

    return success(res, order, '订单状态更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function pay(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const method = req.body?.method

    // 支持通过 orderNo 或 id 查询
    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
    })
    if (!order) {
      return error(res, '订单不存在', 404)
    }

    if (order.status !== 'PENDING') {
      return error(res, '订单状态不允许支付', 400)
    }

    // 更新订单状态
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        payMethod: method || 'WECHAT',
        paidAt: new Date(),
      },
    })

    // 赠送积分（在线支付按 order.amount 计算，全部视为现金收入）
    if (order.userId) {
      const { earnRate } = await getPointsConfig()
      const earned = Math.floor(order.amount / 100 * earnRate)
      if (earned > 0) {
        await prisma.user.update({
          where: { id: order.userId },
          data: { points: { increment: earned } },
        })
        await prisma.balanceTransaction.create({
          data: {
            userId: order.userId,
            type: 'POINTS_EARN',
            amount: 0,
            pointsAmount: earned,
            orderId: order.id,
            remark: `在线支付赠送积分 ${earned}`,
          },
        })
      }
    }

    // 发送支付成功通知
    if (order.userId) {
      await pushNotification(
        order.userId,
        'PAY_SUCCESS',
        '支付成功',
        `您的订单 ${order.orderNo} 支付成功，金额 ¥${(order.amount / 100).toFixed(2)}`
      )
    }

    // 创建支付记录
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: order.amount,
        method: method || 'WECHAT',
        status: 'SUCCESS',
      },
    })

    return success(res, updated, '支付成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function cancel(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
    })
    if (!order) {
      return error(res, '订单不存在', 404)
    }

    if (order.status === 'COMPLETED') {
      return error(res, '已完成订单不能取消', 400)
    }

    // 余额支付的订单取消时退回余额+积分
    const { earnRate } = await getPointsConfig()

    const result = await prisma.$transaction(async (tx) => {
      // 恢复优惠券状态
      if (order.userCouponId) {
        await tx.userCoupon.update({
          where: { id: order.userCouponId },
          data: { status: 'UNUSED', usedAt: null, usedOrderId: null },
        })
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      })

      if (order.userId && order.payMethod?.startsWith('BALANCE') && order.status === 'PAID') {
        // 恢复双钱包
        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: order.principalDeduction },
            bonusBalance: { increment: order.bonusDeduction },
          },
        })

        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            type: 'CANCEL_RESTORE',
            amount: order.amount,
            principalAmount: order.principalDeduction,
            bonusAmount: order.bonusDeduction,
            totalAmount: order.amount,
            orderId: order.id,
            remark: `订单取消恢复余额（本金¥${order.principalDeduction / 100}+赠送¥${order.bonusDeduction / 100}）`,
          },
        })

        // 扣除已赠送的积分（按订单记录的本金扣减计算）
        const earned = Math.floor(order.principalDeduction / 100 * earnRate)
        const user = await tx.user.findUnique({ where: { id: order.userId }, select: { points: true } })
        const deduct = Math.min(earned, user?.points || 0)
        if (deduct > 0) {
          await tx.user.update({
            where: { id: order.userId },
            data: { points: { decrement: deduct } },
          })
          await tx.balanceTransaction.create({
            data: {
              userId: order.userId,
              type: 'POINTS_REVOKE',
              amount: 0,
              pointsAmount: -deduct,
              orderId: order.id,
              remark: `订单取消收回赠送积分 ${deduct}`,
            },
          })
        }
      }

      // 同步取消关联排场
      if (order.bookingId) {
        await tx.booking.update({
          where: { id: order.bookingId },
          data: { status: 'CANCELLED' },
        })
      }

      return updated
    })

    // Send cancel notification
    if (order.userId) {
      await pushNotification(
        order.userId,
        'BOOKING_CANCEL',
        '预约取消',
        `您的订单 ${order.orderNo} 已取消`
      )
    }

    return success(res, result, '订单已取消')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function refund(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const refundAmount = req.body?.amount

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
    })
    if (!order) {
      return error(res, '订单不存在', 404)
    }

    if (order.status !== 'PAID') {
      return error(res, '只有已支付订单可申请退款', 400)
    }

    const actualRefund = refundAmount || order.amount

    // 余额支付的订单直接退回余额+积分
    const { earnRate } = await getPointsConfig()

    const result = await prisma.$transaction(async (tx) => {
      // 恢复优惠券状态
      if (order.userCouponId) {
        await tx.userCoupon.update({
          where: { id: order.userCouponId },
          data: { status: 'UNUSED', usedAt: null, usedOrderId: null },
        })
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'REFUNDED',
          refundAmount: actualRefund,
        },
      })

      if (order.userId && order.payMethod?.startsWith('BALANCE')) {
        // 恢复双钱包
        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: order.principalDeduction },
            bonusBalance: { increment: order.bonusDeduction },
          },
        })

        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            type: 'REFUND',
            amount: order.amount,
            principalAmount: order.principalDeduction,
            bonusAmount: order.bonusDeduction,
            totalAmount: order.amount,
            orderId: order.id,
            remark: `订单退款恢复余额（本金¥${order.principalDeduction / 100}+赠送¥${order.bonusDeduction / 100}）`,
          },
        })

        // 扣除已赠送的积分（按订单记录的本金扣减计算）
        const earned = Math.floor(order.principalDeduction / 100 * earnRate)
        const user = await tx.user.findUnique({ where: { id: order.userId }, select: { points: true } })
        const deduct = Math.min(earned, user?.points || 0)
        if (deduct > 0) {
          await tx.user.update({
            where: { id: order.userId },
            data: { points: { decrement: deduct } },
          })
          await tx.balanceTransaction.create({
            data: {
              userId: order.userId,
              type: 'POINTS_REVOKE',
              amount: 0,
              pointsAmount: -deduct,
              orderId: order.id,
              remark: `订单退款收回赠送积分 ${deduct}`,
            },
          })
        }
      }

      // 同步取消关联排场
      if (order.bookingId) {
        await tx.booking.update({
          where: { id: order.bookingId },
          data: { status: 'CANCELLED' },
        })
      }

      return updated
    })

    // 管理员通知：退款
    await pushAdminNotification(
      'ADMIN_REFUND_REQUEST',
      '订单已退款',
      `订单 ${order.orderNo} 已退款 ¥${(actualRefund / 100).toFixed(2)}，场地：${order.venueName}`
    )

    return success(res, result, '退款成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
