import { Response } from 'express'
import { format } from 'date-fns'
import { AuthenticatedRequest } from '../types'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification, pushAdminNotification } from '../controllers/notificationController'
import { Prisma } from '@prisma/client'
import { generateOrderNo } from '../utils/orderNo'
import { getDiscountByLevel, getPointsConfig } from '../utils/memberConfig'
import { checkBatchLimit } from '../services/riskControlService'
import { logAudit } from '../middleware/auditLog'
import { handleEvent } from '../jobs/triggerJob'
import { expirePendingOrders } from '../jobs/orderTimeoutJob'
import { processBookingLifecycle } from '../jobs/bookingLifecycleJob'
import { onCouponUsed } from '../services/campaignRewardService'
import { releaseEquipment, assignEquipment } from '../services/equipmentService'
import { executeRescheduleInTx } from './bookingController'
import { normalizeThirdPartyCouponCode } from '../utils/thirdPartyCoupon'
import { isPlatformEnabled } from '../utils/platformConfig'
import { calculateRestoreNoShowTargetStatus } from '../domain/orderLifecycle'
import { calculateBalanceDebit, calculateRefundSplitFromDeduction } from '../domain/walletLedger'
import { UNASSIGNED_STORE_BALANCE_VENUE_ID, debitStoreBalance, refundStoreBalanceFromSnapshot } from '../domain/storeBalance'
import { calculateCancelableRefundAmount } from '../domain/groupBuyCancellation'
import {
  calculateNoShowDisposition,
  calculateOrderRefund,
  ensureOrderRefundable,
  type NoShowDispositionAction,
} from '../domain/refundPolicy'
import { applyVenueScope } from '../domain/venueScope'
import { parseNoShowDispositionRequest, parseRefundRequest } from '../domain/orderContracts'
import { assertPaymentMethodAllowedForRole } from '../domain/paymentPolicy'

export const createValidators = [
  body('venueId').if(body('groupBuyPackageId').not().exists()).notEmpty().withMessage('场地不能为空'),
  body('amount').isInt({ min: 0 }).withMessage('金额必须为正整数'),
  body('bookingTime').if(body('groupBuyPackageId').not().exists()).notEmpty().withMessage('预约时间不能为空'),
]

export const redeemValidators = [
  body('venueId').notEmpty().withMessage('场地不能为空'),
  body('date').notEmpty().withMessage('日期不能为空'),
  body('startTime').notEmpty().withMessage('开始时间不能为空'),
  body('endTime').notEmpty().withMessage('结束时间不能为空'),
  body('personName').notEmpty().withMessage('联系人不能为空'),
  body('personPhone').notEmpty().withMessage('联系电话不能为空'),
  body('personCount').isInt({ min: 1 }).withMessage('人数至少1人'),
]

export const redeemCustomerValidators = [
  body('venueId').notEmpty().withMessage('场地不能为空'),
  body('date').notEmpty().withMessage('日期不能为空'),
  body('startTime').notEmpty().withMessage('开始时间不能为空'),
  body('endTime').notEmpty().withMessage('结束时间不能为空'),
  body('personName').notEmpty().withMessage('联系人不能为空'),
  body('personPhone').notEmpty().withMessage('联系电话不能为空'),
  body('personCount').isInt({ min: 1 }).withMessage('人数至少1人'),
]

function dayStart(dateStr: string): Date { return new Date(dateStr + 'T00:00:00.000Z') }
function dayEnd(dateStr: string): Date { return new Date(dateStr + 'T23:59:59.999Z') }
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function generateVerifyCode(): string {
  return `VR${format(new Date(), 'yyyyMMdd')}${Math.floor(Math.random() * 900000) + 100000}`
}

function readOrderMetadata(metadata: Prisma.JsonValue | null | undefined): Record<string, any> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, any> : {}
}

function singlePhysicalSourceVenueId(snapshot: any): string | null {
  const sourceVenueIds = (snapshot?.deductions || [])
    .map((deduction: any) => deduction?.venueId)
    .filter((venueId: string | undefined) => venueId && venueId !== 'PLATFORM' && venueId !== UNASSIGNED_STORE_BALANCE_VENUE_ID)

  return new Set(sourceVenueIds).size === 1 ? sourceVenueIds[0] : null
}

async function getUsableThirdPartyCoupon(codeInput: unknown, amountBeforeCoupon: number) {
  const code = normalizeThirdPartyCouponCode(codeInput)
  if (!code) return null

  const coupon = await prisma.thirdPartyCoupon.findUnique({ where: { code } })
  if (!coupon) throw new Error('第三方券不存在，请先让顾客在 C 端兑换绑定')
  if (coupon.status !== 'UNUSED') throw new Error('平台优惠券已使用，不能重复抵扣')
  if (!isPlatformEnabled(coupon.source)) {
    throw new Error('该平台已停用，无法使用第三方券')
  }
  if (coupon.minOrderAmount > amountBeforeCoupon) {
    throw new Error(`第三方券需满 ¥${(coupon.minOrderAmount / 100).toFixed(2)} 可用`)
  }

  const discount = Math.min(coupon.discountAmount, amountBeforeCoupon)
  return {
    coupon,
    discount,
    metadata: {
      id: coupon.id,
      code: coupon.code,
      source: coupon.source,
      name: coupon.name,
      discountAmount: discount,
      minOrderAmount: coupon.minOrderAmount,
    },
  }
}

async function restoreThirdPartyCouponFromMetadata(tx: Prisma.TransactionClient, metadata: Prisma.JsonValue | null | undefined) {
  const thirdPartyCoupon = readOrderMetadata(metadata).thirdPartyCoupon
  if (!thirdPartyCoupon?.id) return
  await tx.thirdPartyCoupon.updateMany({
    where: { id: String(thirdPartyCoupon.id), status: 'USED' },
    data: { status: 'UNUSED', usedAt: null },
  })
}

