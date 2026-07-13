import { prisma } from '../utils/prisma'
import { addDays } from 'date-fns'
import { evaluateCampaignRewardEligibility, type CampaignUserScope } from '../domain/campaignRewardEligibility'

/* ─── Types ─── */
export interface TriggerContext {
  event: string
  source: 'REALTIME' | 'CRON' | 'MANUAL'
  runOnce?: boolean
  payload?: any
}

export interface ExecutionResult {
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED'
  reason?: string
  reward?: any
}

export function shouldBlockExistingCampaignIssue(runOnce: boolean | undefined, existingLog: unknown): boolean {
  return runOnce !== false && Boolean(existingLog)
}

/* ─── 1. 核心发放引擎（事务保护） ─── */
export async function executeCampaign(
  campaignId: string,
  userId: string,
  context: TriggerContext
): Promise<ExecutionResult> {
  return await prisma.$transaction(
    async (tx) => {
      // 1. 查询活动（事务内读取）
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
        include: { rewards: true },
      })

      // 2. 前置状态检查
      if (!campaign || campaign.deleted) {
        return { status: 'FAILED', reason: 'CAMPAIGN_NOT_FOUND' }
      }
      if (campaign.status !== 'RUNNING') {
        return { status: 'SKIPPED', reason: 'CAMPAIGN_NOT_RUNNING' }
      }
      const now = new Date()
      if (campaign.startAt && now < campaign.startAt) {
        return { status: 'SKIPPED', reason: 'NOT_STARTED' }
      }
      if (campaign.endAt && now > campaign.endAt) {
        return { status: 'SKIPPED', reason: 'ALREADY_ENDED' }
      }

      // 3. 预算检查（预算耗尽自动暂停）
      if (campaign.budget && campaign.budget > 0) {
        const totalCost = calculateCampaignCost(campaign.rewards)
        if (campaign.spent + totalCost > campaign.budget) {
          if (campaign.autoPauseOnBudgetExhausted) {
            await tx.campaign.update({
              where: { id: campaignId },
              data: { status: 'PAUSED' },
            })
          }
          return { status: 'SKIPPED', reason: 'BUDGET_EXHAUSTED' }
        }
      }

      // 4. 人群定向检查
      if (campaign.targetTags && campaign.targetTags.length > 0) {
        const userTags = await tx.userTag.findMany({
          where: { userId, tag: { in: campaign.targetTags } },
        })
        if (userTags.length === 0) {
          return { status: 'SKIPPED', reason: 'TAG_MISMATCH' }
        }
      }
      if (campaign.excludeTags && campaign.excludeTags.length > 0) {
        const excluded = await tx.userTag.findFirst({
          where: { userId, tag: { in: campaign.excludeTags } },
        })
        if (excluded) {
          return { status: 'SKIPPED', reason: 'TAG_EXCLUDED' }
        }
      }

      // 5. 单用户参与上限（通过 CampaignExecutionLog 检查）
      const existingLog = await tx.campaignExecutionLog.findFirst({
        where: { campaignId, userId, status: 'SUCCESS' },
      })
      if (shouldBlockExistingCampaignIssue(context.runOnce, existingLog)) {
        return { status: 'SKIPPED', reason: 'ALREADY_ISSUED' }
      }

      // 6. 活动互斥检查
      if (campaign.exclusiveWith && campaign.exclusiveWith.length > 0) {
        const exclusiveLog = await tx.campaignExecutionLog.findFirst({
          where: {
            userId,
            campaignId: { in: campaign.exclusiveWith },
            status: 'SUCCESS',
            usedAt: { not: null },
          },
        })
        if (exclusiveLog) {
          return { status: 'SKIPPED', reason: 'EXCLUSIVE_BLOCKED' }
        }
      }

      // 7. 发放上限检查
      const reward = campaign.rewards[0]
      if (!reward) {
        return { status: 'FAILED', reason: 'NO_REWARD' }
      }

      const userScope: CampaignUserScope = campaign.targetTags.includes('VIP')
        ? 'PAID'
        : campaign.excludeTags.includes('VIP') ? 'NORMAL' : 'ALL'
      const isVip = Boolean(await tx.userTag.findFirst({ where: { userId, tag: 'VIP' }, select: { id: true } }))
      const order = context.payload?.orderId
        ? await tx.order.findUnique({
            where: { id: context.payload.orderId },
            include: { booking: true },
          })
        : null
      const completedOrderCount = order
        ? await tx.order.count({ where: { userId, status: 'COMPLETED', orderKind: 'NORMAL' } })
        : undefined
      const bookingDate = order?.booking?.date
      const eligibility = evaluateCampaignRewardEligibility({
        userScope,
        validFrom: reward.validFrom,
        validTo: reward.validTo,
        minOrderAmount: reward.minOrderAmount,
        applicableVenues: reward.applicableVenues,
        applicableGames: reward.applicableGames,
        applicableWeekdays: reward.applicableWeekdays,
        applicableStartTime: reward.applicableStartTime,
        applicableEndTime: reward.applicableEndTime,
        minPeople: reward.minPeople,
        firstOrderOnly: reward.firstOrderOnly,
        minCompletedOrders: reward.minCompletedOrders,
      }, {
        isVip,
        now,
        amount: order?.amount ?? context.payload?.amount,
        venueId: order?.venueId ?? order?.booking?.venueId ?? context.payload?.venueId,
        gameId: order?.booking?.gameId ?? context.payload?.gameId,
        weekday: bookingDate ? bookingDate.getUTCDay() : context.payload?.weekday,
        startTime: order?.booking?.startTime ?? context.payload?.startTime,
        personCount: order?.booking?.personCount ?? context.payload?.personCount,
        completedOrderCount,
      })
      if (!eligibility.eligible) {
        await tx.campaignExecutionLog.create({
          data: {
            campaignId,
            userId,
            triggerEvent: context.event,
            triggerSource: context.source,
            triggerPayload: context.payload || {},
            status: 'SKIPPED',
            reason: eligibility.reason,
            rewardType: reward.rewardType,
          },
        })
        return { status: 'SKIPPED', reason: eligibility.reason }
      }
      if (reward.maxQuantity > 0 && reward.issuedCount >= reward.maxQuantity) {
        return { status: 'SKIPPED', reason: 'MAX_REACHED' }
      }

      // 8. 执行发放
      await distributeRewardTx(tx, campaignId, reward, userId, `活动:${campaign.name}`, context)

      // 9. 计算并更新成本
      const costPoints = reward.rewardType === 'POINTS' ? reward.pointsAmount || 0 : 0
      const costCoupon = calculateCouponCost(reward)
      const totalCost = costPoints + costCoupon

      await tx.campaign.update({
        where: { id: campaignId },
        data: { spent: { increment: totalCost } },
      })

      // 10. 记录执行日志
      await tx.campaignExecutionLog.create({
        data: {
          campaignId,
          userId,
          triggerEvent: context.event,
          triggerSource: context.source,
          triggerPayload: context.payload || {},
          status: 'SUCCESS',
          rewardType: reward.rewardType,
          rewardValue: reward.pointsAmount || reward.couponDiscountRate || 0,
          rewardCouponName: reward.couponName,
          costPoints,
          costCoupon,
        },
      })

      return { status: 'SUCCESS', reward }
    },
    {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 10000,
    }
  )
}

