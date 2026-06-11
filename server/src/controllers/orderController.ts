import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification, pushAdminNotification } from '../controllers/notificationController'
import { format } from 'date-fns'
import { getDiscountByLevel, getPointsConfig } from '../utils/memberConfig'
import { getUserWallet, hasEnoughBalance, deductProportional } from '../utils/wallet'
import { checkBatchLimit } from '../services/riskControlService'
import { logAudit } from '../middleware/auditLog'
import { handleEvent } from '../jobs/triggerJob'
import { expirePendingOrders } from '../jobs/orderTimeoutJob'
import { processBookingLifecycle } from '../jobs/bookingLifecycleJob'
import { onCouponUsed } from '../services/campaignRewardService'
import { releaseEquipment } from '../services/equipmentService'

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

function getLocalBookingStartTime(date: Date, startTime: string): Date {
  const dateStr = date.toISOString().split('T')[0]
  return new Date(`${dateStr}T${startTime}:00+08:00`)
}

async function getRestoreNoShowTargetStatus(booking: { date: Date; startTime: string } | null) {
  if (!booking) {
    return {
      orderStatus: 'PAID' as const,
      bookingStatus: 'CONFIRMED' as const,
    }
  }

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['verify_advance_minutes', 'no_show_deadline_minutes'] } },
  })
  const map: Record<string, any> = {}
  for (const setting of settings) {
    const raw = setting.value as any
    map[setting.key] = raw?.value ?? raw
  }

  const verifyAdvanceMinutes = Number(map.verify_advance_minutes ?? 15)
  const noShowDeadlineMinutes = Number(map.no_show_deadline_minutes ?? 15)
  const now = new Date()
  const start = getLocalBookingStartTime(booking.date, booking.startTime)
  const readyAt = new Date(start.getTime() - verifyAdvanceMinutes * 60 * 1000)
  const noShowDeadline = new Date(start.getTime() + noShowDeadlineMinutes * 60 * 1000)

  if (now >= noShowDeadline) {
    throw new Error('该预约已超过爽约截止时间，不能恢复为可核销订单')
  }

  if (now >= readyAt) {
    return {
      orderStatus: 'READY_TO_VERIFY' as const,
      bookingStatus: 'READY' as const,
    }
  }

  return {
    orderStatus: 'PAID' as const,
    bookingStatus: 'CONFIRMED' as const,
  }
}

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    await expirePendingOrders()
    await processBookingLifecycle()

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
    await expirePendingOrders()
    await processBookingLifecycle()

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
    await expirePendingOrders()
    await processBookingLifecycle()

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

        // 支付成功：扣减优惠券并记录关联订单
        if (finalUserCouponId) {
          await tx.userCoupon.update({
            where: { id: finalUserCouponId },
            data: { status: 'USED', usedAt: new Date(), usedOrderId: order.id },
          })
        }

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
    // 优惠券不在创建时预占，待支付成功后再扣减
    const expireAt = new Date(Date.now() + 30 * 60 * 1000)
    const order = await prisma.order.create({
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
        expireAt,
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        booking: true,
      },
    })

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
    } else if (status === 'NO_SHOW') {
      data.noShowAt = new Date()
      data.noShowReason = 'manual'
    } else if (status === 'COMPLETED') {
      data.verifiedAt = new Date()
    }

    const order = await prisma.order.update({
      where: { id },
      data,
    })

    // 同步更新关联排场状态
    if (order.bookingId) {
      const bookingStatusMap: Record<string, 'READY' | 'PLAYING' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'> = {
        READY_TO_VERIFY: 'READY',
        PLAYING: 'PLAYING',
        COMPLETED: 'COMPLETED',
        NO_SHOW: 'NO_SHOW',
        CANCELLED: 'CANCELLED',
      }
      const bs = bookingStatusMap[status]
      if (bs) {
        await prisma.booking.update({
          where: { id: order.bookingId },
          data: { status: bs },
        })
      }
    }

    // 触发条件规则（ORDER_COMPLETED 事件）
    if (status === 'COMPLETED' && order.userId) {
      try {
        await handleEvent('ORDER_COMPLETED', { userId: order.userId, orderId: order.id, amount: order.amount })
      } catch (e) {
        console.error('[TriggerJob] 订单完成事件触发失败:', e)
      }
      // 更新营销活动券使用追踪
      if (order.userCouponId) {
        try {
          await onCouponUsed(order.userCouponId, order.id, order.amount)
        } catch (e) {
          console.error('[Campaign] 券使用追踪失败:', e)
        }
      }
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
    await expirePendingOrders()

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
      if (order.status === 'CANCELLED' && order.expireAt && new Date() > order.expireAt) {
        return error(res, '订单已过期，请重新下单', 400)
      }
      return error(res, '订单状态不允许支付', 400)
    }

    // 检查订单是否已过期
    if (order.expireAt && new Date() > order.expireAt) {
      return error(res, '订单已过期，请重新下单', 400)
    }

    // 余额支付检查
    if (method === 'BALANCE' && order.userId) {
      const user = await prisma.user.findUnique({ where: { id: order.userId } })
      if (!user) return error(res, '用户不存在', 400)
      const wallet = { principal: user.principalBalance, bonus: user.bonusBalance }
      const { getUserWallet, hasEnoughBalance, deductProportional } = await import('../utils/wallet')
      if (!hasEnoughBalance(wallet, order.amount)) {
        return error(res, `余额不足，当前余额 ¥${(wallet.principal + wallet.bonus) / 100}`, 400)
      }
    }

    // 支付成功：更新订单 + 扣优惠券 + 赠积分（事务保护）
    const updated = await prisma.$transaction(async (tx) => {
      // 1. 扣减优惠券（支付成功时才扣）
      if (order.userCouponId) {
        const coupon = await tx.userCoupon.findUnique({ where: { id: order.userCouponId } })
        if (coupon && coupon.status === 'UNUSED') {
          await tx.userCoupon.update({
            where: { id: order.userCouponId },
            data: { status: 'USED', usedAt: new Date(), usedOrderId: order.id },
          })
        }
      }

      // 2. 余额支付扣款
      let principalDeduction = 0
      let bonusDeduction = 0
      if (method === 'BALANCE' && order.userId) {
        const freshUser = await tx.user.findUnique({ where: { id: order.userId } })
        if (freshUser) {
          const { hasEnoughBalance, deductProportional } = await import('../utils/wallet')
          const wallet = { principal: freshUser.principalBalance, bonus: freshUser.bonusBalance }
          const result = deductProportional(wallet, order.amount)
          principalDeduction = result.principalDeduction
          bonusDeduction = result.bonusDeduction
          await tx.user.update({
            where: { id: order.userId },
            data: {
              principalBalance: { decrement: principalDeduction },
              bonusBalance: { decrement: bonusDeduction },
            },
          })
          await tx.balanceTransaction.create({
            data: {
              userId: order.userId,
              type: 'DEDUCT',
              amount: order.amount,
              principalAmount: -principalDeduction,
              bonusAmount: -bonusDeduction,
              totalAmount: -order.amount,
              orderId: order.id,
              remark: `订单消费 ${order.venueName}（本金¥${principalDeduction / 100}+赠送¥${bonusDeduction / 100}）`,
            },
          })
          // 更新累计本金消费
          await tx.user.update({
            where: { id: order.userId },
            data: { totalSpent: { increment: principalDeduction } },
          })
        }
      }

      // 3. 更新订单状态（余额支付记录扣款明细）
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          payMethod: method || 'WECHAT',
          paidAt: new Date(),
          ...(method === 'BALANCE' ? { principalDeduction, bonusDeduction } : {}),
        },
      })

      // 4. 创建支付记录
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: order.amount,
          method: method || 'WECHAT',
          status: 'SUCCESS',
        },
      })

      return o
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

    return success(res, updated, '支付成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

interface RefundTier {
  hours: number
  rate: number
  label: string
}

/* ─── 阶梯退费比例计算 ─── */
async function calcRefundRate(bookingDate: Date, startTime: string): Promise<number> {
  const start = new Date(bookingDate)
  const [h, m] = startTime.split(':')
  start.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  const diffHours = (start.getTime() - Date.now()) / (1000 * 60 * 60)

  // 从数据库读取阶梯规则，没有则使用默认
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'booking_refund_tiers' } })
  const rawVal = setting?.value as any
  const raw = (typeof rawVal === 'object' && rawVal !== null && 'value' in rawVal ? rawVal.value : rawVal) as RefundTier[] | undefined
  const tiers: RefundTier[] = raw && Array.isArray(raw) && raw.length > 0
    ? raw
    : [
        { hours: 24, rate: 100, label: '开场24小时前' },
        { hours: 2, rate: 50, label: '开场2-24小时' },
        { hours: 0, rate: 0, label: '开场2小时内' },
      ]

  // 按 hours 降序排列，找到第一个满足 diffHours >= hours 的规则
  const sorted = [...tiers].sort((a, b) => b.hours - a.hours)
  for (const tier of sorted) {
    if (diffHours >= tier.hours) {
      return tier.rate / 100
    }
  }
  return 0
}