async function getRestoreNoShowTargetStatus(booking: { date: Date; startTime: string } | null) {
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
  return calculateRestoreNoShowTargetStatus({
    booking,
    now: new Date(),
    verifyAdvanceMinutes,
    noShowDeadlineMinutes,
  })
}

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    await expirePendingOrders()
    await processBookingLifecycle()

    const { status, search, page = '1', pageSize = '10', startDate, endDate, source, orderType, orderKind, feeType, refundStatus, parentOrderNo } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}
    const andConditions: any[] = []

    if (status && status !== 'all') {
      where.status = status as string
    }

    if (orderKind && orderKind !== 'all') {
      where.orderKind = orderKind as string
    }

    if (orderType && orderType !== 'all') {
      if (orderType === 'RESERVATION') {
        where.orderKind = 'NORMAL'
        andConditions.push({ groupBuyPackageId: null })
      } else if (orderType === 'GROUP_BUY') {
        where.orderKind = 'NORMAL'
        andConditions.push({ groupBuyPackageId: { not: null } })
      } else if (orderType === 'FEE') {
        where.orderKind = 'FEE'
      }
    }

    if (source && source !== 'all') {
      where.source = source as string
      if ((!orderKind || orderKind === 'all') && orderType !== 'FEE') {
        andConditions.push({ orderKind: { not: 'FEE' } })
      } else if (orderKind === 'FEE' || orderType === 'FEE') {
        andConditions.push({ id: '__NO_FEE_ORDER_MATCHES_SOURCE_FILTER__' })
      }
    }

    if (feeType && feeType !== 'all') {
      where.feeType = feeType as string
    }

    // 退款状态筛选
    if (refundStatus && refundStatus !== 'all') {
      if (refundStatus === 'HAS_REFUND') {
        where.refundAmount = { gt: 0 }
      } else if (refundStatus === 'NO_REFUND') {
        andConditions.push({
          OR: [
            { refundAmount: null },
            { refundAmount: 0 },
          ],
        })
      }
    }

    // 关联订单号搜索：先查找原订单 ID
    let parentOrderIdFilter: string | undefined
    if (parentOrderNo) {
      const parentOrder = await prisma.order.findFirst({
        where: { orderNo: { contains: parentOrderNo as string, mode: 'insensitive' } },
        select: { id: true },
      })
      parentOrderIdFilter = parentOrder?.id
      if (!parentOrderIdFilter) {
        // 没有匹配的原订单，返回空结果
        return paginated(res, [], pageNum, sizeNum, 0)
      }
    }

    if (search) {
      const searchWhere: any[] = [
        { orderNo: { contains: search as string, mode: 'insensitive' } },
        { venueName: { contains: search as string, mode: 'insensitive' } },
        { verifyCode: { contains: search as string, mode: 'insensitive' } },
      ]
      // 支持扫码识别：二维码内容可能是订单 UUID
      if (typeof search === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search)) {
        searchWhere.push({ id: search })
      }
      if (parentOrderIdFilter) {
        andConditions.push({ OR: searchWhere })
        andConditions.push({ parentOrderId: parentOrderIdFilter })
      } else {
        andConditions.push({ OR: searchWhere })
      }
    } else if (parentOrderIdFilter) {
      where.parentOrderId = parentOrderIdFilter
    }

    // 默认排除团购父订单（仅用于统一收款），只展示实际子订单
    andConditions.push({ orderKind: { not: 'GROUP_PARENT' } })

    if (andConditions.length > 0) {
      where.AND = andConditions
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = dayStart(startDate as string)
      }
      if (endDate) {
        where.createdAt.lte = dayEnd(endDate as string)
      }
    }

    const scoped = applyVenueScope(where, req.user)
    if (scoped.empty) {
      return paginated(res, [], pageNum, sizeNum, 0)
    }
    const queryWhere = scoped.where

    // 查询列表、总数、各状态统计（统计去掉 status 过滤，确保各 tab 角标稳定）
    const countWhere = { ...queryWhere }
    delete countWhere.status

    // 「全部」tab 角标不受 status/orderKind 过滤影响，仅保留其他筛选条件
    const countAllWhere = { ...countWhere }
    delete countAllWhere.orderKind

    const [orders, total, totalAll, statusGroups, normalStatusGroups] = await Promise.all([
      prisma.order.findMany({
        where: queryWhere,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          booking: {
            include: {
              venue: { select: { image: true } },
              game: {
                select: {
                  id: true,
                  title: true,
                  subtitle: true,
                  coverImage: true,
                  price: true,
                  duration: true,
                },
              },
            },
          },
          userCoupon: { select: { name: true, type: true, discountRate: true, source: true, giftReason: true, giftRemark: true } },
          groupBuyPackage: { select: { id: true, title: true, label: true, coverImage: true, totalGroupPrice: true, originalPricePerPerson: true, maxPeople: true, game: { select: { id: true, title: true, duration: true, coverImage: true } }, venues: { select: { id: true, name: true, address: true, openTime: true, closeTime: true, phone: true, image: true } } } },
          parentOrder: {
            select: {
              id: true,
              orderNo: true,
              booking: {
                include: {
                  game: { select: { id: true, title: true } },
                },
              },
            },
          },
          feeOrders: { select: { id: true, orderNo: true, amount: true, status: true, feeType: true, feeReason: true, paidAt: true, payMethod: true } },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.count({ where: countAllWhere }),
      prisma.order.groupBy({
        by: ['status'],
        // 状态标签仅统计主订单（NORMAL），改签费/团购父订单不计入各状态角标
        where: { ...countWhere, orderKind: 'NORMAL' },
        _count: { status: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { ...countWhere, orderKind: 'NORMAL' },
        _count: { status: true },
      }),
    ])

    // 构建各状态数量映射
    const statusCounts: Record<string, number> = {}
    for (const g of statusGroups) {
      statusCounts[g.status.toLowerCase()] = g._count.status
    }

    const normalStatusCounts: Record<string, number> = {}
    for (const g of normalStatusGroups) {
      normalStatusCounts[g.status.toLowerCase()] = g._count.status
    }

    return paginated(res, orders, pageNum, sizeNum, total, 'success', {
      totalAll,
      statusCounts,
      normalStatusCounts,
    })
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
        groupBuyPackage: { select: { id: true, title: true, label: true, coverImage: true, totalGroupPrice: true, originalPricePerPerson: true, maxPeople: true, game: { select: { id: true, title: true, duration: true, coverImage: true } }, venues: { select: { id: true, name: true, address: true, openTime: true, closeTime: true, phone: true, image: true, status: true, maintenanceStartDate: true, maintenanceEndDate: true, maintenanceStartTime: true, maintenanceEndTime: true } } } },
        parentOrder: {
          select: {
            id: true,
            orderNo: true,
            amount: true,
            status: true,
            booking: {
              include: {
                game: { select: { id: true, title: true, coverImage: true, duration: true } },
                venue: { select: { name: true, address: true } },
              },
            },
          },
        },
        feeOrders: { select: { id: true, orderNo: true, amount: true, status: true, feeType: true, feeReason: true, paidAt: true, payMethod: true } },
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
    const { bookingId, venueId, venueName, amount, bookingTime, userId, source, payMethod, userCouponId, groupBuyPackageId, thirdPartyCouponCode } = req.body
    const currentUserId = userId || req.user?.id
    const requestedPayMethod = typeof payMethod === 'string' ? payMethod.toUpperCase() : undefined
    if (requestedPayMethod && !['BALANCE', 'CASH', 'CARD'].includes(requestedPayMethod)) {
      return error(res, '微信/支付宝真实支付暂未接入，当前仅允许余额、现金或刷卡收款', 400)
    }

    // 团购套餐订单：套餐价已是最终价，不打折、不用券
    const isGroupBuy = !!groupBuyPackageId

    // 团购订单：创建父订单用于统一支付，同时按份数创建子订单用于展示/核销
    if (isGroupBuy) {
      const pkg = await prisma.groupBuyPackage.findUnique({
        where: { id: groupBuyPackageId },
        include: { venues: { select: { id: true, name: true } }, game: { select: { id: true, title: true } } },
      })
      if (!pkg) return error(res, '团购套餐不存在', 404)
      if (pkg.status !== 'ACTIVE') return error(res, '团购套餐已下架', 400)

      const quantityNum = Math.max(1, parseInt(req.body.quantity) || 1)
      const parsedAmount = pkg.totalGroupPrice * quantityNum
      const originalAmount = (pkg.originalPricePerPerson * pkg.maxPeople) * quantityNum
      const discountAmount = originalAmount - parsedAmount
      // 优先使用用户选择的适用门店，否则取第一个
      let venue = pkg.venues[0]
      if (venueId) {
        const selectedVenue = pkg.venues.find((v: any) => v.id === venueId)
        if (selectedVenue) venue = selectedVenue
      }
      const expireAt = new Date(Date.now() + 30 * 60 * 1000)
      const unitOriginal = pkg.originalPricePerPerson * pkg.maxPeople
      const unitAmount = pkg.totalGroupPrice
      const unitDiscount = unitOriginal - unitAmount

      const { parentOrder } = await prisma.$transaction(async (tx) => {
        // 父订单：用于统一收款
        const parentOrder = await tx.order.create({
          data: {
            orderNo: await generateOrderNo('group', tx),
            userId: currentUserId || null,
            venueId: venue?.id || null,
            venueName: venue?.name || pkg.game?.title || '',
            groupBuyPackageId: pkg.id,
            originalAmount,
            amount: parsedAmount,
            discountRate: 100,
            discountAmount,
            couponDiscount: 0,
            userCouponId: null,
            pointsUsed: 0,
            pointsDeduction: 0,
            quantity: quantityNum,
            status: 'PENDING',
            source: 'ONLINE',
            expireAt,
            orderKind: 'GROUP_PARENT',
          },
          include: {
            user: { select: { id: true, name: true, phone: true } },
            groupBuyPackage: { select: { id: true, title: true, coverImage: true, totalGroupPrice: true, originalPricePerPerson: true, maxPeople: true } },
          },
        })

        // 子订单：每份一个独立订单号/券码，用于展示和核销
        for (let i = 0; i < quantityNum; i++) {
          const verifyCode = `VR${format(new Date(), 'yyyyMMdd')}${Math.floor(Math.random() * 900000) + 100000}`
          await tx.order.create({
            data: {
              orderNo: await generateOrderNo('group', tx),
              userId: currentUserId || null,
              venueId: venue?.id || null,
              venueName: venue?.name || pkg.game?.title || '',
              groupBuyPackageId: pkg.id,
              parentOrderId: parentOrder.id,
              originalAmount: unitOriginal,
              amount: unitAmount,
              discountRate: 100,
              discountAmount: unitDiscount,
              couponDiscount: 0,
              userCouponId: null,
              pointsUsed: 0,
              pointsDeduction: 0,
              quantity: 1,
              verifyCode,
              status: 'PENDING',
              source: 'ONLINE',
              expireAt,
              orderKind: 'NORMAL',
            },
          })
        }

        return { parentOrder }
      })

      return success(res, parentOrder, '订单创建成功', 201)
    }

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

    // 1. 先获取会员折扣率（团购订单不打折）
    let discount = 100
    if (currentUserId && !isGroupBuy) {
      const user = await prisma.user.findUnique({ where: { id: currentUserId } })
      if (user) {
        discount = await getDiscountByLevel(user.level)
      }
    }

    // 2. 验证优惠券并计算折扣顺序（团购订单不可用券）
    // 体验券：先抵扣1人原价，剩余再打会员折扣
    // 优惠券（DISCOUNT）：先会员折扣，再折上折
    let couponDiscount = 0
    let finalAmount = parsedAmount
    let finalUserCouponId: string | null = null
    let couponType: string | null = null

    if (userCouponId && normalizeThirdPartyCouponCode(thirdPartyCouponCode)) {
      return error(res, '一个订单只能使用一张优惠券，不能同时使用系统优惠券和平台优惠券', 400)
    }

    if (userCouponId && currentUserId && !isGroupBuy) {
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

    const systemCouponDiscount = couponDiscount
    const thirdPartyCoupon = await getUsableThirdPartyCoupon(thirdPartyCouponCode, finalAmount)
    if (thirdPartyCoupon) {
      finalAmount = Math.max(0, finalAmount - thirdPartyCoupon.discount)
      couponDiscount += thirdPartyCoupon.discount
    }

    const pointsConfig = await getPointsConfig()
    const remainingAmount = finalAmount
    const orderMetadata = thirdPartyCoupon ? { thirdPartyCoupon: thirdPartyCoupon.metadata } : undefined

    // discountAmount：会员优惠金额（基于实际打折基数）
    let discountBase = parsedAmount
    if (couponType === 'EXPERIENCE_FREE') {
      discountBase = Math.max(0, parsedAmount - systemCouponDiscount)
    }
    const discountAmount = discountBase - Math.round(discountBase * discount / 100)

    // 余额支付：等比扣除双钱包（支持组合支付）
    if (requestedPayMethod === 'BALANCE' && currentUserId) {
      const result = await prisma.$transaction(async (tx) => {
        const freshUser = await tx.user.findUnique({ where: { id: currentUserId } })
        if (!freshUser) throw new Error('用户不存在')

        // 等比扣除双钱包
        const wallet = {
          principal: freshUser.principalBalance,
          bonus: freshUser.bonusBalance,
        }
        const debit = calculateBalanceDebit({ wallet, amount: remainingAmount })
        const principalDeduction = debit.principalAmount
        const bonusDeduction = debit.bonusAmount

        await tx.user.update({
          where: { id: currentUserId },
          data: {
            principalBalance: { decrement: principalDeduction },
            bonusBalance: { decrement: bonusDeduction },
          },
        })

        // Phase 1：按资金来源门店扣减；历史未归属余额只进入快照，不写负数门店余额。
        const balanceDeductionSnapshot = await debitStoreBalance(tx, {
          userId: currentUserId,
          venueId,
          principal: principalDeduction,
          bonus: bonusDeduction,
        })

        // 创建订单（记录所有明细）
        const order = await tx.order.create({
          data: {
            orderNo: await generateOrderNo(groupBuyPackageId ? 'group' : 'normal', tx),
            bookingId: bookingId || null,
            userId: currentUserId,
            venueId,
            venueName: finalVenueName,
            groupBuyPackageId: groupBuyPackageId || null,
            originalAmount: parsedAmount,
            amount: remainingAmount,
            discountRate: discount,
            discountAmount,
            couponDiscount,
            userCouponId: finalUserCouponId,
            principalDeduction,
            bonusDeduction,
            balanceDeductionSnapshot: balanceDeductionSnapshot as any,
            pointsUsed: 0,
            pointsDeduction: 0,
            status: 'PAID',
            source: source === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
            payMethod: 'BALANCE',
            paidAt: new Date(),
            bookingTime,
            ...(orderMetadata ? { metadata: orderMetadata } : {}),
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
        if (thirdPartyCoupon) {
          const updatedCoupon = await tx.thirdPartyCoupon.updateMany({
            where: { id: thirdPartyCoupon.coupon.id, status: 'UNUSED' },
            data: { status: 'USED', usedAt: new Date() },
          })
          if (updatedCoupon.count !== 1) throw new Error('第三方券已被使用')
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
            venueId: venueId || null,
            sourceVenueId: singlePhysicalSourceVenueId(balanceDeductionSnapshot),
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
      const payerName = currentUserId
        ? (await prisma.user.findUnique({ where: { id: currentUserId }, select: { name: true } }))?.name
        : null
      await pushAdminNotification(
        'ADMIN_NEW_ORDER',
        '新订单已支付',
        `${payerName || '用户'} 在 ${finalVenueName} 消费 ¥${(result.amount / 100).toFixed(2)}，订单号 ${result.orderNo}`,
        'USER'
      )

      return success(res, result, '支付成功', 201)
    }

    // 普通订单创建（待支付）—— 在线支付也享受折扣
    // 平台券在订单创建时锁定，避免同一券码被多个未付款订单重复占用。
    const expireAt = new Date(Date.now() + 30 * 60 * 1000)
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNo: await generateOrderNo(groupBuyPackageId ? 'group' : 'normal', tx),
          bookingId: bookingId || null,
          userId: currentUserId || null,
          venueId,
          venueName: finalVenueName,
          groupBuyPackageId: groupBuyPackageId || null,
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
          ...(requestedPayMethod && requestedPayMethod !== 'BALANCE'
            ? { payMethod: requestedPayMethod as any }
            : {}),
          ...(orderMetadata ? { metadata: orderMetadata } : {}),
        },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          booking: true,
        },
      })

      if (thirdPartyCoupon) {
        const updatedCoupon = await tx.thirdPartyCoupon.updateMany({
          where: { id: thirdPartyCoupon.coupon.id, status: 'UNUSED' },
          data: { status: 'USED', usedAt: new Date() },
        })
        if (updatedCoupon.count !== 1) throw new Error('平台优惠券已使用，不能重复抵扣')
      }

      return createdOrder
    })

    return success(res, order, '订单创建成功', 201)
  } catch (err) {
    const msg = (err as Error).message
    if (msg === '余额不足' || msg.includes('优惠券') || msg.includes('第三方券')) return error(res, msg, 400)
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

    if (status === 'CANCELLED') {
      await prisma.$transaction(async (tx) => {
        await restoreThirdPartyCouponFromMetadata(tx, existing.metadata)
      })
    }

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
    try {
      assertPaymentMethodAllowedForRole(req.user?.role, method)
    } catch (err) {
      return error(res, (err as Error).message, 403)
    }
    const thirdPartyCouponCode = req.body?.thirdPartyCouponCode

    // 支持通过 orderNo 或 id 查询
    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
      include: {
        parentOrder: {
          include: {
            booking: { include: { venue: true, game: true } },
          },
        },
      },
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

    // ─── 改签费订单支付 ───
    if (order.orderKind === 'FEE' && order.feeType === 'RESCHEDULE_FEE') {
      return await payRescheduleFeeOrder(req, res, order, method)
    }

    const existingMetadata = readOrderMetadata(order.metadata)
    const existingThirdPartyCoupon = existingMetadata.thirdPartyCoupon
    const normalizedThirdPartyCouponCode = normalizeThirdPartyCouponCode(thirdPartyCouponCode)
    if (normalizedThirdPartyCouponCode && existingThirdPartyCoupon) {
      return error(res, '平台优惠券已使用，不能再使用第二张优惠券', 400)
    }
    if (normalizedThirdPartyCouponCode && order.userCouponId) {
      return error(res, '该订单已使用系统优惠券，不能再使用平台优惠券', 400)
    }
    if (normalizedThirdPartyCouponCode && order.couponDiscount > 0 && !existingThirdPartyCoupon) {
      return error(res, '该订单已有优惠抵扣，不能再使用平台优惠券', 400)
    }
    const thirdPartyCoupon = normalizedThirdPartyCouponCode
      ? await getUsableThirdPartyCoupon(normalizedThirdPartyCouponCode, order.amount)
      : null
    const payableAmount = thirdPartyCoupon
      ? Math.max(0, order.amount - thirdPartyCoupon.discount)
      : order.amount

    // 余额支付检查
    if (method === 'BALANCE' && order.userId) {
      const user = await prisma.user.findUnique({ where: { id: order.userId } })
      if (!user) return error(res, '用户不存在', 400)
      const wallet = { principal: user.principalBalance, bonus: user.bonusBalance }
      try {
        calculateBalanceDebit({ wallet, amount: payableAmount })
      } catch {
        return error(res, `余额不足，当前余额 ¥${(wallet.principal + wallet.bonus) / 100}`, 400)
      }
    }

    const isOffline = order.source === 'OFFLINE'

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
      let balanceDeductionSnapshot: any = undefined
      if (method === 'BALANCE' && order.userId) {
        const freshUser = await tx.user.findUnique({ where: { id: order.userId } })
        if (freshUser) {
          const wallet = { principal: freshUser.principalBalance, bonus: freshUser.bonusBalance }
          const debit = calculateBalanceDebit({ wallet, amount: payableAmount })
          principalDeduction = debit.principalAmount
          bonusDeduction = debit.bonusAmount
          await tx.user.update({
            where: { id: order.userId },
            data: {
              principalBalance: { decrement: principalDeduction },
              bonusBalance: { decrement: bonusDeduction },
            },
          })

          // Phase 1：按资金来源门店扣减；消费门店与资金来源门店分开记录。
          balanceDeductionSnapshot = await debitStoreBalance(tx, {
            userId: order.userId,
            venueId: order.venueId,
            principal: principalDeduction,
            bonus: bonusDeduction,
          })

          await tx.balanceTransaction.create({
            data: {
              userId: order.userId,
              type: 'DEDUCT',
              amount: payableAmount,
              principalAmount: -principalDeduction,
              bonusAmount: -bonusDeduction,
              totalAmount: -payableAmount,
              orderId: order.id,
              venueId: order.venueId || null,
              sourceVenueId: singlePhysicalSourceVenueId(balanceDeductionSnapshot),
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

      if (thirdPartyCoupon) {
        const updatedCoupon = await tx.thirdPartyCoupon.updateMany({
          where: { id: thirdPartyCoupon.coupon.id, status: 'UNUSED' },
          data: { status: 'USED', usedAt: new Date() },
        })
        if (updatedCoupon.count !== 1) throw new Error('第三方券已被使用')
      }

      const now = new Date()

      // 3. 更新订单状态（余额支付记录扣款明细）
      // 线下预约订单视为顾客已到场收款，支付即核销
      const isOffline = order.source === 'OFFLINE'
      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          status: isOffline ? 'COMPLETED' : 'PAID',
          payMethod: method as any,
          paidAt: now,
          ...(isOffline ? { verifiedAt: now } : {}),
          ...(thirdPartyCoupon
            ? {
                amount: payableAmount,
                couponDiscount: order.couponDiscount + thirdPartyCoupon.discount,
                metadata: {
                  ...existingMetadata,
                  thirdPartyCoupon: thirdPartyCoupon.metadata,
                },
              }
            : {}),
          // 团购券支付成功后，将过期时间延长为 30 天有效期
          ...(order.groupBuyPackageId ? { expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } : {}),
          ...(method === 'BALANCE'
            ? { principalDeduction, bonusDeduction, balanceDeductionSnapshot: balanceDeductionSnapshot as any }
            : {}),
        },
      })

      // 线下订单同步签到核销关联预约
      if (isOffline && order.bookingId) {
        await tx.booking.update({
          where: { id: order.bookingId },
          data: { status: 'CHECKED_IN', checkedInAt: now },
        })
      }

      // 3.5 团购父订单支付成功后，同步更新所有子订单为已付款
      if (order.orderKind === 'GROUP_PARENT') {
        await tx.order.updateMany({
          where: { parentOrderId: order.id },
          data: {
            status: 'PAID',
            payMethod: method as any,
            paidAt: now,
            expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })
      }

      // 4. 创建支付记录
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: payableAmount,
          method: method as any,
          status: 'SUCCESS',
        },
      })

      return o
    })

    // 赠送积分（按实际支付金额计算）
    if (order.userId) {
      const { earnRate } = await getPointsConfig()
      const earned = Math.floor(payableAmount / 100 * earnRate)
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
    const paidUser = order.userId ? await prisma.user.findUnique({ where: { id: order.userId }, select: { name: true, phone: true } }) : null
    if (order.userId) {
      await pushNotification(
        order.userId,
        'PAY_SUCCESS',
        '支付成功',
        `您的订单 ${order.orderNo} 支付成功，金额 ¥${(payableAmount / 100).toFixed(2)}`
      )
    }
    // 给管理员推送用户支付通知（管理员视角）
    await pushAdminNotification(
      'ADMIN_NEW_ORDER',
      '订单已支付',
      `${paidUser?.name || '用户'} 的订单 ${order.orderNo} 支付成功，金额 ¥${(payableAmount / 100).toFixed(2)}`,
      'USER'
    )

    // 线下订单支付后自动分配设备
    if (isOffline && order.bookingId) {
      try {
        const assigned = await assignEquipment(order.bookingId)
        console.log(`[orderController.pay] 线下订单支付自动分配设备: ${assigned.map((d) => d.name).join(', ')}`)
      } catch (e) {
        console.error(`[orderController.pay] 线下订单支付设备分配失败 Booking ${order.bookingId}:`, e)
      }
    }

    return success(res, updated, '支付成功')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('优惠券') || msg.includes('第三方券') || msg.includes('余额不足') || msg.includes('订单已过期')) {
      return error(res, msg, 400)
    }
    return error(res, msg, 500)
  }
}

