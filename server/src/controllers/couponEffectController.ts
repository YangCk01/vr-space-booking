import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'

/* ─── 1. 券效果报表 ─── */
export async function list(req: Request, res: Response) {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const couponType = req.query.couponType as string | undefined
    const source = req.query.source as string | undefined

    const where: any = {}
    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    } else if (startDate) {
      where.date = { gte: startDate }
    } else if (endDate) {
      where.date = { lte: endDate }
    }
    if (couponType) where.couponType = couponType
    if (source) where.source = source

    const [reports, total] = await Promise.all([
      prisma.couponEffectReport.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { date: 'desc' },
      }),
      prisma.couponEffectReport.count({ where }),
    ])

    return paginated(res, reports, page, pageSize, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 2. 券效果汇总（体验券 vs 折扣券对比）─── */
export async function summary(req: Request, res: Response) {
  try {
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    const where: any = {}
    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    } else if (startDate) {
      where.date = { gte: startDate }
    } else if (endDate) {
      where.date = { lte: endDate }
    }

    const rows = await prisma.couponEffectReport.findMany({ where })

    const discount = {
      couponType: 'DISCOUNT',
      giftedCount: 0,
      usedCount: 0,
      expiredCount: 0,
      totalOrderAmount: 0,
      avgOrderAmount: 0,
      couponDiscountCost: 0,
      reorderUserCount: 0,
      reorderAmount: 0,
    }

    const experience = {
      couponType: 'EXPERIENCE_FREE',
      giftedCount: 0,
      usedCount: 0,
      expiredCount: 0,
      totalOrderAmount: 0,
      avgOrderAmount: 0,
      couponDiscountCost: 0,
      reorderUserCount: 0,
      reorderAmount: 0,
    }

    let discountUsed = 0
    let experienceUsed = 0

    for (const r of rows) {
      const target = r.couponType === 'DISCOUNT' ? discount : experience
      target.giftedCount += r.giftedCount
      target.usedCount += r.usedCount
      target.expiredCount += r.expiredCount
      target.totalOrderAmount += r.totalOrderAmount
      target.couponDiscountCost += r.couponDiscountCost
      target.reorderUserCount += r.reorderUserCount
      target.reorderAmount += r.reorderAmount
      if (r.couponType === 'DISCOUNT') discountUsed += r.usedCount
      else experienceUsed += r.usedCount
    }

    discount.avgOrderAmount = discountUsed > 0 ? Math.round(discount.totalOrderAmount / discountUsed) : 0
    experience.avgOrderAmount = experienceUsed > 0 ? Math.round(experience.totalOrderAmount / experienceUsed) : 0

    return success(res, { discount, experience })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