export async function cancel(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
      include: { booking: true },
    })
    if (!order) {
      return error(res, '订单不存在', 404)
    }

    if (['COMPLETED', 'NO_SHOW', 'PLAYING'].includes(order.status)) {
      return error(res, '该订单状态不允许取消', 400)
    }

    const isPaidOrder = ['PAID', 'READY_TO_VERIFY'].includes(order.status)

    // 已付款订单遵守取消/退款时限；未支付订单即使已过期也允许关闭并释放场次。
    if (isPaidOrder && order.booking) {
      const start = new Date(order.booking.date)
      const [h, m] = order.booking.startTime.split(':')
      start.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
      const diffHours = (start.getTime() - Date.now()) / (1000 * 60 * 60)

      const cancelSetting = await prisma.systemSetting.findUnique({ where: { key: 'booking_cancel_hours' } })
      const raw = cancelSetting?.value as any
      const cancelHours = (typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw) ?? 2

      if (diffHours <= cancelHours) {
        return error(res, `开场前${cancelHours}小时内不可取消`, 400)
      }
    }

    // 计算阶梯退费比例
    let refundRate = 1
    if (isPaidOrder && order.booking) {
      refundRate = await calcRefundRate(order.booking.date, order.booking.startTime)
    }
    const refundAmount = isPaidOrder ? Math.floor((order.amount || 0) * refundRate) : 0

    const { earnRate } = await getPointsConfig()

    const result = await prisma.$transaction(async (tx) => {
      // 恢复优惠券状态（仅当已使用时才恢复）
      if (order.userCouponId) {
        const coupon = await tx.userCoupon.findUnique({ where: { id: order.userCouponId } })
        if (coupon && coupon.status === 'USED') {
          await tx.userCoupon.update({
            where: { id: order.userCouponId },
            data: { status: 'UNUSED', usedAt: null, usedOrderId: null },
          })
        }
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          refundAmount: refundAmount > 0 ? refundAmount : null,
        },
      })

      // 已支付订单：按阶梯退费规则退回余额
      if (order.userId && order.payMethod?.startsWith('BALANCE') && isPaidOrder && refundAmount > 0) {
        // 等比计算退回金额（基于实际扣款明细）
        const totalDeducted = (order.principalDeduction || 0) + (order.bonusDeduction || 0)
        const ratio = totalDeducted > 0 ? refundAmount / totalDeducted : 0
        const refundPrincipal = Math.floor((order.principalDeduction || 0) * ratio)
        const refundBonus = refundAmount - refundPrincipal

        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: refundPrincipal },
            bonusBalance: { increment: refundBonus },
          },
        })

        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            type: 'CANCEL_RESTORE',
            amount: refundAmount,
            principalAmount: refundPrincipal,
            bonusAmount: refundBonus,
            totalAmount: refundAmount,
            orderId: order.id,
            remark: `订单取消恢复余额（本金¥${refundPrincipal / 100}+赠送¥${refundBonus / 100}）退费比例${(refundRate * 100).toFixed(0)}%`,
          },
        })
      }

      // 已支付订单取消时收回赠送积分（查询当时发放记录，确保收回数量一致）
      if (order.userId && isPaidOrder) {
        const earnTx = await tx.balanceTransaction.findFirst({
          where: { orderId: order.id, type: 'POINTS_EARN' },
        })
        const earned = earnTx?.pointsAmount || 0
        if (earned > 0) {
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

    if (order.bookingId) {
      try {
        await releaseEquipment(order.bookingId)
      } catch (e) {
        console.error(`[OrderCancel] Booking ${order.bookingId} 设备释放失败:`, e)
      }
    }

    // Send cancel notification
    if (order.userId) {
      const refundText = refundAmount > 0 ? `，已退回 ¥${(refundAmount / 100).toFixed(2)}` : ''
      await pushNotification(
        order.userId,
        'BOOKING_CANCEL',
        '预约取消',
        `您的订单 ${order.orderNo} 已取消${refundText}`
      )
    }

    await logAudit(req, {
      targetType: 'ORDER',
      targetId: order.id,
      targetDesc: `订单 ${order.orderNo}`,
      action: 'POST',
      actionName: '取消订单',
      beforeValue: { status: order.status, amount: order.amount, refundRate },
      afterValue: { status: 'CANCELLED', refundAmount },
      reason: req.body?.reason || '用户取消订单',
    })

    return success(res, { ...result, refundRate, refundAmount }, '订单已取消')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function executeOrderRefund(input: {
  orderIdOrNo: string
  amount?: number
  reason: string
  req?: AuthenticatedRequest
}) {
  const refundAmount = Number(input.amount ?? 0)
  const reason = String(input.reason || '').trim()

  if (!reason) throw new Error('请填写退款原因')

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: input.orderIdOrNo }, { orderNo: input.orderIdOrNo }] },
  })
  if (!order) throw new Error('订单不存在')
  if (order.status === 'NO_SHOW') {
    throw new Error('已作废订单请使用退款处置流程')
  }
  if (!['PAID', 'READY_TO_VERIFY'].includes(order.status)) {
    throw new Error('该订单状态不允许退款')
  }

  const actualRefund = refundAmount > 0 ? refundAmount : order.amount
  if (!Number.isInteger(actualRefund) || actualRefund <= 0 || actualRefund > order.amount) {
    throw new Error('退款金额不合法')
  }

  const result = await prisma.$transaction(async (tx) => {
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

    if (order.userId) {
      const isBalancePay = order.payMethod?.startsWith('BALANCE')
      const totalDeducted = (order.principalDeduction || 0) + (order.bonusDeduction || 0)
      const ratio = totalDeducted > 0 ? actualRefund / totalDeducted : 0
      const refundPrincipal = isBalancePay
        ? Math.min(order.principalDeduction || 0, Math.floor((order.principalDeduction || 0) * ratio))
        : 0
      const refundBonus = isBalancePay
        ? Math.min(order.bonusDeduction || 0, actualRefund - refundPrincipal)
        : 0

      if (isBalancePay && actualRefund > 0) {
        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: refundPrincipal },
            bonusBalance: { increment: refundBonus },
          },
        })
      }

      await tx.balanceTransaction.create({
        data: {
          userId: order.userId,
          type: 'REFUND',
          amount: actualRefund,
          principalAmount: refundPrincipal,
          bonusAmount: refundBonus,
          totalAmount: actualRefund,
          orderId: order.id,
          remark: isBalancePay
            ? `订单退款恢复余额（本金¥${refundPrincipal / 100}+赠送¥${refundBonus / 100}），原因：${reason}`
            : `订单在线支付退款（${order.payMethod} ¥${actualRefund / 100}），原因：${reason}`,
        },
      })

      const earnTx = await tx.balanceTransaction.findFirst({
        where: { orderId: order.id, type: 'POINTS_EARN' },
      })
      const earned = earnTx?.pointsAmount || 0
      const revokeRatio = order.amount > 0 ? actualRefund / order.amount : 1
      const revokePoints = Math.floor(earned * revokeRatio)
      const user = await tx.user.findUnique({ where: { id: order.userId }, select: { points: true } })
      const deduct = Math.min(revokePoints, user?.points || 0)
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

    if (order.bookingId) {
      await tx.booking.update({
        where: { id: order.bookingId },
        data: { status: 'CANCELLED' },
      })
    }

    return updated
  })

  await pushAdminNotification(
    'ADMIN_REFUND_REQUEST',
    '订单已退款',
    `订单 ${order.orderNo} 已退款 ¥${(actualRefund / 100).toFixed(2)}，场地：${order.venueName}`
  )

  const beforeValue = { status: order.status, amount: order.amount, refundAmount: order.refundAmount }
  const afterValue = { status: 'REFUNDED', refundAmount: actualRefund }

  if (input.req) {
    await logAudit(input.req, {
      targetType: 'ORDER',
      targetId: order.id,
      targetDesc: `订单 ${order.orderNo}`,
      action: 'POST',
      actionName: '订单退款',
      beforeValue,
      afterValue,
      amount: actualRefund,
      reason,
    })
  }

  return { result, order, beforeValue, afterValue, amount: actualRefund, message: '退款成功' }
}