/* ─── 改签费订单支付并执行改签 ─── */
async function payRescheduleFeeOrder(
  req: AuthenticatedRequest,
  res: Response,
  feeOrder: any,
  method: any
) {
  const parentOrder = feeOrder.parentOrder
  if (!parentOrder) {
    return error(res, '改签费订单未关联原订单', 400)
  }
  const booking = parentOrder.booking
  if (!booking) {
    return error(res, '原订单未关联预约', 400)
  }

  const meta = feeOrder.metadata as Record<string, any> | null
  if (!meta || !meta.newDate) {
    return error(res, '改签费订单缺少改签参数', 400)
  }

  const requiredFields = ['newVenueId', 'newDate', 'newStartTime', 'newEndTime', 'newGameId', 'newPersonCount', 'newOriginalAmount', 'deltaAmount', 'feeAmount', 'feeRate', 'isGroupBuy']
  for (const f of requiredFields) {
    if (meta[f] === undefined) {
      return error(res, `改签参数不完整：${f}`, 400)
    }
  }

  // 检查支付方式与改签费订单声明一致（允许顾客在支付时重新选择）
  const payMethod = (method || feeOrder.payMethod || 'BALANCE').toUpperCase()
  if (!['BALANCE', 'CASH', 'CARD'].includes(payMethod)) {
    return error(res, '不支持的支付方式', 400)
  }
  try {
    assertPaymentMethodAllowedForRole(req.user?.role, payMethod)
  } catch (err) {
    return error(res, (err as Error).message, 403)
  }

  // 余额支付需检查余额（改签费 + 可能补的差价）
  if (payMethod === 'BALANCE' && feeOrder.userId) {
    const user = await prisma.user.findUnique({ where: { id: feeOrder.userId } })
    if (!user) return error(res, '用户不存在', 400)
    const totalNeeded = (meta.feeAmount as number) + Math.max(0, meta.deltaAmount as number)
    const wallet = { principal: user.principalBalance, bonus: user.bonusBalance }
    try {
      calculateBalanceDebit({ wallet, amount: totalNeeded })
    } catch {
      return error(res, `余额不足，当前余额 ¥${(wallet.principal + wallet.bonus) / 100}，还需 ¥${totalNeeded / 100}`, 400)
    }
  }

  // 幂等：先检查是否已支付
  if (feeOrder.status !== 'PENDING') {
    return error(res, '改签费订单状态不允许支付', 400)
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. 余额扣款（仅改签费，差价由 executeRescheduleInTx 处理）
    let principalDeduction = 0
    let bonusDeduction = 0
    let feeBalanceDeductionSnapshot: any = null
    if (payMethod === 'BALANCE' && feeOrder.userId) {
      const freshUser = await tx.user.findUnique({ where: { id: feeOrder.userId } })
      if (freshUser) {
        const wallet = { principal: freshUser.principalBalance, bonus: freshUser.bonusBalance }
        const debit = calculateBalanceDebit({ wallet, amount: feeOrder.amount })
        principalDeduction = debit.principalAmount
        bonusDeduction = debit.bonusAmount
        await tx.user.update({
          where: { id: feeOrder.userId },
          data: {
            principalBalance: { decrement: principalDeduction },
            bonusBalance: { decrement: bonusDeduction },
          },
        })

        // Phase 1：按资金来源门店扣减；消费门店与资金来源门店分开记录。
        feeBalanceDeductionSnapshot = await debitStoreBalance(tx, {
          userId: feeOrder.userId,
          venueId: feeOrder.venueId,
          principal: principalDeduction,
          bonus: bonusDeduction,
        })

        await tx.balanceTransaction.create({
          data: {
            userId: feeOrder.userId,
            type: 'DEDUCT',
            amount: feeOrder.amount,
            principalAmount: -principalDeduction,
            bonusAmount: -bonusDeduction,
            totalAmount: -feeOrder.amount,
            orderId: feeOrder.id,
            venueId: feeOrder.venueId || null,
            sourceVenueId: singlePhysicalSourceVenueId(feeBalanceDeductionSnapshot),
            remark: `改签费订单 ${feeOrder.orderNo} 余额支付（本金¥${principalDeduction / 100}+赠送¥${bonusDeduction / 100}）`,
          },
        })
      }
    }

    // 2. 更新改签费订单为已支付
    const updatedFeeOrder = await tx.order.update({
      where: { id: feeOrder.id },
      data: {
        status: 'PAID',
        payMethod: payMethod as any,
        paidAt: new Date(),
        ...(payMethod === 'BALANCE'
          ? { principalDeduction, bonusDeduction, balanceDeductionSnapshot: feeBalanceDeductionSnapshot as any }
          : {}),
      },
    })

    // 3. 创建支付记录
    await tx.payment.create({
      data: {
        orderId: feeOrder.id,
        amount: feeOrder.amount,
        method: payMethod as any,
        status: 'SUCCESS',
      },
    })

    // 4. 执行改签
    await executeRescheduleInTx(tx, booking, parentOrder, {
      newVenueId: meta.newVenueId,
      newDate: meta.newDate,
      newStartTime: meta.newStartTime,
      newEndTime: meta.newEndTime,
      newGameId: meta.newGameId,
      newPersonCount: meta.newPersonCount,
      newOriginalAmount: meta.newOriginalAmount,
      deltaAmount: meta.deltaAmount,
      feeAmount: meta.feeAmount,
      feeRate: meta.feeRate,
      method: payMethod,
      isGroupBuy: meta.isGroupBuy,
      freeRescheduleUsed: false,
    })

    return updatedFeeOrder
  })

  // 发送支付成功通知
  if (feeOrder.userId) {
    await pushNotification(
      feeOrder.userId,
      'PAY_SUCCESS',
      '改签费支付成功',
      `您的改签费订单 ${feeOrder.orderNo} 支付成功，金额 ¥${(feeOrder.amount / 100).toFixed(2)}`
    )
  }

  // 发送改签成功通知
  const rescheduleVenue = await prisma.venue.findUnique({ where: { id: meta.newVenueId }, select: { name: true } })
  const operator = feeOrder.userId ? await prisma.user.findUnique({ where: { id: feeOrder.userId }, select: { name: true } }) : null
  if (feeOrder.userId) {
    await pushNotification(
      feeOrder.userId,
      'BOOKING_SUCCESS',
      '改签成功',
      `您的预约已改签至 ${rescheduleVenue?.name || parentOrder.venueName} ${meta.newDate} ${meta.newStartTime}-${meta.newEndTime}`
    )
  }
  await pushAdminNotification(
    'ADMIN_NEW_ORDER',
    '预约已改签',
    `${operator?.name || '用户'} 将预约改签至 ${rescheduleVenue?.name || parentOrder.venueName} ${meta.newDate} ${meta.newStartTime}-${meta.newEndTime}，${meta.newPersonCount}人`,
    'USER'
  )

  return success(res, result, '改签费支付成功并已执行改签')
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
      include: { booking: true, feeOrders: true },
    })
    if (!order) {
      return error(res, '订单不存在', 404)
    }

    if (['COMPLETED', 'NO_SHOW', 'PLAYING'].includes(order.status)) {
      return error(res, '该订单状态不允许取消', 400)
    }

    const isPaidOrder = ['PAID', 'READY_TO_VERIFY'].includes(order.status)
    const isMaintenanceAffected = order.disruptionStatus === 'VENUE_MAINTENANCE'

    // 已付款订单遵守取消/退款时限；未支付订单即使已过期也允许关闭并释放场次。
    if (isPaidOrder && order.booking && !isMaintenanceAffected) {
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
      refundRate = isMaintenanceAffected ? 1 : await calcRefundRate(order.booking.date, order.booking.startTime)
    }
    const refundAmount = calculateCancelableRefundAmount({
      order: {
        orderKind: order.orderKind,
        metadata: readOrderMetadata(order.metadata),
      },
      isPaidOrder,
      amount: order.amount || 0,
      refundRate,
    })
    const refundableFeeOrders = isMaintenanceAffected
      ? order.feeOrders.filter((feeOrder) =>
        feeOrder.orderKind === 'FEE' &&
        feeOrder.feeType === 'RESCHEDULE_FEE' &&
        ['PAID', 'COMPLETED'].includes(feeOrder.status) &&
        (feeOrder.amount || 0) > 0 &&
        !(feeOrder.refundAmount && feeOrder.refundAmount > 0)
      )
      : []
    const feeRefundAmount = refundableFeeOrders.reduce((sum, feeOrder) => sum + (feeOrder.amount || 0), 0)

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
      await restoreThirdPartyCouponFromMetadata(tx, order.metadata)

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          refundAmount: refundAmount > 0 ? refundAmount : null,
          disruptionStatus: 'NONE',
          disruptionReason: null,
          disruptionSource: null,
          disruptionAt: null,
        },
      })

      // 团购父订单取消时，同步取消所有子订单
      if (order.orderKind === 'GROUP_PARENT') {
        await tx.order.updateMany({
          where: { parentOrderId: order.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        })
      }

      // 已支付订单：按阶梯退费规则退回余额
      if (order.userId && order.payMethod?.startsWith('BALANCE') && isPaidOrder && refundAmount > 0) {
        const refund = calculateRefundSplitFromDeduction({
          originalPrincipalDeduction: order.principalDeduction || 0,
          originalBonusDeduction: order.bonusDeduction || 0,
          refundAmount,
        })

        // 同步退回门店余额（数据层隔离）
        await refundStoreBalanceFromSnapshot(tx, {
          userId: order.userId,
          refundAmount,
          snapshot: order.balanceDeductionSnapshot as any,
          principalDeduction: order.principalDeduction || 0,
          bonusDeduction: order.bonusDeduction || 0,
        })

        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: refund.principalAmount },
            bonusBalance: { increment: refund.bonusAmount },
          },
        })

        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            type: 'CANCEL_RESTORE',
            amount: refund.amount,
            principalAmount: refund.principalAmount,
            bonusAmount: refund.bonusAmount,
            totalAmount: refund.totalAmount,
            orderId: order.id,
            venueId: order.venueId || null,
            remark: `订单取消恢复余额（本金¥${refund.principalAmount / 100}+赠送¥${refund.bonusAmount / 100}）退费比例${(refundRate * 100).toFixed(0)}%，原因：${req.body?.reason || '用户取消订单'}`,
          },
        })
      }

      for (const feeOrder of refundableFeeOrders) {
        await tx.order.update({
          where: { id: feeOrder.id },
          data: {
            status: 'REFUNDED',
            cancelledAt: new Date(),
            refundAmount: feeOrder.amount,
          },
        })

        if (feeOrder.userId && feeOrder.payMethod?.startsWith('BALANCE')) {
          const refundPrincipal = feeOrder.principalDeduction || feeOrder.amount
          const refundBonus = feeOrder.bonusDeduction || 0

          // 同步退回门店余额
          await refundStoreBalanceFromSnapshot(tx, {
            userId: feeOrder.userId,
            refundAmount: feeOrder.amount,
            snapshot: feeOrder.balanceDeductionSnapshot as any,
            principalDeduction: feeOrder.principalDeduction || 0,
            bonusDeduction: feeOrder.bonusDeduction || 0,
          })

          await tx.user.update({
            where: { id: feeOrder.userId },
            data: {
              principalBalance: { increment: refundPrincipal },
              bonusBalance: { increment: refundBonus },
            },
          })
          await tx.balanceTransaction.create({
            data: {
              userId: feeOrder.userId,
              type: 'CANCEL_RESTORE',
              amount: feeOrder.amount,
              principalAmount: refundPrincipal,
              bonusAmount: refundBonus,
              totalAmount: feeOrder.amount,
              orderId: feeOrder.id,
              venueId: feeOrder.venueId || null,
              remark: `场地维护影响，退回改签费 ¥${(feeOrder.amount / 100).toFixed(2)}`,
            },
          })
        }
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

      // 若该订单是团购券预约后生成的消费订单，取消时把原券恢复为待使用
      if (order.orderKind === 'NORMAL' && (order.metadata as Record<string, any> | null)?.redeemedFromOrderId) {
        const voucherId = (order.metadata as Record<string, any>).redeemedFromOrderId as string
        const voucher = await tx.order.findUnique({
          where: { id: voucherId },
          select: { id: true, status: true, metadata: true },
        })
        if (voucher && voucher.status === 'COMPLETED') {
          const voucherMetadata = (voucher.metadata as Record<string, any>) || {}
          const { redeemedOrderId, redeemedOrderNo, redeemedAt, ...rest } = voucherMetadata
          await tx.order.update({
            where: { id: voucherId },
            data: {
              status: 'PAID',
              verifiedAt: null,
              metadata: { ...rest } as any,
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

    if (order.bookingId) {
      try {
        await releaseEquipment(order.bookingId)
      } catch (e) {
        console.error(`[OrderCancel] Booking ${order.bookingId} 设备释放失败:`, e)
      }
    }

    // Send cancel notification
    if (order.userId) {
      const totalRefundAmount = refundAmount + feeRefundAmount
      const refundText = totalRefundAmount > 0 ? `，已退回 ¥${(totalRefundAmount / 100).toFixed(2)}` : ''
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
      beforeValue: { status: order.status, amount: order.amount, refundRate, disruptionStatus: order.disruptionStatus },
      afterValue: { status: 'CANCELLED', refundAmount, feeRefundAmount },
      reason: req.body?.reason || '用户取消订单',
    })

    return success(res, { ...result, refundRate, refundAmount, feeRefundAmount, reason: req.body?.reason || '用户取消订单' }, '订单已取消')
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
  ensureOrderRefundable(order.status)
  const refund = calculateOrderRefund({
    requestedAmount: refundAmount,
    orderAmount: order.amount,
    payMethod: order.payMethod,
    principalDeduction: order.principalDeduction,
    bonusDeduction: order.bonusDeduction,
  })

  const result = await prisma.$transaction(async (tx) => {
    if (order.userCouponId) {
      await tx.userCoupon.update({
        where: { id: order.userCouponId },
        data: { status: 'UNUSED', usedAt: null, usedOrderId: null },
      })
    }
    await restoreThirdPartyCouponFromMetadata(tx, order.metadata)

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'REFUNDED',
        refundAmount: refund.actualRefund,
      },
    })

    if (order.userId) {
      if (refund.isBalancePay && refund.actualRefund > 0) {
        // 同步退回门店余额
        await refundStoreBalanceFromSnapshot(tx, {
          userId: order.userId,
          refundAmount: refund.actualRefund,
          snapshot: order.balanceDeductionSnapshot as any,
          principalDeduction: order.principalDeduction || 0,
          bonusDeduction: order.bonusDeduction || 0,
        })

        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: refund.principalAmount },
            bonusBalance: { increment: refund.bonusAmount },
          },
        })
      }

      await tx.balanceTransaction.create({
        data: {
          userId: order.userId,
          type: 'REFUND',
          amount: refund.actualRefund,
          principalAmount: refund.principalAmount,
          bonusAmount: refund.bonusAmount,
          totalAmount: refund.totalAmount,
          orderId: order.id,
          venueId: order.venueId || null,
          remark: refund.isBalancePay
            ? `订单退款恢复余额（本金¥${refund.principalAmount / 100}+赠送¥${refund.bonusAmount / 100}），原因：${reason}`
            : `订单在线支付退款（${order.payMethod} ¥${refund.actualRefund / 100}），原因：${reason}`,
        },
      })

      const earnTx = await tx.balanceTransaction.findFirst({
        where: { orderId: order.id, type: 'POINTS_EARN' },
      })
      const earned = earnTx?.pointsAmount || 0
      const revokeRatio = order.amount > 0 ? refund.actualRefund / order.amount : 1
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
    `订单 ${order.orderNo} 已退款 ¥${(refund.actualRefund / 100).toFixed(2)}，场地：${order.venueName}`,
        'USER'
  )

  const beforeValue = { status: order.status, amount: order.amount, refundAmount: order.refundAmount }
  const afterValue = { status: 'REFUNDED', refundAmount: refund.actualRefund }

  if (input.req) {
    await logAudit(input.req, {
      targetType: 'ORDER',
      targetId: order.id,
      targetDesc: `订单 ${order.orderNo}`,
      action: 'POST',
      actionName: '订单退款',
      beforeValue,
      afterValue,
      amount: refund.actualRefund,
      reason,
    })
  }

  return { result, order, beforeValue, afterValue, amount: refund.actualRefund, message: '退款成功' }
}

