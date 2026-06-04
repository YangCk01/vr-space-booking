import { Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification } from '../controllers/notificationController'
import { startOfDay, endOfDay, parseISO } from 'date-fns'

export const createValidators = [
  body('venueId').notEmpty().withMessage('场地不能为空'),
  body('type').isIn(['TEAM', 'INDIVIDUAL', 'CORPORATE', 'MAINTENANCE']).withMessage('预约类型错误'),
  body('date').notEmpty().withMessage('日期不能为空'),
  body('startTime').notEmpty().withMessage('开始时间不能为空'),
  body('endTime').notEmpty().withMessage('结束时间不能为空'),
  body('personName').optional().isString().withMessage('预约人姓名格式错误'),
  body('personPhone').optional().isString().withMessage('预约人电话格式错误'),
]

export async function list(req: Request, res: Response) {
  try {
    const { venueId, date, startDate, endDate, type, page = '1', pageSize = '50' } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}

    if (venueId && venueId !== 'all') {
      where.venueId = venueId as string
    }

    if (type && type !== 'all') {
      where.type = type as string
    }

    if (date) {
      const d = date as string
      where.date = {
        gte: new Date(`${d}T00:00:00.000Z`),
        lte: new Date(`${d}T23:59:59.999Z`),
      }
    } else if (startDate && endDate) {
      const sd = startDate as string
      const ed = endDate as string
      where.date = {
        gte: new Date(`${sd}T00:00:00.000Z`),
        lte: new Date(`${ed}T23:59:59.999Z`),
      }
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        include: {
          venue: { select: { id: true, name: true, theme: true } },
          user: { select: { id: true, name: true, phone: true } },
          game: { select: { id: true, title: true } },
        },
      }),
      prisma.booking.count({ where }),
    ])

    return paginated(res, bookings, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function calendar(req: Request, res: Response) {
  try {
    const { startDate, endDate, venueId } = req.query

    if (!startDate || !endDate) {
      return error(res, '缺少日期范围参数', 400)
    }

    const where: any = {
      date: {
        gte: startOfDay(parseISO(startDate as string)),
        lte: endOfDay(parseISO(endDate as string)),
      },
      status: { not: 'CANCELLED' },
    }

    if (venueId && venueId !== 'all') {
      where.venueId = venueId as string
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        venue: { select: { id: true, name: true, theme: true } },
        game: { select: { id: true, title: true } },
      },
    })

    return success(res, bookings)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        venue: { select: { id: true, name: true, theme: true } },
        user: { select: { id: true, name: true, phone: true } },
        order: true,
      },
    })

    if (!booking) {
      return error(res, '预约不存在', 404)
    }

    return success(res, booking)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function checkConflict(req: Request, res: Response) {
  try {
    const { venueId, date, startTime, endTime, excludeId, gameId } = req.query

    if (!venueId || !date || !startTime || !endTime) {
      return error(res, '缺少必要参数', 400)
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId as string } })
    const bookingDateStr = date as string

    // 检查场地维护时段
    if (venue && venue.status === 'MAINTENANCE' && venue.maintenanceStartDate && venue.maintenanceEndDate && venue.maintenanceStartTime && venue.maintenanceEndTime) {
      const maintStartStr = venue.maintenanceStartDate.toISOString().slice(0, 10)
      const maintEndStr = venue.maintenanceEndDate.toISOString().slice(0, 10)
      if (bookingDateStr >= maintStartStr && bookingDateStr <= maintEndStr) {
        const s1 = timeToMinutes(startTime as string)
        const e1 = timeToMinutes(endTime as string)
        const ms1 = timeToMinutes(venue.maintenanceStartTime)
        const me1 = timeToMinutes(venue.maintenanceEndTime)
        if (s1 < me1 && e1 > ms1) {
          return success(res, { status: 'maintenance', message: '场地维护中', currentCount: 0, remainingCount: 0, maxCount: venue?.deviceCount || 1 })
        }
      }
    }

    const queryDate = new Date(`${date as string}T00:00:00.000Z`)
    const overlapping = await prisma.booking.findMany({
      where: {
        venueId: venueId as string,
        date: queryDate,
        status: { not: 'CANCELLED' },
        ...(excludeId ? { id: { not: excludeId as string } } : {}),
        OR: [
          {
            startTime: { lte: endTime as string },
            endTime: { gt: startTime as string },
          },
        ],
      },
    })

    // 精确时间重叠过滤
    const s1 = timeToMinutes(startTime as string)
    const e1 = timeToMinutes(endTime as string)
    const conflicts = overlapping.filter((b) => {
      const s2 = timeToMinutes(b.startTime)
      const e2 = timeToMinutes(b.endTime)
      return s1 < e2 && e1 > s2
    })

    const deviceCount = venue?.deviceCount || 1

    // 未选游戏时保持原有二元冲突判断
    if (!gameId) {
      const hasConflict = conflicts.length > 0
      return success(res, {
        status: hasConflict ? 'full' : 'available',
        currentCount: hasConflict ? conflicts.reduce((sum, b) => sum + (b.personCount || 1), 0) : 0,
        remainingCount: hasConflict ? 0 : deviceCount,
        maxCount: deviceCount,
      })
    }

    const selectedGameId = gameId as string

    // 检查是否有其他游戏的预约
    const otherGameBooking = conflicts.some((b) => b.gameId && b.gameId !== selectedGameId)
    if (otherGameBooking) {
      return success(res, {
        status: 'occupied_by_other_game',
        currentCount: 0,
        remainingCount: 0,
        maxCount: deviceCount,
      })
    }

    // 统计同一游戏已预约人数
    const sameGameBookings = conflicts.filter((b) => b.gameId === selectedGameId)
    const currentCount = sameGameBookings.reduce((sum, b) => sum + (b.personCount || 1), 0)

    if (currentCount === 0) {
      return success(res, { status: 'available', currentCount: 0, remainingCount: deviceCount, maxCount: deviceCount })
    }

    if (currentCount < deviceCount) {
      return success(res, { status: 'joinable', currentCount, remainingCount: deviceCount - currentCount, maxCount: deviceCount })
    }

    return success(res, { status: 'full', currentCount, remainingCount: 0, maxCount: deviceCount })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function create(req: Request, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const { venueId, type, date, startTime, endTime, personName, personPhone, personCount, note, title, gameId } = req.body

    // 检查场地是否存在
    const venue = await prisma.venue.findUnique({ where: { id: venueId } })
    if (!venue) {
      return error(res, '场地不存在', 404)
    }

    const queryDate = new Date(`${date}T00:00:00.000Z`)

    // 检查场地维护时段
    if (venue.status === 'MAINTENANCE' && venue.maintenanceStartDate && venue.maintenanceEndDate && venue.maintenanceStartTime && venue.maintenanceEndTime) {
      const bookingDateStr = date as string
      const maintStartStr = venue.maintenanceStartDate.toISOString().slice(0, 10)
      const maintEndStr = venue.maintenanceEndDate.toISOString().slice(0, 10)
      if (bookingDateStr >= maintStartStr && bookingDateStr <= maintEndStr) {
        const s1 = timeToMinutes(startTime)
        const e1 = timeToMinutes(endTime)
        const ms1 = timeToMinutes(venue.maintenanceStartTime)
        const me1 = timeToMinutes(venue.maintenanceEndTime)
        if (s1 < me1 && e1 > ms1) {
          return error(res, '该时段场地正在维护中', 409)
        }
      }
    }

    // 检查冲突（拼场逻辑）
    const overlapping = await prisma.booking.findMany({
      where: {
        venueId,
        date: queryDate,
        status: { not: 'CANCELLED' },
      },
    })

    const s1 = timeToMinutes(startTime)
    const e1 = timeToMinutes(endTime)
    const conflicts = overlapping.filter((b) => {
      const s2 = timeToMinutes(b.startTime)
      const e2 = timeToMinutes(b.endTime)
      return s1 < e2 && e1 > s2
    })

    const deviceCount = venue.deviceCount || 1
    const pc = parseInt(personCount) || 1

    // 未选游戏时保持原有二元冲突判断
    if (!gameId) {
      if (conflicts.length > 0) {
        return error(res, '该时段已被预约', 409)
      }
    } else {
      // 检查是否有其他游戏的预约
      const otherGameBooking = conflicts.some((b) => b.gameId && b.gameId !== gameId)
      if (otherGameBooking) {
        return error(res, '该时段已有其他游戏预约', 409)
      }

      // 统计同一游戏已预约人数
      const sameGameBookings = conflicts.filter((b) => b.gameId === gameId)
      const currentCount = sameGameBookings.reduce((sum, b) => sum + (b.personCount || 1), 0)

      if (currentCount + pc > deviceCount) {
        return error(res, '该时段该游戏已约满', 409)
      }
    }

    const bookingTitle = title || `${venue.name} ${type === 'TEAM' ? '团队预约' : type === 'INDIVIDUAL' ? '散客预约' : type === 'CORPORATE' ? '企业活动' : '维护'} ${startTime}-${endTime}`

    const booking = await prisma.booking.create({
      data: {
        venueId,
        type,
        gameId: gameId || null,
        title: bookingTitle,
        date: new Date(`${date}T00:00:00.000Z`),
        startTime,
        endTime,
        personName,
        personPhone,
        personCount: parseInt(personCount) || 1,
        note: note || null,
        userId: (req as any).user?.id || null,
      },
      include: {
        venue: { select: { id: true, name: true, theme: true } },
      },
    })

    // Send notification
    const userId = (req as any).user?.id
    if (userId) {
      await pushNotification(
        userId,
        'BOOKING_SUCCESS',
        '预约成功',
        `您已成功预约 ${venue.name} ${date} ${startTime}-${endTime}`
      )
    }

    return success(res, booking, '预约创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existing = await prisma.booking.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '预约不存在', 404)
    }

    const data: any = {}
    if (req.body.venueId !== undefined) data.venueId = req.body.venueId
    if (req.body.type !== undefined) data.type = req.body.type
    if (req.body.title !== undefined) data.title = req.body.title
    if (req.body.date !== undefined) data.date = parseISO(req.body.date)
    if (req.body.startTime !== undefined) data.startTime = req.body.startTime
    if (req.body.endTime !== undefined) data.endTime = req.body.endTime
    if (req.body.personName !== undefined) data.personName = req.body.personName
    if (req.body.personPhone !== undefined) data.personPhone = req.body.personPhone
    if (req.body.personCount !== undefined) data.personCount = parseInt(req.body.personCount)
    if (req.body.note !== undefined) data.note = req.body.note
    if (req.body.status !== undefined) data.status = req.body.status

    const booking = await prisma.booking.update({
      where: { id },
      data,
      include: {
        venue: { select: { id: true, name: true, theme: true } },
      },
    })

    return success(res, booking, '预约更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existing = await prisma.booking.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '预约不存在', 404)
    }

    await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    return success(res, null, '预约已取消')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}


/* ─── 顾客到场签到 ─── */
export async function checkIn(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { order: true },
    })
    if (!booking) return error(res, '预约不存在', 404)
    if (!['CONFIRMED', 'READY'].includes(booking.status)) {
      return error(res, '该预约状态不允许签到', 400)
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CHECKED_IN', checkedInAt: new Date() },
      })

      if (booking.order) {
        await tx.order.update({
          where: { id: booking.order.id },
          data: { verifiedAt: new Date() },
        })
      }
    })

    return success(res, null, '签到成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