export async function refund(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const refundAmount = Number(req.body?.amount ?? 0)
    const reason = String(req.body?.reason || '').trim()
    const disposition = await executeOrderRefund({
      orderIdOrNo: id,
      amount: refundAmount,
      reason: reason || '管理员退款',
      req,
    })

    return success(res, disposition.result, disposition.message)
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

type NoShowDispositionAction = 'NO_REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND'

export async function executeNoShowDisposition(input: {
  orderIdOrNo: string
  action: NoShowDispositionAction
  amount?: number
  reason: string
  req?: AuthenticatedRequest
}) {
  const { orderIdOrNo, action, reason, req } = input
  const requestedAmount = Number(input.amount ?? 0)

  if (!['NO_REFUND', 'PARTIAL_REFUND', 'FULL_REFUND'].includes(action)) {
    throw new Error('请选择有效的处置方式')
  }
  if (!reason) {
    throw new Error('请填写退款处置原因')
  }

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: orderIdOrNo }, { orderNo: orderIdOrNo }] },
  })
  if (!order) throw new Error('订单不存在')
  if (order.status !== 'NO_SHOW') {
    throw new Error('仅已作废订单可进行退款处置')
  }

  const actualRefund = action === 'NO_REFUND'
    ? 0
    : action === 'FULL_REFUND'
      ? order.amount
      : requestedAmount

  if (action === 'PARTIAL_REFUND' && (!Number.isInteger(actualRefund) || actualRefund <= 0 || actualRefund >= order.amount)) {
    throw new Error('部分退款金额必须大于0且小于订单实付金额')
  }
  if (action === 'FULL_REFUND' && order.amount <= 0) {
    throw new Error('订单金额不合法')
  }

  const retainedPenalty = Math.max(0, order.amount - actualRefund)
  const originalPenalty = order.penaltyAmount ?? order.amount
  const reversedPenaltyAmount = Math.max(0, originalPenalty - retainedPenalty)

  const result = await prisma.$transaction(async (tx) => {
    if (action === 'NO_REFUND') {
      return tx.order.update({
        where: { id: order.id },
        data: {
          refundAmount: 0,
          penaltyAmount: order.penaltyAmount ?? order.amount,
        },
      })
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'REFUNDED',
        refundAmount: actualRefund,
        penaltyAmount: retainedPenalty,
      },
    })

    if (action === 'FULL_REFUND' && order.userCouponId) {
      const coupon = await tx.userCoupon.findUnique({ where: { id: order.userCouponId } })
      if (coupon && coupon.status === 'USED') {
        await tx.userCoupon.update({
          where: { id: order.userCouponId },
          data: { status: 'UNUSED', usedAt: null, usedOrderId: null },
        })
      }
    }

    if (order.userId) {
      const isBalancePay = order.payMethod?.startsWith('BALANCE')
      const totalDeducted = (order.principalDeduction || 0) + (order.bonusDeduction || 0)
      const ratio = totalDeducted > 0 ? actualRefund / totalDeducted : 0
      const refundPrincipal = isBalancePay
        ? Math.min(order.principalDeduction || 0, Math.floor((order.principalDeduction || 0) * ratio))
        : 0
      const refundBonus = isBalancePay
        ? Math.min(order.bonusDeduction || 0, actualRefund - refundPrincipal)
        : 0

      if (isBalancePay && actualRefund > 0) {
        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: refundPrincipal },
            bonusBalance: { increment: refundBonus },
          },
        })
      }

      if (actualRefund > 0) {
        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            type: 'REFUND',
            amount: actualRefund,
            principalAmount: refundPrincipal,
            bonusAmount: refundBonus,
            totalAmount: actualRefund,
            orderId: order.id,
            remark: `已作废订单退款处置：${action === 'FULL_REFUND' ? '全额退款' : '部分退款'} ¥${(actualRefund / 100).toFixed(2)}，保留违约金 ¥${(retainedPenalty / 100).toFixed(2)}，原因：${reason}`,
          },
        })
      }

      const earnTx = await tx.balanceTransaction.findFirst({
        where: { orderId: order.id, type: 'POINTS_EARN' },
      })
      const earned = earnTx?.pointsAmount || 0
      const revokeRatio = order.amount > 0 ? actualRefund / order.amount : 1
      const revokePoints = Math.floor(earned * revokeRatio)
      const user = await tx.user.findUnique({ where: { id: order.userId }, select: { points: true } })
      const deduct = Math.min(revokePoints, user?.points || 0)
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
            remark: `已作废订单退款处置收回赠送积分 ${deduct}`,
          },
        })
      }
    }

    return updated
  })

  const beforeValue = { status: order.status, amount: order.amount, penaltyAmount: order.penaltyAmount, refundAmount: order.refundAmount }
  const afterValue = {
    status: action === 'NO_REFUND' ? 'NO_SHOW' : 'REFUNDED',
    refundAmount: actualRefund,
    retainedPenalty,
    action,
    noShowPenaltyReversed: reversedPenaltyAmount > 0,
    reversedPenaltyAmount,
  }

  if (req) {
    await logAudit(req, {
      targetType: 'ORDER',
      targetId: order.id,
      targetDesc: `订单 ${order.orderNo}`,
      action: 'POST',
      actionName: '已作废订单退款处置',
      beforeValue,
      afterValue,
      amount: actualRefund,
      reason,
    })
  }

  if (order.userId && actualRefund > 0) {
    await pushNotification(
      order.userId,
      'ORDER_REFUND',
      '订单退款',
      `您的订单 ${order.orderNo} 已退款 ¥${(actualRefund / 100).toFixed(2)}`
    )
  }

  return {
    result,
    order,
    beforeValue,
    afterValue,
    amount: actualRefund,
    message: action === 'NO_REFUND' ? '已记录不退款处置' : '退款处置完成',
  }
}