export async function refund(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const parsed = parseRefundRequest(req.body)
    const disposition = await executeOrderRefund({
      orderIdOrNo: id,
      amount: parsed.amount,
      reason: parsed.reason,
      req,
    })

    return success(res, disposition.result, disposition.message)
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

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

  const disposition = calculateNoShowDisposition({
    action,
    requestedAmount,
    orderAmount: order.amount,
    originalPenaltyAmount: order.penaltyAmount,
  })
  const refund = disposition.actualRefund > 0
    ? calculateOrderRefund({
      requestedAmount: disposition.actualRefund,
      orderAmount: order.amount,
      payMethod: order.payMethod,
      principalDeduction: order.principalDeduction,
      bonusDeduction: order.bonusDeduction,
    })
    : null

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
        refundAmount: disposition.actualRefund,
        penaltyAmount: disposition.retainedPenalty,
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
    if (action === 'FULL_REFUND') {
      await restoreThirdPartyCouponFromMetadata(tx, order.metadata)
    }

    if (order.userId) {
      if (refund?.isBalancePay && refund.actualRefund > 0) {
        // 同步退回门店余额
        await refundStoreBalanceFromSnapshot(tx, {
          userId: order.userId,
          refundAmount: refund.actualRefund,
          snapshot: order.balanceDeductionSnapshot as any,
          principalDeduction: order.principalDeduction || 0,
          bonusDeduction: order.bonusDeduction || 0,
        })

        await tx.user.update({
          where: { id: order.userId },
          data: {
            principalBalance: { increment: refund.principalAmount },
            bonusBalance: { increment: refund.bonusAmount },
          },
        })
      }

      if (refund && refund.actualRefund > 0) {
        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            type: 'REFUND',
            amount: refund.actualRefund,
            principalAmount: refund.principalAmount,
            bonusAmount: refund.bonusAmount,
            totalAmount: refund.totalAmount,
            orderId: order.id,
            venueId: order.venueId || null,
            remark: `已作废订单退款处置：${action === 'FULL_REFUND' ? '全额退款' : '部分退款'} ¥${(refund.actualRefund / 100).toFixed(2)}，保留违约金 ¥${(disposition.retainedPenalty / 100).toFixed(2)}，原因：${reason}`,
          },
        })
      }

      const earnTx = await tx.balanceTransaction.findFirst({
        where: { orderId: order.id, type: 'POINTS_EARN' },
      })
      const earned = earnTx?.pointsAmount || 0
      const revokeRatio = order.amount > 0 ? disposition.actualRefund / order.amount : 1
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
    refundAmount: disposition.actualRefund,
    retainedPenalty: disposition.retainedPenalty,
    action,
    noShowPenaltyReversed: disposition.reversedPenaltyAmount > 0,
    reversedPenaltyAmount: disposition.reversedPenaltyAmount,
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
      amount: disposition.actualRefund,
      reason,
    })
  }

  if (order.userId && disposition.actualRefund > 0) {
    await pushNotification(
      order.userId,
      'ORDER_REFUND',
      '订单退款',
      `您的订单 ${order.orderNo} 已退款 ¥${(disposition.actualRefund / 100).toFixed(2)}`
    )
  }

  return {
    result,
    order,
    beforeValue,
    afterValue,
    amount: disposition.actualRefund,
    message: action === 'NO_REFUND' ? '已记录不退款处置' : '退款处置完成',
  }
}

