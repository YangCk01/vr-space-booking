import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success } from '../utils/response'

export async function globalSearch(req: Request, res: Response) {
  const q = (req.query.q as string || '').trim()
  if (!q || q.length < 1) {
    return success(res, { venues: [], orders: [], users: [] })
  }

  const [venues, orders, users] = await Promise.all([
    prisma.venue.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { theme: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, name: true, theme: true, status: true },
    }),
    prisma.order.findMany({
      where: {
        OR: [
          { orderNo: { contains: q, mode: 'insensitive' } },
          { venueName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, orderNo: true, venueName: true, status: true, amount: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, name: true, phone: true, level: true, status: true },
    }),
  ])

  return success(res, { venues, orders, users })
}