export async function noShowDisposition(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const action = String(req.body?.action || '').trim() as NoShowDispositionAction
    const reason = String(req.body?.reason || '').trim()
    const amount = Number(req.body?.amount ?? 0)
    const disposition = await executeNoShowDisposition({ orderIdOrNo: id, action, amount, reason, req })
    return success(res, disposition.result, disposition.message)
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}


export const batchVerifyValidators = [
  body('ids').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
]

export const batchRefundValidators = [
  body('ids').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
  body('reason').notEmpty().withMessage('退款原因不能为空'),
]

export async function batchVerify(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const { ids } = req.body
    checkBatchLimit(ids.length, 50)

    const result = await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { id: { in: ids } },
      })

      if (orders.length !== ids.length) {
        throw new Error('部分订单不存在')
      }

      const invalidOrders = orders.filter((o) => !['PAID', 'READY_TO_VERIFY'].includes(o.status))
      if (invalidOrders.length > 0) {
        throw new Error(`存在不可核销状态订单，无法核销`)
      }

      const updated = await tx.order.updateMany({
        where: { id: { in: ids }, status: { in: ['PAID', 'READY_TO_VERIFY'] } },
        data: { status: 'COMPLETED', verifiedAt: new Date() },
      })

      // 同步完成关联排场
      const bookingIds = orders.map((o) => o.bookingId).filter(Boolean) as string[]
      if (bookingIds.length > 0) {
        await tx.booking.updateMany({
          where: { id: { in: bookingIds } },
          data: { status: 'COMPLETED' },
        })
      }

      return updated.count
    })

    return success(res, { processed: result }, '批量核销成功')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

