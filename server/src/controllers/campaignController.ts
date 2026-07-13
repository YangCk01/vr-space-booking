import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { addDays } from 'date-fns'
import { distributeManualCampaign } from '../services/campaignRewardService'
import {
  mapCampaignRewardRecord,
  normalizeRewardType,
  parseRewardRecordFilters,
} from '../domain/campaignRewardRecords'

function rewardEligibilityData(input: any) {
  return {
    minOrderAmount: input.minOrderAmount ? parseInt(input.minOrderAmount) : null,
    applicableVenues: Array.isArray(input.applicableVenues) ? input.applicableVenues : [],
    applicableGames: Array.isArray(input.applicableGames) ? input.applicableGames : [],
    applicableWeekdays: Array.isArray(input.applicableWeekdays) ? input.applicableWeekdays.map(Number) : [],
    applicableStartTime: input.applicableStartTime || null,
    applicableEndTime: input.applicableEndTime || null,
    minPeople: input.minPeople ? parseInt(input.minPeople) : null,
    firstOrderOnly: input.firstOrderOnly === true,
    minCompletedOrders: input.minCompletedOrders ? parseInt(input.minCompletedOrders) : null,
    validFrom: input.validFrom ? new Date(input.validFrom) : null,
    validTo: input.validTo ? new Date(input.validTo) : null,
  }
}

function validateRewardInput(input: any, event?: string): string | null {
  const hasOrderConditions = Boolean(
    input.minOrderAmount || input.minPeople || input.firstOrderOnly || input.minCompletedOrders
    || input.applicableStartTime || input.applicableEndTime
    || input.applicableVenues?.length || input.applicableGames?.length || input.applicableWeekdays?.length,
  )
  if (hasOrderConditions && event !== 'ORDER_COMPLETED') return '使用门槛仅适用于订单完成触发场景'
  if ((input.applicableStartTime && !input.applicableEndTime) || (!input.applicableStartTime && input.applicableEndTime)) {
    return '体验时段必须同时设置开始和结束时间'
  }
  if (!input.validFrom || !input.validTo) return '奖励必须设置生效时间段'
  if (new Date(input.validFrom) >= new Date(input.validTo)) return '奖励失效时间必须晚于生效时间'
  return null
}

/* ─── Helpers ─── */
function getCampaignStatus(startAt: Date | null, endAt: Date | null, status: string): string {
  if (status === 'ENDED' || status === 'PAUSED') return status
  if (!startAt || !endAt) return status
  const now = new Date()
  if (now < startAt) return 'DRAFT'
  if (now > endAt) return 'ENDED'
  return 'RUNNING'
}