/* ─── 2. 事务内发放逻辑 ─── */
async function distributeRewardTx(
  tx: any,
  campaignId: string,
  reward: any,
  userId: string,
  reason: string,
  context: TriggerContext
) {
  const now = new Date()

  if (reward.rewardType === 'POINTS') {
    await tx.user.update({
      where: { id: userId },
      data: { points: { increment: reward.pointsAmount || 0 } },
    })
    await tx.balanceTransaction.create({
      data: {
        userId,
        type: 'POINTS_GIFT',
        amount: 0,
        pointsAmount: reward.pointsAmount || 0,
        principalAmount: 0,
        bonusAmount: 0,
        totalAmount: 0,
        remark: reason,
      },
    })
  } else if (reward.rewardType === 'DISCOUNT_COUPON') {
    await tx.userCoupon.create({
      data: {
        userId,
        name: reward.couponName || '折扣券',
        type: 'DISCOUNT',
        discountRate: reward.couponDiscountRate || null,
        status: 'UNUSED',
        validFrom: reward.validFrom || now,
        validTo: reward.validTo || addDays(now, reward.couponValidDays || 7),
        source: 'CAMPAIGN',
        giftReason: reason,
      },
    })
  } else if (reward.rewardType === 'EXPERIENCE_COUPON') {
    await tx.userCoupon.create({
      data: {
        userId,
        name: reward.couponName || '体验券',
        type: 'EXPERIENCE_FREE',
        status: 'UNUSED',
        validFrom: reward.validFrom || now,
        validTo: reward.validTo || addDays(now, reward.couponValidDays || 7),
        source: 'CAMPAIGN',
        giftReason: reason,
      },
    })
  }

  // 更新追踪记录（兼容旧表）
  await tx.campaignTrack.create({
    data: {
      campaignId,
      userId,
      step: 'ISSUED',
      orderId: context.payload?.orderId || null,
      amount: reward.pointsAmount || 0,
    },
  })

  // 更新已发放计数
  await tx.campaignReward.update({
    where: { id: reward.id },
    data: { issuedCount: { increment: 1 } },
  })
}