export async function batchRefund(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const { ids, reason } = req.body
    checkBatchLimit(ids.length, 50)

    const { earnRate } = await getPointsConfig()

    const result = await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { id: { in: ids } },
      })

      if (orders.length !== ids.length) {
        throw new Error('部分订单不存在')
      }

      const invalidOrders = orders.filter((o) => o.status !== 'PAID')
      if (invalidOrders.length > 0) {
        throw new Error('存在非已支付状态订单，无法退款')
      }

      for (const order of orders) {
        // 恢复优惠券状态
        if (order.userCouponId) {
          await tx.userCoupon.update({
            where: { id: order.userCouponId },
            data: { status: 'UNUSED', usedAt: null, usedOrderId: null },
          })
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'REFUNDED',
            refundAmount: order.amount,
          },
        })

        if (order.userId) {
          if (order.payMethod?.startsWith('BALANCE')) {
            // 恢复双钱包
            await tx.user.update({
              where: { id: order.userId },
              data: {
                principalBalance: { increment: order.principalDeduction },
                bonusBalance: { increment: order.bonusDeduction },
              },
            })
          }

          // 所有支付方式都创建退款流水
          await tx.balanceTransaction.create({
            data: {
              userId: order.userId,
              type: 'REFUND',
              amount: order.amount,
              principalAmount: order.payMethod?.startsWith('BALANCE') ? order.principalDeduction : 0,
              bonusAmount: order.payMethod?.startsWith('BALANCE') ? order.bonusDeduction : 0,
              totalAmount: order.amount,
              orderId: order.id,
              remark: order.payMethod?.startsWith('BALANCE')
                ? `批量退款恢复余额（本金¥${order.principalDeduction / 100}+赠送¥${order.bonusDeduction / 100}）原因：${reason}`
                : `批量在线支付退款（${order.payMethod} ¥${order.amount / 100}）原因：${reason}`,
            },
          })
        }

        // 批量退款时收回赠送积分（所有支付方式）
        if (order.userId) {
          const baseAmount = order.payMethod?.startsWith('BALANCE') ? order.principalDeduction : order.amount
          const earned = Math.floor(baseAmount / 100 * earnRate)
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
                remark: `批量退款收回赠送积分 ${deduct}`,
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
      }

      return orders.length
    })

    return success(res, { processed: result }, '批量退款成功')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}


