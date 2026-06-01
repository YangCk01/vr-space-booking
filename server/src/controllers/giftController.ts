import { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { pushNotification } from './notificationController'
import { AuthenticatedRequest } from '../types'
import { addDays } from 'date-fns'

/* ─── Validators ─── */
export const giftPointsValidators = [
  body('userId').notEmpty().withMessage('用户ID不能为空'),
  body('points').isInt({ min: 1 }).withMessage('赠送积分必须为正整数'),
  body('reason').notEmpty().withMessage('赠送原因不能为空'),
]

export const giftCouponValidators = [
  body('userId').notEmpty().withMessage('用户ID不能为空'),
  body('name').notEmpty().withMessage('优惠券名称不能为空'),
  body('type').isIn(['EXPERIENCE_FREE', 'DISCOUNT']).withMessage('优惠券类型无效'),
  body('validityDays').isInt({ min: 1 }).withMessage('有效期必须为正整数'),
  body('reason').notEmpty().withMessage('赠送原因不能为空'),
]

/* ─── Helpers ─── */
function formatReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    COMPLAINT: '客诉',
    EQUIPMENT_FAILURE: '设备故障',
    ENTERTAIN_CLIENT: '招待客户',
    OTHER: '备注',
  }
  return map[reason] || reason
}

/* ─── 1. 赠送积分 ─── */
export async function giftPoints(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const { userId, points, reason, remark } = req.body

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return error(res, '用户不存在', 404)
    if (user.role !== 'CUSTOMER') return error(res, '只能赠送给会员用户', 400)

    const reasonLabel = formatReasonLabel(reason)
    const fullRemark = remark
      ? `手动赠送积分 - ${reasonLabel} - ${remark}`
      : `手动赠送积分 - ${reasonLabel}`

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { points: { increment: points } },
      }),
      prisma.balanceTransaction.create({
        data: {
          userId,
          type: 'POINTS_GIFT',
          amount: 0,
          pointsAmount: points,
          principalAmount: 0,
          bonusAmount: 0,
          totalAmount: 0,
          remark: fullRemark,
        },
      }),
    ])

    await pushNotification(
      userId,
      'POINTS_GIFT',
      '积分赠送',
      `管理员赠送您 ${points} 积分，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`
    )

    return success(res, { userId, points, reason, remark }, '积分赠送成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 2. 赠送优惠券 ─── */
export async function giftCoupon(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const { userId, name, type, discountRate, validityDays, reason, remark } = req.body

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return error(res, '用户不存在', 404)
    if (user.role !== 'CUSTOMER') return error(res, '只能赠送给会员用户', 400)

    if (type === 'DISCOUNT' && (!discountRate || discountRate < 1 || discountRate > 99)) {
      return error(res, '折扣券折扣率必须在 1-99 之间', 400)
    }

    const now = new Date()
    const validTo = addDays(now, validityDays)
    const reasonLabel = formatReasonLabel(reason)

    const coupon = await prisma.userCoupon.create({
      data: {
        userId,
        name,
        type,
        discountRate: type === 'DISCOUNT' ? discountRate : null,
        status: 'UNUSED',
        validFrom: now,
        validTo,
        source: 'MANUAL_GIFT',
        giftReason: reason,
        giftRemark: remark || null,
      },
    })

    await pushNotification(
      userId,
      'COUPON_GIFT',
      '优惠券赠送',
      `管理员赠送您一张「${name}」优惠券，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`
    )

    return success(res, coupon, '优惠券赠送成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 3. 积分赠送记录 ─── */
export async function listPointsRecords(req: AuthenticatedRequest, res: Response) {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const userId = req.query.userId as string | undefined

    const where: any = { type: 'POINTS_GIFT' }
    if (userId) where.userId = userId

    const [records, total] = await Promise.all([
      prisma.balanceTransaction.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.balanceTransaction.count({ where }),
    ])

    return success(res, {
      data: records,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 4. 优惠券赠送记录 ─── */
export async function listCouponRecords(req: AuthenticatedRequest, res: Response) {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const userId = req.query.userId as string | undefined

    const where: any = { source: 'MANUAL_GIFT' }
    if (userId) where.userId = userId

    const [records, total] = await Promise.all([
      prisma.userCoupon.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.userCoupon.count({ where }),
    ])

    return success(res, {
      data: records,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
