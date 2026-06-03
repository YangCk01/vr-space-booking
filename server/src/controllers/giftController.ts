import { Response } from 'express'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { pushNotification } from './notificationController'
import { AuthenticatedRequest } from '../types'
import { addDays } from 'date-fns'
import { checkGiftRisk, checkBatchLimit, recordGiftOperation } from '../services/riskControlService'
import { logAudit } from '../middleware/auditLog'

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

export const batchGiftPointsValidators = [
  body('userIds').isArray({ min: 1 }).withMessage('用户ID列表不能为空'),
  body('points').isInt({ min: 1 }).withMessage('赠送积分必须为正整数'),
  body('reason').notEmpty().withMessage('赠送原因不能为空'),
]

export const batchGiftCouponValidators = [
  body('userIds').isArray({ min: 1 }).withMessage('用户ID列表不能为空'),
  body('couponConfig').isObject().withMessage('优惠券配置必须为对象'),
  body('couponConfig.name').notEmpty().withMessage('优惠券名称不能为空'),
  body('couponConfig.type').isIn(['EXPERIENCE_FREE', 'DISCOUNT']).withMessage('优惠券类型无效'),
  body('couponConfig.validityDays').isInt({ min: 1 }).withMessage('有效期必须为正整数'),
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
    const operatorId = req.user!.id

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return error(res, '用户不存在', 404)
    if (user.role !== 'CUSTOMER') return error(res, '只能赠送给会员用户', 400)

    await checkGiftRisk(userId, operatorId, points)

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

    recordGiftOperation(operatorId)

    await pushNotification(
      userId,
      'POINTS_GIFT',
      '积分赠送',
      `管理员赠送您 ${points} 积分，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`
    )

    await logAudit(req, {
      targetType: 'USER',
      targetId: userId,
      targetDesc: `${user.name || user.phone || userId} - 积分赠送`,
      action: 'POST',
      actionName: '赠送积分',
      afterValue: { points, reason, remark: fullRemark },
      amount: points,
      reason: fullRemark,
    })

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

    await logAudit(req, {
      targetType: 'USER_COUPON',
      targetId: coupon.id,
      targetDesc: `${user.name || user.phone || userId} - 优惠券赠送`,
      action: 'POST',
      actionName: '赠送优惠券',
      afterValue: { couponId: coupon.id, name, type, validityDays, reason, remark },
      reason: `赠送优惠券「${name}」，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`,
    })

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

    const where: any = { source: { in: ['MANUAL_GIFT', 'CAMPAIGN'] } }
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


/* ─── 5. 批量赠送积分 ─── */
export async function batchGiftPoints(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const { userIds, points, reason, remark } = req.body
    const operatorId = req.user!.id

    checkBatchLimit(userIds.length, 100)

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
    })
    if (users.length !== userIds.length) {
      return error(res, '部分用户不存在', 400)
    }
    const invalidUsers = users.filter((u) => u.role !== 'CUSTOMER')
    if (invalidUsers.length > 0) {
      return error(res, '只能批量赠送给会员用户', 400)
    }

    // 风控检查：总积分
    const totalPoints = points * userIds.length
    await checkGiftRisk('batch', operatorId, totalPoints)

    const reasonLabel = formatReasonLabel(reason)
    const fullRemark = remark
      ? `批量赠送积分 - ${reasonLabel} - ${remark}`
      : `批量赠送积分 - ${reasonLabel}`

    await prisma.$transaction(
      users.flatMap((user) => [
        prisma.user.update({
          where: { id: user.id },
          data: { points: { increment: points } },
        }),
        prisma.balanceTransaction.create({
          data: {
            userId: user.id,
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
    )

    recordGiftOperation(operatorId)

    for (const user of users) {
      await pushNotification(
        user.id,
        'POINTS_GIFT',
        '积分赠送',
        `管理员赠送您 ${points} 积分，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`
      )
    }

    await logAudit(req, {
      targetType: 'USER',
      targetId: 'batch',
      targetDesc: `批量赠送积分 - ${users.length} 人`,
      action: 'POST',
      actionName: '批量赠送积分',
      afterValue: { userIds, points, reason, remark, count: users.length },
      amount: totalPoints,
      reason: fullRemark,
    })

    return success(res, { userIds, points, reason, remark, count: users.length }, '批量积分赠送成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 6. 批量赠送优惠券 ─── */
export async function batchGiftCoupon(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const { userIds, couponConfig, reason, remark } = req.body
    const operatorId = req.user!.id

    checkBatchLimit(userIds.length, 100)

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
    })
    if (users.length !== userIds.length) {
      return error(res, '部分用户不存在', 400)
    }
    const invalidUsers = users.filter((u) => u.role !== 'CUSTOMER')
    if (invalidUsers.length > 0) {
      return error(res, '只能批量赠送给会员用户', 400)
    }

    const { name, type, discountRate, validityDays } = couponConfig
    if (type === 'DISCOUNT' && (!discountRate || discountRate < 1 || discountRate > 99)) {
      return error(res, '折扣券折扣率必须在 1-99 之间', 400)
    }

    const now = new Date()
    const validTo = addDays(now, validityDays)
    const reasonLabel = formatReasonLabel(reason)

    await prisma.$transaction(
      users.map((user) =>
        prisma.userCoupon.create({
          data: {
            userId: user.id,
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
      )
    )

    for (const user of users) {
      await pushNotification(
        user.id,
        'COUPON_GIFT',
        '优惠券赠送',
        `管理员赠送您一张「${name}」优惠券，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`
      )
    }

    await logAudit(req, {
      targetType: 'USER_COUPON',
      targetId: 'batch',
      targetDesc: `批量赠送优惠券 - ${users.length} 人`,
      action: 'POST',
      actionName: '批量赠送优惠券',
      afterValue: { userIds, name, type, validityDays, reason, remark, count: users.length },
      reason: `批量赠送优惠券「${name}」，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`,
    })

    return success(res, { userIds, name, type, count: users.length }, '批量优惠券赠送成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
