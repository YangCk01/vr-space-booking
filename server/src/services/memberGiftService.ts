import { addDays } from 'date-fns'
import { prisma } from '../utils/prisma'
import { AuthenticatedRequest } from '../types'
import { logAudit } from '../middleware/auditLog'
import { pushNotification } from '../controllers/notificationController'
import { recordGiftOperation } from './riskControlService'

export type GiftReason = 'COMPLAINT' | 'EQUIPMENT_FAILURE' | 'ENTERTAIN_CLIENT' | 'OTHER' | string

export type MemberGiftApprovalPayload =
  | {
      mode: 'SINGLE_POINTS' | 'BATCH_POINTS'
      userIds: string[]
      points: number
      reason: GiftReason
      remark?: string
    }
  | {
      mode: 'SINGLE_COUPON' | 'BATCH_COUPON'
      userIds: string[]
      name: string
      type: 'EXPERIENCE_FREE' | 'DISCOUNT'
      discountRate?: number
      validityDays: number
      reason: GiftReason
      remark?: string
    }

export function formatGiftReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    COMPLAINT: '客诉',
    EQUIPMENT_FAILURE: '设备故障',
    ENTERTAIN_CLIENT: '招待客户',
    OTHER: '备注',
  }
  return map[reason] || reason
}

async function assertCustomerUsers(userIds: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } })
  if (users.length !== userIds.length) throw new Error('部分用户不存在')
  if (users.some((u) => u.role !== 'CUSTOMER')) throw new Error('只能赠送给会员用户')
  return users
}

export async function executeGiftPoints(input: {
  userIds: string[]
  points: number
  reason: GiftReason
  remark?: string
  operatorId: string
  req?: AuthenticatedRequest
}) {
  const users = await assertCustomerUsers(input.userIds)
  const reasonLabel = formatGiftReasonLabel(input.reason)
  const isBatch = users.length > 1
  const fullRemark = input.remark
    ? `${isBatch ? '批量' : '手动'}赠送积分 - ${reasonLabel} - ${input.remark}`
    : `${isBatch ? '批量' : '手动'}赠送积分 - ${reasonLabel}`

  const beforeValue = {
    users: users.map((user) => ({ id: user.id, name: user.name, phone: user.phone, points: user.points })),
  }

  await prisma.$transaction(
    users.flatMap((user) => [
      prisma.user.update({
        where: { id: user.id },
        data: { points: { increment: input.points } },
      }),
      prisma.balanceTransaction.create({
        data: {
          userId: user.id,
          type: 'POINTS_GIFT',
          amount: 0,
          pointsAmount: input.points,
          principalAmount: 0,
          bonusAmount: 0,
          totalAmount: 0,
          remark: fullRemark,
        },
      }),
    ])
  )

  recordGiftOperation(input.operatorId)

  for (const user of users) {
    await pushNotification(
      user.id,
      'POINTS_GIFT',
      '积分赠送',
      `管理员赠送您 ${input.points} 积分，原因：${reasonLabel}${input.remark ? '（' + input.remark + '）' : ''}`
    )
  }

  const afterValue = {
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      phone: user.phone,
      points: user.points + input.points,
    })),
    points: input.points,
    reason: input.reason,
    remark: fullRemark,
  }

  if (input.req) {
    await logAudit(input.req, {
      targetType: 'USER',
      targetId: isBatch ? 'batch' : users[0].id,
      targetDesc: isBatch ? `批量赠送积分 - ${users.length} 人` : `${users[0].name || users[0].phone || users[0].id} - 积分赠送`,
      action: 'POST',
      actionName: isBatch ? '批量赠送积分' : '赠送积分',
      beforeValue,
      afterValue,
      amount: input.points * users.length,
      reason: fullRemark,
    })
  }

  return {
    beforeValue,
    afterValue,
    amount: input.points * users.length,
    data: { userIds: input.userIds, points: input.points, reason: input.reason, remark: input.remark, count: users.length },
  }
}

export async function executeGiftCoupon(input: {
  userIds: string[]
  name: string
  type: 'EXPERIENCE_FREE' | 'DISCOUNT'
  discountRate?: number
  validityDays: number
  reason: GiftReason
  remark?: string
  req?: AuthenticatedRequest
}) {
  if (input.type === 'DISCOUNT' && (!input.discountRate || input.discountRate < 1 || input.discountRate > 99)) {
    throw new Error('折扣券折扣率必须在 1-99 之间')
  }

  const users = await assertCustomerUsers(input.userIds)
  const now = new Date()
  const validTo = addDays(now, input.validityDays)
  const reasonLabel = formatGiftReasonLabel(input.reason)
  const isBatch = users.length > 1

  const coupons = await prisma.$transaction(
    users.map((user) =>
      prisma.userCoupon.create({
        data: {
          userId: user.id,
          name: input.name,
          type: input.type,
          discountRate: input.type === 'DISCOUNT' ? input.discountRate : null,
          status: 'UNUSED',
          validFrom: now,
          validTo,
          source: 'MANUAL_GIFT',
          giftReason: input.reason,
          giftRemark: input.remark || null,
        },
      })
    )
  )

  for (const user of users) {
    await pushNotification(
      user.id,
      'COUPON_GIFT',
      '优惠券赠送',
      `管理员赠送您一张「${input.name}」优惠券，原因：${reasonLabel}${input.remark ? '（' + input.remark + '）' : ''}`
    )
  }

  const beforeValue = { users: users.map((user) => ({ id: user.id, name: user.name, phone: user.phone })) }
  const afterValue = {
    couponIds: coupons.map((coupon) => coupon.id),
    userIds: input.userIds,
    name: input.name,
    type: input.type,
    validityDays: input.validityDays,
    reason: input.reason,
    remark: input.remark,
    count: users.length,
  }

  if (input.req) {
    await logAudit(input.req, {
      targetType: 'USER_COUPON',
      targetId: isBatch ? 'batch' : coupons[0].id,
      targetDesc: isBatch ? `批量赠送优惠券 - ${users.length} 人` : `${users[0].name || users[0].phone || users[0].id} - 优惠券赠送`,
      action: 'POST',
      actionName: isBatch ? '批量赠送优惠券' : '赠送优惠券',
      beforeValue,
      afterValue,
      reason: `${isBatch ? '批量' : ''}赠送优惠券「${input.name}」，原因：${reasonLabel}${input.remark ? '（' + input.remark + '）' : ''}`,
    })
  }

  return {
    beforeValue,
    afterValue,
    amount: 0,
    data: isBatch ? { userIds: input.userIds, name: input.name, type: input.type, count: users.length } : coupons[0],
  }
}

export async function executeMemberGiftApproval(payload: MemberGiftApprovalPayload, req: AuthenticatedRequest) {
  const operatorId = req.user?.id || ''
  if (payload.mode === 'SINGLE_POINTS' || payload.mode === 'BATCH_POINTS') {
    return executeGiftPoints({ ...payload, operatorId, req })
  }
  if (payload.mode === 'SINGLE_COUPON' || payload.mode === 'BATCH_COUPON') {
    return executeGiftCoupon({ ...payload, req })
  }
  throw new Error('不支持的会员赠送审批类型')
}
