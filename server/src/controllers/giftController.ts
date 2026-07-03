import { Response } from 'express'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { AuthenticatedRequest } from '../types'
import { checkGiftRisk, checkCouponGiftRisk, checkBatchLimit } from '../services/riskControlService'
import {
  MEMBER_GIFT_APPROVAL_POLICY_KEY,
  canManageMemberGiftApprovalPolicy,
  normalizeMemberGiftApprovalPolicy,
  shouldRequireMemberGiftApproval,
} from '../domain/memberGiftApprovalPolicy'
import {
  MemberGiftApprovalPayload,
  executeGiftCoupon,
  executeGiftPoints,
  formatGiftReasonLabel,
} from '../services/memberGiftService'
import { pushAdminNotification } from './notificationController'

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

/* ─── Approval policy ─── */
async function getStoredGiftApprovalPolicy() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: MEMBER_GIFT_APPROVAL_POLICY_KEY } })
  return normalizeMemberGiftApprovalPolicy(setting?.value)
}

function buildRequester(req: AuthenticatedRequest) {
  return {
    id: req.user?.id || '',
    name: req.user?.name || req.user?.phone || '未知用户',
    role: req.user?.role || 'OPERATOR',
  }
}

async function createGiftApproval(req: AuthenticatedRequest, input: {
  payload: MemberGiftApprovalPayload
  targetType: string
  targetId: string
  targetDesc: string
  amount?: number
  reason: string
  beforeValue?: Record<string, unknown>
  afterValue?: Record<string, unknown>
}) {
  const requester = buildRequester(req)
  return prisma.approvalRequest.create({
    data: {
      type: input.payload.mode === 'SINGLE_COUPON' || input.payload.mode === 'BATCH_COUPON' ? 'COUPON_GIFT' : 'POINTS_ADJUST',
      targetType: input.targetType,
      targetId: input.targetId,
      targetDesc: input.targetDesc,
      requesterId: requester.id,
      requesterName: requester.name,
      requesterRole: requester.role,
      requestPayload: input.payload as any,
      beforeValue: input.beforeValue as any,
      afterValue: input.afterValue as any,
      amount: input.amount,
      reason: input.reason,
    },
  })
}

async function notifyGiftApprovalCreated(approval: Awaited<ReturnType<typeof createGiftApproval>>) {
  const typeLabel = approval.type === 'COUPON_GIFT' ? '优惠券赠送' : '积分赠送'
  await pushAdminNotification(
    'ADMIN_APPROVAL_REQUEST',
    `新的${typeLabel}审批`,
    `${approval.requesterName} 发起${typeLabel}审批：${approval.targetDesc}`,
    'APPROVAL'
  )
}

