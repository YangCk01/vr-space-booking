import { Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import type { Prisma, Venue } from '@prisma/client'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification } from './notificationController'

function getMaintenanceEnd(venue: Venue): Date | null {
  if (!venue.maintenanceEndDate || !venue.maintenanceEndTime) return null
  const end = new Date(venue.maintenanceEndDate)
  const [h, m] = venue.maintenanceEndTime.split(':').map(Number)
  end.setHours(h, m, 0, 0)
  return end
}

function isMaintenanceExpired(venue: Venue): boolean {
  const end = getMaintenanceEnd(venue)
  return end !== null && new Date() > end
}

async function restoreExpiredMaintenance(venueId?: string) {
  const where: any = {
    status: 'MAINTENANCE',
    maintenanceEndDate: { not: null },
    maintenanceEndTime: { not: null },
  }
  if (venueId) where.id = venueId

  const venues = await prisma.venue.findMany({ where })
  const expiredIds = venues.filter(isMaintenanceExpired).map((v) => v.id)

  if (expiredIds.length > 0) {
    await prisma.venue.updateMany({
      where: { id: { in: expiredIds } },
      data: {
        status: 'FREE',
        maintenanceStartDate: null,
        maintenanceEndDate: null,
        maintenanceStartTime: null,
        maintenanceEndTime: null,
      },
    })
  }
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function overlapsMaintenance(venue: Venue, booking: { date: Date; startTime: string; endTime: string }) {
  if (
    venue.status !== 'MAINTENANCE' ||
    !venue.maintenanceStartDate ||
    !venue.maintenanceEndDate ||
    !venue.maintenanceStartTime ||
    !venue.maintenanceEndTime
  ) {
    return false
  }

  const bookingDate = dateOnly(booking.date)
  const startDate = dateOnly(venue.maintenanceStartDate)
  const endDate = dateOnly(venue.maintenanceEndDate)
  if (bookingDate < startDate || bookingDate > endDate) return false

  const bookingStart = timeToMinutes(booking.startTime)
  const bookingEnd = timeToMinutes(booking.endTime)
  const maintenanceStart = timeToMinutes(venue.maintenanceStartTime)
  const maintenanceEnd = timeToMinutes(venue.maintenanceEndTime)
  return bookingStart < maintenanceEnd && bookingEnd > maintenanceStart
}

async function syncMaintenanceAffectedOrders(client: Prisma.TransactionClient | typeof prisma, venue: Venue) {
  const disruptionSource = `VENUE:${venue.id}`
  const currentDisruptedBookings = await client.booking.findMany({
    where: {
      venueId: venue.id,
      order: {
        disruptionStatus: 'VENUE_MAINTENANCE',
        disruptionSource,
        status: { in: ['PAID', 'READY_TO_VERIFY'] },
      },
    },
    include: { order: true },
  })

  const hasActiveMaintenance =
    venue.status === 'MAINTENANCE' &&
    !!venue.maintenanceStartDate &&
    !!venue.maintenanceEndDate &&
    !!venue.maintenanceStartTime &&
    !!venue.maintenanceEndTime

  const bookings = hasActiveMaintenance
    ? await client.booking.findMany({
      where: {
        venueId: venue.id,
        status: { in: ['CONFIRMED', 'READY'] },
        date: {
          gte: venue.maintenanceStartDate!,
          lte: venue.maintenanceEndDate!,
        },
        order: {
          status: { in: ['PAID', 'READY_TO_VERIFY'] },
        },
      },
      include: { order: true },
    })
    : []

  const affected = bookings.filter((booking) => booking.order && overlapsMaintenance(venue, booking))
  const affectedOrderIds = new Set(affected.map((booking) => booking.order!.id))
  const stale = currentDisruptedBookings.filter((booking) => booking.order && !affectedOrderIds.has(booking.order.id))
  const affectedAt = new Date()

  for (const booking of stale) {
    const order = booking.order!
    const metadata = (order.metadata as Record<string, any>) || {}
    await client.order.update({
      where: { id: order.id },
      data: {
        disruptionStatus: 'NONE',
        disruptionReason: null,
        disruptionSource: null,
        disruptionAt: null,
        metadata: {
          ...metadata,
          maintenanceDisruptionResolvedAt: affectedAt.toISOString(),
        },
      },
    })
  }

  for (const booking of affected) {
    const order = booking.order!
    const wasAlreadyAffected = order.disruptionStatus === 'VENUE_MAINTENANCE' && order.disruptionSource === disruptionSource
    const metadata = (order.metadata as Record<string, any>) || {}
    await client.order.update({
      where: { id: order.id },
      data: {
        disruptionStatus: 'VENUE_MAINTENANCE',
        disruptionReason: '场地故障维护',
        disruptionSource,
        disruptionAt: affectedAt,
        metadata: {
          ...metadata,
          maintenanceDisruption: {
            venueId: venue.id,
            venueName: venue.name,
            startDate: dateOnly(venue.maintenanceStartDate!),
            endDate: dateOnly(venue.maintenanceEndDate!),
            startTime: venue.maintenanceStartTime,
            endTime: venue.maintenanceEndTime,
            affectedAt: affectedAt.toISOString(),
          },
        },
      },
    })

    if (!wasAlreadyAffected && order.userId) {
      await pushNotification(
        order.userId,
        'VENUE_MAINTENANCE',
        '场地维护影响预约',
        `您的订单 ${order.orderNo} 因场地维护受影响，可免费改签或全额退款。`
      )
    }
  }

  return { affected: affected.length, cleared: stale.length }
}

export const createValidators = [
  body('name').notEmpty().withMessage('场地名称不能为空'),
  body('area').isInt({ min: 1 }).withMessage('面积必须是正整数'),
  body('capacity').isInt({ min: 1 }).withMessage('容量必须是正整数'),
  body('deviceCount').optional().isInt({ min: 1 }).withMessage('设备数量必须是正整数'),
]

export const updateValidators = [
  param('id').notEmpty().withMessage('ID 不能为空'),
  body('name').optional().notEmpty().withMessage('场地名称不能为空'),
  body('area').optional().isInt({ min: 1 }).withMessage('面积必须是正整数'),
  body('capacity').optional().isInt({ min: 1 }).withMessage('容量必须是正整数'),
  body('deviceCount').optional().isInt({ min: 1 }).withMessage('设备数量必须是正整数'),
]

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    await restoreExpiredMaintenance()

    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined
    const page = (req.query.page as string) || '1'
    const pageSize = (req.query.pageSize as string) || '20'
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}

    // MANAGER 只能查看被分配的场地
    if (req.user?.role === 'MANAGER' && req.user.managedVenueIds?.length) {
      where.id = { in: req.user.managedVenueIds }
    } else if (req.user?.role === 'MANAGER') {
      return paginated(res, [], pageNum, sizeNum, 0)
    }

    if (status && status !== 'all') {
      const statusMap: Record<string, string> = {
        free: 'FREE',
        'in-use': 'IN_USE',
        'in_use': 'IN_USE',
        maintenance: 'MAINTENANCE',
        disabled: 'DISABLED',
      }
      where.status = statusMap[status.toLowerCase()] || status.toUpperCase()
    }

    if (search) {
      where.AND = where.AND || []
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { theme: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.venue.count({ where }),
    ])

    return paginated(res, venues, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function publicList(req: Request, res: Response) {
  try {
    await restoreExpiredMaintenance()

    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined
    const page = (req.query.page as string) || '1'
    const pageSize = (req.query.pageSize as string) || '100'
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = { status: { not: 'DISABLED' } }

    if (status && status !== 'all') {
      const statusMap: Record<string, string> = {
        free: 'FREE',
        'in-use': 'IN_USE',
        'in_use': 'IN_USE',
        maintenance: 'MAINTENANCE',
      }
      where.status = statusMap[status.toLowerCase()] || status.toUpperCase()
    }

    if (search) {
      where.AND = where.AND || []
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { theme: { contains: search, mode: 'insensitive' } },
          { address: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.venue.count({ where }),
    ])

    return paginated(res, venues, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function publicGetById(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    await restoreExpiredMaintenance(id)

    const venue = await prisma.venue.findFirst({
      where: { id, status: { not: 'DISABLED' } },
    })

    if (!venue) {
      return error(res, '场地不存在', 404)
    }

    return success(res, venue)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string

    // MANAGER 只能查看被分配的场地
    if (req.user?.role === 'MANAGER' && !req.user.managedVenueIds?.includes(id)) {
      return error(res, '无权访问该场地', 403)
    }

    await restoreExpiredMaintenance(id)

    const venue = await prisma.venue.findUnique({ where: { id } })

    if (!venue) {
      return error(res, '场地不存在', 404)
    }

    return success(res, venue)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function create(req: Request, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const venue = await prisma.venue.create({
      data: {
        name: req.body.name,
        theme: req.body.theme || '',
        status: req.body.status || 'FREE',
        area: parseInt(req.body.area),
        capacity: parseInt(req.body.capacity),
        deviceCount: parseInt(req.body.deviceCount) || 1,
        image: req.body.image || null,
        description: req.body.description || null,
        address: req.body.address || null,
        phone: req.body.phone || null,
        openTime: req.body.openTime || '09:00',
        closeTime: req.body.closeTime || '22:00',
        qrCode: req.body.qrCode || null,
        serviceQr: req.body.serviceQr || null,
        mapLinks: req.body.mapLinks || null,
        maintenanceStartDate: req.body.maintenanceStartDate ? new Date(req.body.maintenanceStartDate) : null,
        maintenanceEndDate: req.body.maintenanceEndDate ? new Date(req.body.maintenanceEndDate) : null,
        maintenanceStartTime: req.body.maintenanceStartTime || null,
        maintenanceEndTime: req.body.maintenanceEndTime || null,
      },
    })
    const maintenanceSync = await syncMaintenanceAffectedOrders(prisma, venue)
    return success(res, { ...venue, maintenanceSync }, '场地创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const id = req.params.id as string
    const existing = await prisma.venue.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '场地不存在', 404)
    }

    const data: any = {}
    if (req.body.name !== undefined) data.name = req.body.name
    if (req.body.theme !== undefined) data.theme = req.body.theme
    if (req.body.status !== undefined) data.status = req.body.status
    if (req.body.area !== undefined) data.area = parseInt(req.body.area)
    if (req.body.capacity !== undefined) data.capacity = parseInt(req.body.capacity)
    if (req.body.deviceCount !== undefined) data.deviceCount = parseInt(req.body.deviceCount)
    if (req.body.image !== undefined) data.image = req.body.image
    if (req.body.description !== undefined) data.description = req.body.description
    if (req.body.address !== undefined) data.address = req.body.address
    if (req.body.phone !== undefined) data.phone = req.body.phone
    if (req.body.openTime !== undefined) data.openTime = req.body.openTime || '09:00'
    if (req.body.closeTime !== undefined) data.closeTime = req.body.closeTime || '22:00'
    if (req.body.qrCode !== undefined) data.qrCode = req.body.qrCode || null
    if (req.body.serviceQr !== undefined) data.serviceQr = req.body.serviceQr || null
    if (req.body.mapLinks !== undefined) data.mapLinks = req.body.mapLinks || null
    if (req.body.maintenanceStartDate !== undefined) data.maintenanceStartDate = req.body.maintenanceStartDate ? new Date(req.body.maintenanceStartDate) : null
    if (req.body.maintenanceEndDate !== undefined) data.maintenanceEndDate = req.body.maintenanceEndDate ? new Date(req.body.maintenanceEndDate) : null
    if (req.body.maintenanceStartTime !== undefined) data.maintenanceStartTime = req.body.maintenanceStartTime || null
    if (req.body.maintenanceEndTime !== undefined) data.maintenanceEndTime = req.body.maintenanceEndTime || null

    const venue = await prisma.venue.update({
      where: { id },
      data,
    })
    const maintenanceSync = await syncMaintenanceAffectedOrders(prisma, venue)
    return success(res, { ...venue, maintenanceSync }, '场地更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existing = await prisma.venue.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '场地不存在', 404)
    }

    await prisma.venue.delete({ where: { id } })
    return success(res, null, '场地删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Batch operations ─── */

export async function batchDelete(req: Request, res: Response) {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return error(res, '请选择要删除的场地', 400)
    }

    const result = await prisma.$transaction(async (tx) => {
      // 检查是否有未完成预约
      const venuesWithBookings = await tx.booking.findMany({
        where: {
          venueId: { in: ids },
          status: { not: 'CANCELLED' },
          date: { gte: new Date() },
        },
        select: { venueId: true },
        distinct: ['venueId'],
      })
      if (venuesWithBookings.length > 0) {
        throw new Error('存在场地有未完成预约，无法删除')
      }

      await tx.venue.deleteMany({ where: { id: { in: ids } } })
      return ids.length
    })

    return success(res, { deleted: result }, `已删除 ${result} 个场地`)
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

export async function batchUpdateStatus(req: Request, res: Response) {
  try {
    const { ids, status } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return error(res, '请选择要更新的场地', 400)
    }
    if (!status) {
      return error(res, '状态不能为空', 400)
    }

    const result = await prisma.venue.updateMany({
      where: { id: { in: ids } },
      data: { status },
    })

    return success(res, { updated: result.count }, `已更新 ${result.count} 个场地状态`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