/* ─── 3. 券使用钩子（C端联动） ─── */
export async function onCouponUsed(
  userCouponId: string,
  orderId: string,
  orderAmount: number
) {
  const userCoupon = await prisma.userCoupon.findUnique({
    where: { id: userCouponId },
  })
  if (!userCoupon || userCoupon.source !== 'CAMPAIGN') return

  // 找到关联的执行日志
  const log = await prisma.campaignExecutionLog.findFirst({
    where: {
      userId: userCoupon.userId,
      rewardCouponName: userCoupon.name,
      usedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!log) return

  // 查询订单实际金额，用于修正活动消耗
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { originalAmount: true, couponDiscount: true },
  })

  // 根据券类型计算真实成本：
  // 体验券 = 票价（originalAmount）
  // 折扣券 = 实际折扣金额（couponDiscount）
  const realCost =
    log.rewardType === 'EXPERIENCE_COUPON'
      ? (order?.originalAmount || orderAmount)
      : (log.rewardType === 'DISCOUNT_COUPON'
          ? (order?.couponDiscount || 0)
          : 0)

  // 修正 campaign.spent：把原来的估算成本换成真实成本
  const estimatedCost = log.costCoupon || 0
  const spentAdjustment = realCost - estimatedCost

  const txOps: any[] = [
    prisma.campaignExecutionLog.update({
      where: { id: log.id },
      data: {
        usedAt: new Date(),
        usedOrderId: orderId,
        usedAmount: realCost,
        costCoupon: realCost,
        gmvGenerated: realCost,
      },
    }),
    prisma.campaignReward.updateMany({
      where: { campaignId: log.campaignId, couponName: userCoupon.name },
      data: { usedCount: { increment: 1 } },
    }),
  ]

  if (spentAdjustment !== 0) {
    txOps.push(
      prisma.campaign.update({
        where: { id: log.campaignId },
        data: { spent: { increment: spentAdjustment } },
      })
    )
  }

  await prisma.$transaction(txOps)
}

/* ─── 4. 旧接口兼容（将被逐步淘汰） ─── */

/**
 * 查询所有运行中的 AUTO_GIFT 活动，给指定用户发放奖励
 * 在用户注册成功时调用
 */
export async function distributeAutoGifts(userId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: 'RUNNING',
      type: 'AUTO_GIFT',
      startAt: { lte: new Date() },
      endAt: { gte: new Date() },
    },
    include: { rewards: true },
  })

  for (const campaign of campaigns) {
    for (const reward of campaign.rewards) {
      await executeCampaign(campaign.id, userId, {
        event: 'AUTO_GIFT',
        source: 'REALTIME',
      })
    }
  }
}

/**
 * 触发器规则关联发放（被 executeCampaign 替代，保留兼容）
 */
export async function distributeCampaignByRule(
  campaignId: string,
  userId: string,
  orderId?: string
) {
  return executeCampaign(campaignId, userId, {
    event: 'TRIGGER_RULE',
    source: 'REALTIME',
    payload: { orderId },
  })
}

/**
 * 手动发放：给指定手机号列表发放某个活动的奖励
 * @deprecated 手动发放功能已移除，保留函数供外部兼容
 */
export async function distributeManualCampaign(
  campaignId: string,
  phones: string[],
  operatorId: string
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { rewards: true },
  })
  if (!campaign) throw new Error('活动不存在')
  if (campaign.status !== 'RUNNING') throw new Error('活动未运行')

  const users = await prisma.user.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true },
  })
  const phoneMap = new Map(users.map((u: any) => [u.phone, u.id]))
  const notFound = phones.filter((p: any) => !phoneMap.has(p))

  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    notFound,
    errors: [] as string[],
  }

  for (const userId of users.map((u: any) => u.id)) {
    try {
      const result = await executeCampaign(campaignId, userId, {
        event: 'MANUAL_DISTRIBUTE',
        source: 'MANUAL',
      })
      if (result.status === 'SUCCESS') results.success++
      else results.skipped++
    } catch (err: any) {
      results.failed++
      results.errors.push(`用户${userId}: ${err.message}`)
    }
  }

  return results
}

/* ─── 5. 辅助函数 ─── */

function calculateCampaignCost(rewards: any[]): number {
  return rewards.reduce((sum, r) => {
    if (r.rewardType === 'POINTS') return sum + (r.pointsAmount || 0)
    return sum + calculateCouponCost(r)
  }, 0)
}

function calculateCouponCost(reward: any): number {
  if (reward.rewardType === 'DISCOUNT_COUPON') {
    // 估算：假设平均订单 200 元，折扣券成本 = 20000 * (100 - discountRate) / 100
    const avgOrder = 20000
    return Math.round(avgOrder * (100 - (reward.couponDiscountRate || 100)) / 100)
  }
  if (reward.rewardType === 'EXPERIENCE_COUPON') {
    // 估算：体验券固定成本 80 元
    return 8000
  }
  return 0
}
