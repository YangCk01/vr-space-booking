import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'

/* ─── 1. 获取用户标签 ─── */
export async function getUserTags(req: Request, res: Response) {
  try {
    const userId = req.params.id as string
    const tags = await prisma.userTag.findMany({
      where: { userId },
      orderBy: { scoredAt: 'desc' },
    })
    return success(res, tags)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 2. 标签分布统计 ─── */
export async function tagStats(req: Request, res: Response) {
  try {
    const stats = await prisma.userTag.groupBy({
      by: ['tag'],
      _count: { tag: true },
    })

    const data = stats.map((s) => ({
      tag: s.tag,
      count: s._count.tag,
    }))

    return success(res, data)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