/* ─── 手动标记爽约 ─── */
export async function markNoShow(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { reason } = req.body

    const order = await prisma.order.findUnique({
      where: { id },
      include: { booking: true },
    })
    if (!order) return error(res, '订单不存在', 404)
    if (!['PAID', 'READY_TO_VERIFY', 'PLAYING'].includes(order.status)) {
      return error(res, '该订单状态不允许标记爽约', 400)
    }

    const setting = await prisma.systemSetting.findUnique({ where: { key: 'no_show_penalty_rate' } })
    const raw = setting?.value as any
    const penaltyRate = (typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw) ?? 100
    const penaltyAmount = Math.floor((order.amount || 0) * penaltyRate / 100)

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'NO_SHOW',
          noShowAt: new Date(),
          noShowReason: reason || 'manual',
          penaltyAmount,
        },
      })

      if (order.bookingId) {
        await tx.booking.update({
          where: { id: order.bookingId },
          data: { status: 'NO_SHOW', noShowAt: new Date() },
        })
      }

      if (order.userId) {
        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            orderId: order.id,
            type: 'NO_SHOW_PENALTY',
            amount: penaltyAmount,
            remark: `店长手动标记爽约，违约金比例 ${penaltyRate}%${reason ? '，原因：' + reason : ''}`,
          },
        })
      }
    })

    // 释放设备
    if (order.bookingId) {
      try {
        await releaseEquipment(order.bookingId)
        console.log(`[markNoShow] Booking ${order.bookingId} 爽约，设备已释放`)
      } catch (e) {
        console.error(`[markNoShow] Booking ${order.bookingId} 设备释放失败:`, e)
      }
    }

    // 推送爽约通知
    if (order.userId) {
      const bookingDate = order.booking?.date
        ? new Date(order.booking.date).toLocaleDateString('zh-CN')
        : ''
      const startTime = order.booking?.startTime || ''
      const penaltyText = penaltyAmount > 0
        ? `已扣除违约金 ¥${(penaltyAmount / 100).toFixed(2)}`
        : '未产生违约金'
      const reasonMap: Record<string, string> = { manual: '店长手动标记', auto: '系统自动标记' }
      const reasonText = reason ? (reasonMap[reason] || reason) : ''
      pushNotification(
        order.userId,
        'NO_SHOW',
        '预约已标记为爽约',
        `您在 ${bookingDate} ${startTime} 的预约因未到场被标记为爽约，${penaltyText}${reasonText ? '，原因：' + reasonText : ''}`
      ).catch((e) => console.error('[markNoShow] 推送通知失败:', e))
    }

    return success(res, null, '订单已标记为爽约')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 撤销作废：按预约时间恢复为已付款或待核销 ─── */