/* ─── 1. 创建活动 ─── */
export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      name,
      type,
      startAt,
      endAt,
      budget,
      rewards,
      triggerRule,
      // 新增字段
      targetTags,
      excludeTags,
      priority,
      exclusiveWith,
      maxPerUserTotal,
      channel,
      targetType,
      targetValue,
      autoPauseOnBudgetExhausted,
      autoEndOnExpire,
    } = req.body

    if (!name || !type) {
      return error(res, '活动名称和类型必填', 400)
    }

    const typeMap: Record<string, string> = {
      AUTO: 'AUTO_GIFT',
      MANUAL: 'MANUAL_GIFT',
      TRIGGER: 'CONDITIONAL',
    }
    const dbType = typeMap[type] || type
    const isConditional = dbType === 'CONDITIONAL'

    if (isConditional) {
      if (!triggerRule || !triggerRule.event) {
        return error(res, '条件触发活动需要配置触发规则', 400)
      }
      if (!triggerRule.actions || !Array.isArray(triggerRule.actions) || triggerRule.actions.length === 0) {
        return error(res, '请至少配置一个执行动作', 400)
      }
    } else {
      if (!Array.isArray(rewards) || rewards.length === 0) {
        return error(res, '请至少配置一个奖励', 400)
      }
    }

    // 构建 reward 数据
    let rewardData: any[] = []
    if (isConditional && triggerRule) {
      const action = triggerRule.actions[0]
      const validationError = validateRewardInput(action, triggerRule.event)
      if (validationError) return error(res, validationError, 400)
      const maxQty = triggerRule.maxQuantity ? parseInt(triggerRule.maxQuantity) : 999999
      if (action.type === 'GIFT_POINTS') {
        rewardData = [{
          rewardType: 'POINTS',
          pointsAmount: action.points ? parseInt(action.points) : 0,
          ...rewardEligibilityData(action),
          maxQuantity: maxQty,
        }]
      } else if (action.type === 'GIFT_COUPON') {
        rewardData = [{
          rewardType: action.couponType === 'EXPERIENCE' ? 'EXPERIENCE_COUPON' : 'DISCOUNT_COUPON',
          couponName: action.name || '优惠券',
          couponDiscountRate: action.discountRate ? parseInt(action.discountRate) : null,
          couponValidDays: action.validityDays ? parseInt(action.validityDays) : null,
          ...rewardEligibilityData(action),
          maxQuantity: maxQty,
        }]
      } else if (action.type === 'GIFT_EXPERIENCE_COUPON') {
        rewardData = [{
          rewardType: 'EXPERIENCE_COUPON',
          couponName: action.name || '体验券',
          couponValidDays: action.validityDays ? parseInt(action.validityDays) : null,
          ...rewardEligibilityData(action),
          maxQuantity: maxQty,
        }]
      }
    } else if (rewards) {
      rewardData = rewards.map((r: any) => ({
        rewardType: r.rewardType,
        pointsAmount: r.pointsAmount ? parseInt(r.pointsAmount) : null,
        couponName: r.couponName || null,
        couponDiscountRate: r.couponDiscountRate ? parseInt(r.couponDiscountRate) : null,
        couponValidDays: r.couponValidDays ? parseInt(r.couponValidDays) : null,
        ...rewardEligibilityData(r),
        maxQuantity: r.maxQuantity ? parseInt(r.maxQuantity) : 0,
      }))
    }

    const campaignData: any = {
      name,
      type: dbType,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      budget: budget ? parseInt(budget) : null,
      createdBy: req.user?.id || '',
      status: 'DRAFT',
      rewards: { create: rewardData },
      // 新增字段
      targetTags: targetTags || [],
      excludeTags: excludeTags || [],
      priority: priority !== undefined ? parseInt(priority) : 0,
      exclusiveWith: exclusiveWith || [],
      maxPerUserTotal: maxPerUserTotal ? parseInt(maxPerUserTotal) : null,
      channel: channel || null,
      targetType: targetType || null,
      targetValue: targetValue ? parseInt(targetValue) : null,
      autoPauseOnBudgetExhausted: autoPauseOnBudgetExhausted !== false,
      autoEndOnExpire: autoEndOnExpire !== false,
    }

    const result = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: campaignData,
        include: { rewards: true },
      })

      if (isConditional && triggerRule) {
        await tx.triggerRule.create({
          data: {
            name: triggerRule.name || name,
            event: triggerRule.event,
            conditions: triggerRule.conditions || {},
            actions: triggerRule.actions,
            runOnce: triggerRule.runOnce !== false,
            campaignId: campaign.id,
          },
        })
      }

      return campaign
    })

    return success(res, result, '活动创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 2. 活动列表 ─── */
export async function list(req: Request, res: Response) {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const statusFilter = (req.query.status as string) || 'all'

    const where: any = { deleted: false }
    if (statusFilter && statusFilter !== 'all') {
      where.status = statusFilter.toUpperCase()
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          rewards: true,
          _count: { select: { tracks: true } },
        },
      }),
      prisma.campaign.count({ where }),
    ])

    // 查询条件触发活动关联的 triggerRule
    const campaignIds = campaigns.filter(c => c.type === 'CONDITIONAL').map(c => c.id)
    let triggerRules: any[] = []
    if (campaignIds.length > 0) {
      triggerRules = await prisma.triggerRule.findMany({
        where: { campaignId: { in: campaignIds } },
      })
    }
    const ruleMap = new Map(triggerRules.map(r => [r.campaignId, r]))

    // 批量查询效果统计
    const ids = campaigns.map(c => c.id)
    const [successLogs, usedLogs, gmvAgg] = await Promise.all([
      prisma.campaignExecutionLog.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: ids }, status: 'SUCCESS' },
        _count: { id: true },
      }),
      prisma.campaignExecutionLog.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: ids }, status: 'SUCCESS', usedAt: { not: null } },
        _count: { id: true },
      }),
      prisma.campaignExecutionLog.aggregate({
        where: { campaignId: { in: ids }, status: 'SUCCESS' },
        _sum: { gmvGenerated: true, costPoints: true, costCoupon: true },
      }),
    ])

    const successMap = new Map(successLogs.map(s => [s.campaignId, s._count.id]))
    const usedMap = new Map(usedLogs.map(u => [u.campaignId, u._count.id]))

    const data = campaigns.map((c) => ({
      ...c,
      computedStatus: getCampaignStatus(c.startAt, c.endAt, c.status),
      trackCount: c._count.tracks,
      triggerRule: ruleMap.get(c.id) || null,
      effectPreview: {
        issuedCount: successMap.get(c.id) || 0,
        usedCount: usedMap.get(c.id) || 0,
      },
    }))

    return paginated(res, data, page, pageSize, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 3. 活动详情 ─── */
export async function getById(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { rewards: true },
    })
    if (!campaign) return error(res, '活动不存在', 404)

    let triggerRule = null
    if (campaign.type === 'CONDITIONAL') {
      triggerRule = await prisma.triggerRule.findFirst({
        where: { campaignId: id },
      })
    }

    return success(res, {
      ...campaign,
      computedStatus: getCampaignStatus(campaign.startAt, campaign.endAt, campaign.status),
      triggerRule,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 4. 活动统计（兼容旧接口） ─── */
export async function stats(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { rewards: true },
    })
    if (!campaign) return error(res, '活动不存在', 404)

    const [issued, used, orderCompleted] = await Promise.all([
      prisma.campaignTrack.count({ where: { campaignId: id, step: 'ISSUED' } }),
      prisma.campaignTrack.count({ where: { campaignId: id, step: 'USED' } }),
      prisma.campaignTrack.count({ where: { campaignId: id, step: 'ORDER_COMPLETED' } }),
    ])

    const revenueAgg = await prisma.campaignTrack.aggregate({
      where: { campaignId: id, amount: { not: null } },
      _sum: { amount: true },
    })

    const totalRevenue = revenueAgg._sum.amount || 0
    const roi = campaign.spent > 0 ? Number(((totalRevenue - campaign.spent) / campaign.spent).toFixed(2)) : 0

    return success(res, {
      campaignId: id,
      issuedCount: issued,
      usedCount: used,
      orderCompletedCount: orderCompleted,
      totalRevenue,
      spent: campaign.spent,
      budget: campaign.budget,
      roi,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 5. 效果分析（新增） ─── */
export async function effects(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const days = parseInt((req.query.days as string) || '7', 10)

    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return error(res, '活动不存在', 404)

    const since = new Date()
    since.setDate(since.getDate() - days)

    // 发放漏斗
    const [
      totalTriggered,
      totalSuccess,
      totalUsed,
      totalConverted,
    ] = await Promise.all([
      prisma.campaignExecutionLog.count({ where: { campaignId: id } }),
      prisma.campaignExecutionLog.count({ where: { campaignId: id, status: 'SUCCESS' } }),
      prisma.campaignExecutionLog.count({ where: { campaignId: id, status: 'SUCCESS', usedAt: { not: null } } }),
      prisma.campaignExecutionLog.count({ where: { campaignId: id, status: 'SUCCESS', gmvGenerated: { gt: 0 } } }),
    ])

    // GMV 与成本
    const gmvAgg = await prisma.campaignExecutionLog.aggregate({
      where: { campaignId: id, status: 'SUCCESS' },
      _sum: { gmvGenerated: true, costPoints: true, costCoupon: true },
    })

    const gmv = gmvAgg._sum.gmvGenerated || 0
    const cost = (gmvAgg._sum.costPoints || 0) + (gmvAgg._sum.costCoupon || 0)
    const roi = cost > 0 ? Number(((gmv - cost) / cost).toFixed(2)) : 0

    // 跳过分层
    const skipReasons = await prisma.campaignExecutionLog.groupBy({
      by: ['reason'],
      where: { campaignId: id, status: 'SKIPPED' },
      _count: { reason: true },
    })

    // 每日趋势
    const dailyTrend = await prisma.campaignExecutionLog.findMany({
      where: {
        campaignId: id,
        status: 'SUCCESS',
        createdAt: { gte: since },
      },
      select: { createdAt: true, gmvGenerated: true },
      orderBy: { createdAt: 'asc' },
    })

    // 按日聚合
    const trendMap = new Map<string, { issued: number; gmv: number }>()
    for (const row of dailyTrend) {
      const date = row.createdAt.toISOString().split('T')[0]
      const existing = trendMap.get(date) || { issued: 0, gmv: 0 }
      existing.issued++
      existing.gmv += row.gmvGenerated || 0
      trendMap.set(date, existing)
    }
    const dailyTrendData = Array.from(trendMap.entries()).map(([date, v]) => ({
      date,
      issued: v.issued,
      gmv: v.gmv,
    }))

    return success(res, {
      funnel: {
        totalTriggered,
        totalSuccess,
        totalUsed,
        totalConverted,
        successRate: totalTriggered > 0 ? Number((totalSuccess / totalTriggered).toFixed(2)) : 0,
        useRate: totalSuccess > 0 ? Number((totalUsed / totalSuccess).toFixed(2)) : 0,
        conversionRate: totalUsed > 0 ? Number((totalConverted / totalUsed).toFixed(2)) : 0,
      },
      gmv,
      cost,
      roi,
      skipReasons: skipReasons.map(s => ({ reason: s.reason, count: s._count.reason })),
      dailyTrend: dailyTrendData,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 6. 暂停活动 ─── */
export async function pause(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return error(res, '活动不存在', 404)
    if (campaign.status !== 'RUNNING') return error(res, '只有运行中的活动可以暂停', 400)

    const updated = await prisma.$transaction(async (tx) => {
      const paused = await tx.campaign.update({
        where: { id },
        data: { status: 'PAUSED' },
      })
      if (campaign.type === 'CONDITIONAL') {
        await tx.triggerRule.updateMany({
          where: { campaignId: id },
          data: { enabled: false },
        })
      }
      return paused
    })
    return success(res, updated, '活动已暂停')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 7. 结束活动 ─── */
export async function end(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return error(res, '活动不存在', 404)
    if (campaign.status === 'ENDED') return error(res, '活动已结束', 400)

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: 'ENDED', endAt: new Date() },
    })
    return success(res, updated, '活动已结束')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 8. 激活草稿/暂停活动 ─── */
export async function activate(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return error(res, '活动不存在', 404)
    if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
      return error(res, '只有草稿或暂停状态的活动可以激活', 400)
    }

    const now = new Date()
    const startAt = campaign.startAt || now
    const endAt = campaign.endAt || addDays(now, 7)

    const updated = await prisma.$transaction(async (tx) => {
      const activated = await tx.campaign.update({
        where: { id },
        data: { status: 'RUNNING', startAt, endAt },
      })
      if (campaign.type === 'CONDITIONAL') {
        await tx.triggerRule.updateMany({
          where: { campaignId: id },
          data: { enabled: true },
        })
      }
      return activated
    })
    return success(res, updated, '活动已激活')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 9. 手动发放奖励 ─── */
export async function distribute(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { phones } = req.body
    if (!Array.isArray(phones) || phones.length === 0) {
      return error(res, '请输入要发放的手机号', 400)
    }
    if (phones.length > 100) {
      return error(res, '单次最多发放100人', 400)
    }

    const result = await distributeManualCampaign(id, phones, req.user?.id || '')
    let msg = `发放完成：成功${result.success}人，跳过${result.skipped}人，失败${result.failed}人`
    if (result.notFound && result.notFound.length > 0) {
      msg += `，未找到${result.notFound.length}人（${result.notFound.join(', ')}）`
    }
    return success(res, result, msg)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 10. 删除活动（软删除） ─── */
export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return error(res, '活动不存在', 404)
    if (campaign.status !== 'ENDED' && campaign.status !== 'DRAFT') {
      return error(res, '只有草稿或已结束的活动可以删除', 400)
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { deleted: true },
    })
    return success(res, updated, '活动已删除')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 11. 编辑活动 ─── */
export async function update(req: AuthenticatedRequest, res: Response) {
  let updateData: any = {}
  try {
    const id = req.params.id as string
    const {
      name,
      startAt,
      endAt,
      budget,
      triggerRule,
      // 新增字段
      targetTags,
      excludeTags,
      priority,
      exclusiveWith,
      maxPerUserTotal,
      channel,
      targetType,
      targetValue,
      autoPauseOnBudgetExhausted,
      autoEndOnExpire,
    } = req.body

    const campaign = await prisma.campaign.findUnique({ where: { id }, include: { rewards: true } })
    if (!campaign) return error(res, '活动不存在', 404)
    if (campaign.status !== 'PAUSED' && campaign.status !== 'DRAFT') {
      return error(res, '只有暂停或草稿状态的活动可以编辑', 400)
    }

    updateData = {
      ...(name && { name: name.trim() }),
      ...(startAt !== undefined && { startAt: startAt ? new Date(startAt) : null }),
      ...(endAt !== undefined && { endAt: endAt ? new Date(endAt) : null }),
      ...(budget !== undefined && { budget: budget ? parseInt(budget) : null }),
      // 新增字段
      ...(targetTags !== undefined && { targetTags: targetTags || [] }),
      ...(excludeTags !== undefined && { excludeTags: excludeTags || [] }),
      ...(priority !== undefined && { priority: parseInt(priority) || 0 }),
      ...(exclusiveWith !== undefined && { exclusiveWith: exclusiveWith || [] }),
      ...(maxPerUserTotal !== undefined && { maxPerUserTotal: maxPerUserTotal ? parseInt(maxPerUserTotal) : null }),
      ...(channel !== undefined && { channel: channel || null }),
      ...(targetType !== undefined && { targetType: targetType || null }),
      ...(targetValue !== undefined && { targetValue: targetValue ? parseInt(targetValue) : null }),
      ...(autoPauseOnBudgetExhausted !== undefined && { autoPauseOnBudgetExhausted }),
      ...(autoEndOnExpire !== undefined && { autoEndOnExpire }),
    }

    // 同步更新 CampaignReward（如果 triggerRule.actions 有变更）
    if (triggerRule?.actions && campaign.rewards.length > 0) {
      const action = triggerRule.actions[0]
      const validationError = validateRewardInput(action, triggerRule.event)
      if (validationError) return error(res, validationError, 400)
      const reward = campaign.rewards[0]
      const rewardUpdate: any = {}
      if (action.type === 'GIFT_POINTS') {
        rewardUpdate.rewardType = 'POINTS'
        rewardUpdate.pointsAmount = action.points ? parseInt(action.points) : 0
        rewardUpdate.couponName = null
        rewardUpdate.couponDiscountRate = null
        rewardUpdate.couponValidDays = null
        Object.assign(rewardUpdate, rewardEligibilityData(action))
      } else if (action.type === 'GIFT_COUPON') {
        rewardUpdate.rewardType = action.couponType === 'EXPERIENCE' ? 'EXPERIENCE_COUPON' : 'DISCOUNT_COUPON'
        rewardUpdate.couponName = action.name || '优惠券'
        rewardUpdate.couponDiscountRate = action.discountRate ? parseInt(action.discountRate) : null
        rewardUpdate.couponValidDays = action.validityDays ? parseInt(action.validityDays) : null
        Object.assign(rewardUpdate, rewardEligibilityData(action))
        rewardUpdate.pointsAmount = null
      } else if (action.type === 'GIFT_EXPERIENCE_COUPON') {
        rewardUpdate.rewardType = 'EXPERIENCE_COUPON'
        rewardUpdate.couponName = action.name || '体验券'
        rewardUpdate.couponValidDays = action.validityDays ? parseInt(action.validityDays) : null
        Object.assign(rewardUpdate, rewardEligibilityData(action))
        rewardUpdate.pointsAmount = null
        rewardUpdate.couponDiscountRate = null
      }
      if (triggerRule.maxQuantity !== undefined) {
        rewardUpdate.maxQuantity = triggerRule.maxQuantity ? parseInt(triggerRule.maxQuantity) : 999999
      }
      if (Object.keys(rewardUpdate).length > 0) {
        await prisma.campaignReward.update({ where: { id: reward.id }, data: rewardUpdate })
      }
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: updateData,
      include: { rewards: true },
    })

    if (triggerRule && campaign.type === 'CONDITIONAL') {
      const existingRule = await prisma.triggerRule.findFirst({ where: { campaignId: id } })
      if (existingRule) {
        const ruleUpdate: any = {}
        if (triggerRule.event) ruleUpdate.event = triggerRule.event
        if (triggerRule.conditions !== undefined) ruleUpdate.conditions = triggerRule.conditions
        if (triggerRule.actions !== undefined) ruleUpdate.actions = triggerRule.actions
        if (triggerRule.runOnce !== undefined) ruleUpdate.runOnce = triggerRule.runOnce
        ruleUpdate.enabled = false
        if (Object.keys(ruleUpdate).length > 0) {
          await prisma.triggerRule.update({ where: { id: existingRule.id }, data: ruleUpdate })
        }
      }
    }

    return success(res, updated, '活动更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 12. 复制活动 ─── */
export async function clone(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const original = await prisma.campaign.findUnique({
      where: { id },
      include: { rewards: true },
    })
    if (!original) return error(res, '活动不存在', 404)

    const result = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: `${original.name}（副本）`,
          type: original.type,
          status: 'DRAFT',
          startAt: null,
          endAt: null,
          budget: original.budget,
          spent: 0,
          deleted: false,
          createdBy: req.user?.id || '',
          targetTags: original.targetTags,
          excludeTags: original.excludeTags,
          priority: original.priority,
          exclusiveWith: original.exclusiveWith,
          maxPerUserTotal: original.maxPerUserTotal,
          channel: original.channel,
          targetType: original.targetType,
          targetValue: original.targetValue,
          autoPauseOnBudgetExhausted: original.autoPauseOnBudgetExhausted,
          autoEndOnExpire: original.autoEndOnExpire,
          rewards: {
            create: original.rewards.map((r: any) => ({
              rewardType: r.rewardType,
              pointsAmount: r.pointsAmount,
              couponName: r.couponName,
              couponDiscountRate: r.couponDiscountRate,
              couponValidDays: r.couponValidDays,
              validFrom: r.validFrom,
              validTo: r.validTo,
              maxQuantity: r.maxQuantity,
              minOrderAmount: r.minOrderAmount,
              applicableVenues: r.applicableVenues,
              applicableGames: r.applicableGames,
              applicableWeekdays: r.applicableWeekdays,
              applicableStartTime: r.applicableStartTime,
              applicableEndTime: r.applicableEndTime,
              minPeople: r.minPeople,
              firstOrderOnly: r.firstOrderOnly,
              minCompletedOrders: r.minCompletedOrders,
            })),
          },
        },
        include: { rewards: true },
      })

      // 复制关联的 TriggerRule
      const existingRule = await tx.triggerRule.findFirst({ where: { campaignId: id } })
      if (existingRule) {
        await tx.triggerRule.create({
          data: {
            name: existingRule.name,
            event: existingRule.event,
            conditions: existingRule.conditions as any,
            actions: existingRule.actions as any,
            runOnce: existingRule.runOnce,
            enabled: existingRule.enabled,
            campaignId: campaign.id,
          },
        })
      }

      return campaign
    })

    return success(res, result, '活动复制成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 13. 发放记录（兼容旧 CampaignTrack） ─── */
export async function tracks(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)

    const [data, total] = await Promise.all([
      prisma.campaignTrack.findMany({
        where: { campaignId: id },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.campaignTrack.count({ where: { campaignId: id } }),
    ])

    return paginated(res, data, page, pageSize, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

function rewardTypeValues(type: string): string[] {
  if (type === 'POINTS') return ['POINTS', 'GIFT_POINTS']
  if (type === 'EXPERIENCE_COUPON') return ['EXPERIENCE', 'EXPERIENCE_COUPON', 'GIFT_EXPERIENCE_COUPON']
  return ['COUPON', 'GIFT_COUPON']
}

async function queryRewardRecords(query: Record<string, unknown>, fixedCampaignId?: string) {
  const filters = parseRewardRecordFilters({ ...query, campaignId: fixedCampaignId || query.campaignId })
  const where: any = {}

  if (filters.campaignId) where.campaignId = filters.campaignId
  if (filters.rewardType) where.rewardType = { in: rewardTypeValues(filters.rewardType) }
  if (filters.userKeyword) {
    where.user = {
      OR: [
        { name: { contains: filters.userKeyword, mode: 'insensitive' } },
        { phone: { contains: filters.userKeyword } },
      ],
    }
  }
  if (filters.startAt || filters.endAt) {
    where.issuedAt = {
      ...(filters.startAt ? { gte: filters.startAt } : {}),
      ...(filters.endAt ? { lte: filters.endAt } : {}),
    }
  }
  if (filters.status === 'USED') {
    where.status = 'SUCCESS'
    where.usedAt = { not: null }
  } else if (filters.status === 'ISSUED') {
    where.status = 'SUCCESS'
  } else if (filters.status === 'FAILED') {
    where.status = { in: ['FAILED', 'SKIPPED'] }
  } else if (filters.status) {
    where.status = filters.status
  }

  const [rows, total] = await Promise.all([
    prisma.campaignExecutionLog.findMany({
      where,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: {
          select: {
            name: true,
            rewards: {
              select: {
                rewardType: true,
                pointsAmount: true,
                couponName: true,
                couponDiscountRate: true,
                couponValidDays: true,
                applicableGames: true,
              },
            },
          },
        },
        user: { select: { name: true, phone: true } },
      },
    }),
    prisma.campaignExecutionLog.count({ where }),
  ])

  const gameIds = Array.from(new Set(rows.flatMap((row) => {
    const type = normalizeRewardType(row.rewardType)
    const reward = row.campaign.rewards.find((item) => normalizeRewardType(item.rewardType) === type)
      || row.campaign.rewards[0]
    return reward?.applicableGames || []
  })))
  const games = gameIds.length > 0
    ? await prisma.game.findMany({ where: { id: { in: gameIds } }, select: { id: true, title: true } })
    : []
  const gameNameById = new Map(games.map((game) => [game.id, game.title]))
  const data = rows.map((row) => {
    const type = normalizeRewardType(row.rewardType)
    const reward = row.campaign.rewards.find((item) => normalizeRewardType(item.rewardType) === type)
      || row.campaign.rewards[0]
    return mapCampaignRewardRecord({
      ...row,
      applicableGameNames: (reward?.applicableGames || []).map((id) => gameNameById.get(id)).filter((name): name is string => Boolean(name)),
    })
  })

  return { data, total, page: filters.page, pageSize: filters.pageSize }
}

/* ─── 14. 全局奖励记录 ─── */
export async function rewardRecords(req: Request, res: Response) {
  try {
    const result = await queryRewardRecords(req.query as Record<string, unknown>)
    return paginated(res, result.data, result.page, result.pageSize, result.total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 15. 单活动奖励记录 ─── */
export async function executionLogs(req: Request, res: Response) {
  try {
    const result = await queryRewardRecords(req.query as Record<string, unknown>, req.params.id as string)
    return paginated(res, result.data, result.page, result.pageSize, result.total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
