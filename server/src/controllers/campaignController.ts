import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { addDays } from 'date-fns'

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
    const { name, type, startAt, endAt, budget, rewards } = req.body
    if (!name || !type) {
      return error(res, '活动名称和类型必填', 400)
    }
    if (!Array.isArray(rewards) || rewards.length === 0) {
      return error(res, '请至少配置一个奖励', 400)
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        type,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        budget: budget ? parseInt(budget) : null,
        createdBy: req.user?.id || '',
        status: 'DRAFT',
        rewards: {
          create: rewards.map((r: any) => ({
            rewardType: r.rewardType,
            pointsAmount: r.pointsAmount ? parseInt(r.pointsAmount) : null,
            couponName: r.couponName || null,
            couponDiscountRate: r.couponDiscountRate ? parseInt(r.couponDiscountRate) : null,
            couponValidDays: r.couponValidDays ? parseInt(r.couponValidDays) : null,
            maxQuantity: r.maxQuantity ? parseInt(r.maxQuantity) : 0,
          })),
        },
      },
      include: { rewards: true },
    })

    return success(res, campaign, '活动创建成功', 201)
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

    const where: any = {}
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

    const data = campaigns.map((c) => ({
      ...c,
      computedStatus: getCampaignStatus(c.startAt, c.endAt, c.status),
      trackCount: c._count.tracks,
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

    return success(res, {
      ...campaign,
      computedStatus: getCampaignStatus(campaign.startAt, campaign.endAt, campaign.status),
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 4. 活动统计 ─── */
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

/* ─── 5. 暂停活动 ─── */
export async function pause(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return error(res, '活动不存在', 404)
    if (campaign.status !== 'RUNNING') return error(res, '只有运行中的活动可以暂停', 400)

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    })
    return success(res, updated, '活动已暂停')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 6. 结束活动 ─── */
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

/* ─── 7. 激活草稿活动 ─── */
export async function activate(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return error(res, '活动不存在', 404)
    if (campaign.status !== 'DRAFT') return error(res, '只有草稿活动可以激活', 400)

    const now = new Date()
    const startAt = campaign.startAt || now
    const endAt = campaign.endAt || addDays(now, 7)

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: 'RUNNING', startAt, endAt },
    })
    return success(res, updated, '活动已激活')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