export async function noShowDisposition(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const parsed = parseNoShowDispositionRequest(req.body)
    const disposition = await executeNoShowDisposition({
      orderIdOrNo: id,
      action: parsed.action,
      amount: parsed.amount,
      reason: parsed.reason,
      req,
    })
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
        await restoreThirdPartyCouponFromMetadata(tx, order.metadata)

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'REFUNDED',
            refundAmount: order.amount,
          },
        })

        if (order.userId) {
          const refund = calculateOrderRefund({
            requestedAmount: 0,
            orderAmount: order.amount,
            payMethod: order.payMethod,
            principalDeduction: order.principalDeduction,
            bonusDeduction: order.bonusDeduction,
          })

          if (refund.isBalancePay) {
            // 同步退回门店余额
            await refundStoreBalanceFromSnapshot(tx, {
              userId: order.userId,
              refundAmount: refund.actualRefund,
              snapshot: order.balanceDeductionSnapshot as any,
              principalDeduction: order.principalDeduction || 0,
              bonusDeduction: order.bonusDeduction || 0,
            })

            // 恢复双钱包
            await tx.user.update({
              where: { id: order.userId },
              data: {
                principalBalance: { increment: refund.principalAmount },
                bonusBalance: { increment: refund.bonusAmount },
              },
            })
          }

          // 所有支付方式都创建退款流水
          await tx.balanceTransaction.create({
            data: {
              userId: order.userId,
              type: 'REFUND',
              amount: refund.actualRefund,
              principalAmount: refund.principalAmount,
              bonusAmount: refund.bonusAmount,
              totalAmount: refund.totalAmount,
              orderId: order.id,
              venueId: order.venueId || null,
              remark: refund.isBalancePay
                ? `批量退款恢复余额（本金¥${refund.principalAmount / 100}+赠送¥${refund.bonusAmount / 100}）原因：${reason}`
                : `批量在线支付退款（${order.payMethod} ¥${refund.actualRefund / 100}）原因：${reason}`,
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

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'NO_SHOW',
          noShowAt: new Date(),
          noShowReason: reason || 'manual',
        },
      })

      if (order.bookingId) {
        await tx.booking.update({
          where: { id: order.bookingId },
          data: { status: 'NO_SHOW', noShowAt: new Date() },
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
      const reasonMap: Record<string, string> = { manual: '店长手动标记', auto: '系统自动标记' }
      const reasonText = reason ? (reasonMap[reason] || reason) : ''
      pushNotification(
        order.userId,
        'NO_SHOW',
        '预约已标记为爽约',
        `您在 ${bookingDate} ${startTime} 的预约因未到场被标记为爽约${reasonText ? '，原因：' + reasonText : ''}`
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


export async function redeem(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const { verifyCode, id: orderIdInput, venueId, date, startTime, endTime, personName, personPhone, personCount, note, title, gameId, type, completed = false } = req.body

    const where: any = {
      status: { in: ['PAID', 'READY_TO_VERIFY', 'COMPLETED'] },
      groupBuyPackageId: { not: null },
    }
    if (verifyCode) {
      where.verifyCode = verifyCode
    } else if (orderIdInput) {
      where.id = orderIdInput
    } else {
      return error(res, '请提供券码或订单ID', 400)
    }

    const order = await prisma.order.findFirst({
      where,
      include: {
        booking: true,
        groupBuyPackage: {
          include: {
            venues: { select: { id: true, name: true } },
            game: { select: { id: true, title: true } },
          },
        },
      },
    })
    if (!order) {
      return error(res, '团购券订单不存在或已核销', 404)
    }

    const voucherMetadata = (order.metadata as Record<string, any>) || {}
    const existingRedeemedOrderId = voucherMetadata.redeemedOrderId

    // 已使用的团购券：直接完成关联的普通订单核销
    if (order.status === 'COMPLETED' || existingRedeemedOrderId) {
      if (!completed) {
        return error(res, '该团购券已使用，请选择核销', 400)
      }

      // 优先查找新流程生成的独立普通订单
      let childOrder: any = null
      if (existingRedeemedOrderId) {
        childOrder = await prisma.order.findUnique({
          where: { id: existingRedeemedOrderId },
          include: { booking: true },
        })
      }

      if (childOrder && childOrder.bookingId) {
        const result = await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { id: childOrder.bookingId as string },
            data: { status: 'COMPLETED' },
          })
          const updatedOrder = await tx.order.update({
            where: { id: childOrder.id },
            data: {
              status: 'COMPLETED',
              verifiedAt: new Date(),
            },
            include: {
              booking: { include: { venue: true, game: true } },
            },
          })
          return updatedOrder
        })

        if (order.userId) {
          await pushNotification(
            order.userId,
            'ORDER_COMPLETED',
            '团购券已核销',
            `您的团购券 ${order.verifyCode} 已核销，预约 ${childOrder.venueName || ''} ${childOrder.bookingTime || ''}`
          )
        }

        await logAudit(req, {
          targetType: 'ORDER',
          targetId: order.id,
          targetDesc: `订单 ${order.orderNo}`,
          action: 'POST',
          actionName: '团购券核销',
          beforeValue: { status: order.status, bookingId: order.bookingId, venueId: order.venueId },
          afterValue: { status: 'COMPLETED', bookingId: childOrder.bookingId, venueId: childOrder.venueId },
          reason: `券码 ${order.verifyCode} 已预约，直接核销`,
        })

        return success(res, result, '团购券已核销')
      }

      // 兼容旧数据：券订单本身绑定了 booking
      if (order.bookingId && order.booking) {
        const result = await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { id: order.bookingId as string },
            data: { status: 'COMPLETED' },
          })
          const updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'COMPLETED',
              verifiedAt: new Date(),
            },
            include: {
              booking: { include: { venue: true, game: true } },
              groupBuyPackage: { select: { id: true, title: true, label: true, coverImage: true, game: { select: { id: true, title: true, duration: true } } } },
            },
          })
          return updatedOrder
        })

        if (order.userId) {
          await pushNotification(
            order.userId,
            'ORDER_COMPLETED',
            '团购券已核销',
            `您的团购券 ${order.verifyCode} 已核销，预约 ${order.venueName || ''} ${order.bookingTime || ''}`
          )
        }

        await logAudit(req, {
          targetType: 'ORDER',
          targetId: order.id,
          targetDesc: `订单 ${order.orderNo}`,
          action: 'POST',
          actionName: '团购券核销',
          beforeValue: { status: order.status, bookingId: order.bookingId, venueId: order.venueId },
          afterValue: { status: result.status, bookingId: result.bookingId, venueId: result.venueId },
          reason: `券码 ${order.verifyCode} 已预约，直接核销`,
        })

        return success(res, result, '团购券已核销')
      }

      return error(res, '该团购券已使用但未找到关联订单', 400)
    }

    if (order.status !== 'PAID') {
      return error(res, '团购券状态不允许预约', 400)
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId } })
    if (!venue) {
      return error(res, '场地不存在', 404)
    }

    const allowedVenueIds = order.groupBuyPackage?.venues.map((v: any) => v.id) || []
    if (allowedVenueIds.length > 0 && !allowedVenueIds.includes(venueId)) {
      return error(res, '该团购券不在所选门店适用范围内', 400)
    }

    // 检查时段冲突
    const queryDate = new Date(`${date}T00:00:00.000Z`)
    const overlapping = await prisma.booking.findMany({
      where: { venueId, date: queryDate, status: { not: 'CANCELLED' } },
    })
    const s1 = timeToMinutes(startTime)
    const e1 = timeToMinutes(endTime)
    const conflicts = overlapping.filter((b) => {
      const s2 = timeToMinutes(b.startTime)
      const e2 = timeToMinutes(b.endTime)
      return s1 < e2 && e1 > s2
    })

    const capacity = venue.capacity || venue.deviceCount || 1
    const pc = parseInt(personCount) || 1
    const finalGameId = gameId || order.groupBuyPackage?.gameId || null

    // 按场地人数容量判断：统计所有冲突预约的总人数
    const currentCount = conflicts.reduce((sum, b) => sum + (b.personCount || 1), 0)
    if (currentCount + pc > capacity) {
      return error(res, '该时段已约满', 409)
    }

    const bookingTitle = title || `${venue.name} ${type === 'TEAM' ? '团队预约' : type === 'INDIVIDUAL' ? '散客预约' : type === 'CORPORATE' ? '企业活动' : '团购预约'} ${startTime}-${endTime}`

    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建实际预约场次
      const booking = await tx.booking.create({
        data: {
          venueId,
          type: type || 'TEAM',
          gameId: finalGameId,
          title: bookingTitle,
          date: queryDate,
          startTime,
          endTime,
          personName,
          personPhone,
          personCount: pc,
          note: note || null,
          userId: order.userId || null,
          status: completed ? 'COMPLETED' : 'CONFIRMED',
        },
      })

      // 2. 生成独立的普通订单作为实际可核销订单
      const newOrderNo = await generateOrderNo('normal', tx)
      const childOrder = await tx.order.create({
        data: {
          orderNo: newOrderNo,
          userId: order.userId,
          bookingId: booking.id,
          venueId,
          venueName: venue.name,
          bookingTime: `${date} ${startTime}-${endTime}`,
          originalAmount: 0,
          amount: 0,
          discountAmount: 0,
          discountRate: 100,
          couponDiscount: 0,
          status: completed ? 'COMPLETED' : 'PAID',
          source: 'ONLINE',
          payMethod: 'BALANCE',
          paidAt: new Date(),
          orderKind: 'NORMAL',
          verifyCode: generateVerifyCode(),
          metadata: {
            redeemedFromOrderId: order.id,
            redeemedFromOrderNo: order.orderNo,
            groupBuyPackageId: order.groupBuyPackageId,
            redeemedVoucherCode: order.verifyCode,
          } as any,
        },
        include: {
          booking: { include: { venue: true, game: true } },
        },
      })

      // 3. 原团购券订单标记为已使用
      const originalMetadata = (order.metadata as Record<string, any>) || {}
      const updatedVoucher = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          verifiedAt: new Date(),
          metadata: {
            ...originalMetadata,
            redeemedOrderId: childOrder.id,
            redeemedOrderNo: childOrder.orderNo,
            redeemedAt: new Date().toISOString(),
          },
        },
        include: {
          groupBuyPackage: { select: { id: true, title: true, label: true, coverImage: true, game: { select: { id: true, title: true, duration: true } } } },
        },
      })

      return { childOrder, updatedVoucher }
    })

    if (order.userId) {
      await pushNotification(
        order.userId,
        completed ? 'ORDER_COMPLETED' : 'BOOKING_SUCCESS',
        completed ? '团购券已核销' : '团购券预约成功',
        completed
          ? `您的团购券 ${order.verifyCode} 已核销，预约 ${venue.name} ${date} ${startTime}-${endTime}`
          : `您的团购券已预约 ${venue.name} ${date} ${startTime}-${endTime}，请准时到店`
      )
    }

    await logAudit(req, {
      targetType: 'ORDER',
      targetId: order.id,
      targetDesc: `订单 ${order.orderNo}`,
      action: 'POST',
      actionName: '团购券核销',
      beforeValue: { status: order.status, bookingId: order.bookingId, venueId: order.venueId },
      afterValue: { status: result.updatedVoucher.status, bookingId: result.updatedVoucher.bookingId, venueId: result.updatedVoucher.venueId, childOrderId: result.childOrder.id },
      reason: `券码 ${order.verifyCode} 核销为 ${venue.name} ${date} ${startTime}-${endTime}，生成订单 ${result.childOrder.orderNo}`,
    })

    return success(res, result.childOrder, completed ? '团购券已核销' : '团购券预约成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}


/**
 * C 端用户在线预约团购券
 * 仅允许订单所有者将已付款团购订单绑定到指定门店/时段，状态按核销提前量计算
 */
export async function redeemCustomer(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const orderId = req.params.id as string
    const userId = req.user?.id
    const { venueId, date, startTime, endTime, personName, personPhone, personCount, note, type } = req.body

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        groupBuyPackage: {
          include: {
            venues: { select: { id: true, name: true } },
            game: { select: { id: true, title: true } },
          },
        },
      },
    })
    if (!order) {
      return error(res, '订单不存在', 404)
    }
    if (!order.groupBuyPackageId) {
      return error(res, '该订单不是团购订单', 400)
    }
    if (order.status !== 'PAID') {
      return error(res, '订单状态不允许预约', 400)
    }
    if (order.bookingId) {
      return error(res, '该团购券已绑定预约', 400)
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId } })
    if (!venue) {
      return error(res, '场地不存在', 404)
    }

    const allowedVenueIds = order.groupBuyPackage?.venues.map((v: any) => v.id) || []
    if (allowedVenueIds.length > 0 && !allowedVenueIds.includes(venueId)) {
      return error(res, '该团购券不在所选门店适用范围内', 400)
    }

    const queryDate = new Date(`${date}T00:00:00.000Z`)
    const overlapping = await prisma.booking.findMany({
      where: { venueId, date: queryDate, status: { not: 'CANCELLED' } },
    })
    const s1 = timeToMinutes(startTime)
    const e1 = timeToMinutes(endTime)
    const conflicts = overlapping.filter((b) => {
      const s2 = timeToMinutes(b.startTime)
      const e2 = timeToMinutes(b.endTime)
      return s1 < e2 && e1 > s2
    })

    const capacity = venue.capacity || venue.deviceCount || 1
    const pc = parseInt(personCount) || 1
    const finalGameId = order.groupBuyPackage?.gameId || null

    // 按场地人数容量判断：统计所有冲突预约的总人数
    const currentCount = conflicts.reduce((sum, b) => sum + (b.personCount || 1), 0)
    if (currentCount + pc > capacity) {
      return error(res, '该时段已约满', 409)
    }

    const bookingTitle = `${venue.name} 团购预约 ${startTime}-${endTime}`
    const targetStatus = await getRestoreNoShowTargetStatus({ date: queryDate, startTime })

    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建实际预约场次
      const booking = await tx.booking.create({
        data: {
          venueId,
          type: type || 'TEAM',
          gameId: finalGameId,
          title: bookingTitle,
          date: queryDate,
          startTime,
          endTime,
          personName,
          personPhone,
          personCount: pc,
          note: note || null,
          userId: order.userId || null,
          status: targetStatus.bookingStatus,
        },
      })

      // 2. 生成独立的普通订单作为实际可核销订单
      const newOrderNo = await generateOrderNo('normal', tx)
      const childOrder = await tx.order.create({
        data: {
          orderNo: newOrderNo,
          userId: order.userId,
          bookingId: booking.id,
          venueId,
          venueName: venue.name,
          bookingTime: `${date} ${startTime}-${endTime}`,
          originalAmount: 0,
          amount: 0,
          discountAmount: 0,
          discountRate: 100,
          couponDiscount: 0,
          status: targetStatus.orderStatus,
          source: 'ONLINE',
          payMethod: 'BALANCE',
          paidAt: new Date(),
          orderKind: 'NORMAL',
          verifyCode: generateVerifyCode(),
          metadata: {
            redeemedFromOrderId: order.id,
            redeemedFromOrderNo: order.orderNo,
            groupBuyPackageId: order.groupBuyPackageId,
            redeemedVoucherCode: order.verifyCode,
          } as any,
        },
        include: {
          booking: { include: { venue: true, game: true } },
        },
      })

      // 3. 原团购券订单标记为已使用
      const originalMetadata = (order.metadata as Record<string, any>) || {}
      const updatedVoucher = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          verifiedAt: new Date(),
          metadata: {
            ...originalMetadata,
            redeemedOrderId: childOrder.id,
            redeemedOrderNo: childOrder.orderNo,
            redeemedAt: new Date().toISOString(),
          },
        },
        include: {
          groupBuyPackage: { select: { id: true, title: true, label: true, coverImage: true, game: { select: { id: true, title: true, duration: true } } } },
        },
      })

      return { childOrder, updatedVoucher }
    })

    if (order.userId) {
      await pushNotification(
        order.userId,
        'BOOKING_SUCCESS',
        '团购券预约成功',
        `您的团购券已预约 ${venue.name} ${date} ${startTime}-${endTime}，请准时到店`
      )
    }

    await logAudit(req, {
      targetType: 'ORDER',
      targetId: order.id,
      targetDesc: `订单 ${order.orderNo}`,
      action: 'POST',
      actionName: 'C端团购券预约',
      beforeValue: { status: order.status, bookingId: order.bookingId, venueId: order.venueId },
      afterValue: { status: result.updatedVoucher.status, bookingId: result.updatedVoucher.bookingId, venueId: result.updatedVoucher.venueId, childOrderId: result.childOrder.id },
      reason: `用户预约 ${venue.name} ${date} ${startTime}-${endTime}，生成订单 ${result.childOrder.orderNo}`,
    })

    return success(res, result.childOrder, '预约成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