export async function getGiftApprovalPolicy(req: AuthenticatedRequest, res: Response) {
  if (!canManageMemberGiftApprovalPolicy(req.user?.role)) return error(res, '权限不足', 403)

  try {
    const policy = await getStoredGiftApprovalPolicy()
    return success(res, policy)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function updateGiftApprovalPolicy(req: AuthenticatedRequest, res: Response) {
  if (!canManageMemberGiftApprovalPolicy(req.user?.role)) return error(res, '权限不足', 403)

  try {
    const policy = normalizeMemberGiftApprovalPolicy(req.body)
    await prisma.systemSetting.upsert({
      where: { key: MEMBER_GIFT_APPROVAL_POLICY_KEY },
      create: { key: MEMBER_GIFT_APPROVAL_POLICY_KEY, value: policy as any, category: 'member' },
      update: { value: policy as any, category: 'member' },
    })
    return success(res, policy, '会员赠送审批策略已保存')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
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

    const policy = await getStoredGiftApprovalPolicy()
    const reasonLabel = formatGiftReasonLabel(reason)
    if (shouldRequireMemberGiftApproval(policy, { kind: 'POINTS', points, userCount: 1 })) {
      const approval = await createGiftApproval(req, {
        payload: { mode: 'SINGLE_POINTS', userIds: [userId], points, reason, remark },
        targetType: 'USER',
        targetId: userId,
        targetDesc: `${user.name || user.phone || userId} - 积分赠送`,
        amount: points,
        reason: `赠送积分 ${points}，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`,
        beforeValue: { points: user.points },
        afterValue: { points: user.points + points },
      })
      await notifyGiftApprovalCreated(approval)
      return success(res, { approvalRequired: true, approval }, '赠送审批已提交')
    }

    const result = await executeGiftPoints({ userIds: [userId], points, reason, remark, operatorId, req })
    return success(res, result.data, '积分赠送成功')
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
    await checkCouponGiftRisk(1)

    const policy = await getStoredGiftApprovalPolicy()
    const reasonLabel = formatGiftReasonLabel(reason)
    if (shouldRequireMemberGiftApproval(policy, { kind: 'COUPON', couponType: type, userCount: 1 })) {
      const approval = await createGiftApproval(req, {
        payload: { mode: 'SINGLE_COUPON', userIds: [userId], name, type, discountRate, validityDays, reason, remark },
        targetType: 'USER_COUPON',
        targetId: userId,
        targetDesc: `${user.name || user.phone || userId} - 优惠券赠送`,
        reason: `赠送优惠券「${name}」，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`,
        beforeValue: { couponCount: 0 },
        afterValue: { name, type, discountRate, validityDays, reason, remark },
      })
      await notifyGiftApprovalCreated(approval)
      return success(res, { approvalRequired: true, approval }, '赠送审批已提交')
    }

    const result = await executeGiftCoupon({ userIds: [userId], name, type, discountRate, validityDays, reason, remark, req })
    return success(res, result.data, '优惠券赠送成功')
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

    const policy = await getStoredGiftApprovalPolicy()
    const reasonLabel = formatGiftReasonLabel(reason)
    if (shouldRequireMemberGiftApproval(policy, { kind: 'POINTS', points, userCount: users.length })) {
      const approval = await createGiftApproval(req, {
        payload: { mode: 'BATCH_POINTS', userIds, points, reason, remark },
        targetType: 'USER',
        targetId: 'batch',
        targetDesc: `批量赠送积分 - ${users.length} 人`,
        amount: totalPoints,
        reason: `批量赠送积分 ${points}，${users.length} 人，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`,
        beforeValue: { users: users.map((user) => ({ id: user.id, points: user.points })) },
        afterValue: { userIds, points, count: users.length },
      })
      await notifyGiftApprovalCreated(approval)
      return success(res, { approvalRequired: true, approval }, '批量赠送审批已提交')
    }

    const result = await executeGiftPoints({ userIds, points, reason, remark, operatorId, req })
    return success(res, result.data, '批量积分赠送成功')
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
    await checkCouponGiftRisk(users.length)

    const policy = await getStoredGiftApprovalPolicy()
    const reasonLabel = formatGiftReasonLabel(reason)
    if (shouldRequireMemberGiftApproval(policy, { kind: 'COUPON', couponType: type, userCount: users.length })) {
      const approval = await createGiftApproval(req, {
        payload: { mode: 'BATCH_COUPON', userIds, name, type, discountRate, validityDays, reason, remark },
        targetType: 'USER_COUPON',
        targetId: 'batch',
        targetDesc: `批量赠送优惠券 - ${users.length} 人`,
        reason: `批量赠送优惠券「${name}」，${users.length} 人，原因：${reasonLabel}${remark ? '（' + remark + '）' : ''}`,
        beforeValue: { userIds },
        afterValue: { userIds, name, type, validityDays, reason, remark, count: users.length },
      })
      await notifyGiftApprovalCreated(approval)
      return success(res, { approvalRequired: true, approval }, '批量赠送审批已提交')
    }

    const result = await executeGiftCoupon({ userIds, name, type, discountRate, validityDays, reason, remark, req })
    return success(res, result.data, '批量优惠券赠送成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
