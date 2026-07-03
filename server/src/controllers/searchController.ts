import { Response } from 'express'
import { prisma } from '../utils/prisma'
import { success } from '../utils/response'
import { AuthenticatedRequest } from '../types'

function hasAnyPermission(req: AuthenticatedRequest, permissions: string[]) {
  if (req.user?.role === 'SUPER_ADMIN') return true
  const userPermissions = req.user?.permissions || []
  return permissions.some((permission) => userPermissions.includes(permission))
}

export async function globalSearch(req: AuthenticatedRequest, res: Response) {
  const q = (req.query.q as string || '').trim()
  if (!q || q.length < 1) {
    return success(res, { venues: [], orders: [], users: [] })
  }

  const canSearchVenues = hasAnyPermission(req, ['venue:read', 'venue:manage', 'booking:read', 'order:read'])
  const canSearchOrders = hasAnyPermission(req, ['order:read', 'order:verify', 'finance:read'])
  const canSearchUsers = hasAnyPermission(req, ['user:read', 'member:marketing'])

  const [venues, orders, users] = await Promise.all([
    canSearchVenues ? prisma.venue.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { theme: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, name: true, theme: true, status: true },
    }) : Promise.resolve([]),
    canSearchOrders ? prisma.order.findMany({
      where: {
        OR: [
          { orderNo: { contains: q, mode: 'insensitive' } },
          { venueName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, orderNo: true, venueName: true, status: true, amount: true },
    }) : Promise.resolve([]),
    canSearchUsers ? prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, name: true, phone: true, level: true, status: true },
    }) : Promise.resolve([]),
  ])

  return success(res, { venues, orders, users })
}