export async function activate(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const reason = String(req.body?.reason || '').trim()
    if (!reason) {
      return error(res, '请填写撤销作废原因', 400)
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: { booking: true },
    })
    if (!order) return error(res, '订单不存在', 404)
    if (order.status !== 'NO_SHOW') {
      return error(res, '仅已作废订单可撤销作废', 400)
    }

    const target = await getRestoreNoShowTargetStatus(order.booking)

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: target.orderStatus,
          noShowReason: null,
          penaltyAmount: 0,
        },
      })

      if (order.bookingId) {
        await tx.booking.update({
          where: { id: order.bookingId },
          data: { status: target.bookingStatus, noShowAt: null },
        })
      }

      // 冲回违约金流水
      if (order.userId && order.penaltyAmount && order.penaltyAmount > 0) {
        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            orderId: order.id,
            type: 'NO_SHOW_REVERSE',
            amount: order.penaltyAmount,
            remark: `撤销作废，冲回违约金。原因：${reason}`,
          },
        })
      }
    })

    await logAudit(req, {
      targetType: 'ORDER',
      targetId: order.id,
      targetDesc: `订单 ${order.orderNo}`,
      action: 'POST',
      actionName: '撤销作废',
      beforeValue: { status: order.status, penaltyAmount: order.penaltyAmount, noShowReason: order.noShowReason },
      afterValue: { status: target.orderStatus, bookingStatus: target.bookingStatus, penaltyAmount: 0, noShowReason: null },
      reason,
    })

    return success(res, { status: target.orderStatus, bookingStatus: target.bookingStatus }, target.orderStatus === 'READY_TO_VERIFY' ? '订单已恢复为待核销' : '订单已恢复为已付款')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}
