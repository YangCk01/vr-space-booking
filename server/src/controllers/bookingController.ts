import { Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification } from '../controllers/notificationController'
import { startOfDay, endOfDay, parseISO } from 'date-fns'
import { assignEquipment, releaseEquipment } from '../services/equipmentService'
import { consumeBenefit } from '../services/userBenefitService'
import { deductProportional } from '../utils/wallet'

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

function addMinutesToTime(t: string, minutes: number): string {
  const total = timeToMinutes(t) + minutes
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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

    // 检查可提前预约天数
    const advanceSetting = await prisma.systemSetting.findUnique({ where: { key: 'booking_advance_days' } })
    const advanceRaw = advanceSetting?.value as any
    const advanceDays = typeof advanceRaw === 'number' ? advanceRaw : (advanceRaw?.value as number) ?? 7
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + advanceDays)
    if (queryDate > maxDate) {
      return error(res, `只能预约未来 ${advanceDays} 天内的场次`, 400)
    }

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


/* ─── 获取预约实时状态（含倒计时）─── */
export async function status(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { order: true, game: true, venue: true },
    })
    if (!booking) return error(res, '预约不存在', 404)

    // 读取生命周期配置
    const keys = ['verify_advance_minutes', 'late_buffer_minutes', 'no_show_deadline_minutes']
    const settings = await prisma.systemSetting.findMany({ where: { key: { in: keys } } })
    const map: Record<string, any> = {}
    for (const s of settings) {
      const raw = s.value as any
      map[s.key] = raw?.value ?? raw
    }
    const verifyAdvanceMinutes = map.verify_advance_minutes ?? 15
    const lateBufferMinutes = map.late_buffer_minutes ?? 10
    const noShowDeadlineMinutes = map.no_show_deadline_minutes ?? 15

    // 计算时间
    const dateStr = booking.date.toISOString().split('T')[0]
    const startTime = new Date(`${dateStr}T${booking.startTime}:00+08:00`)
    const now = new Date()
    const diffMs = startTime.getTime() - now.getTime()
    const diffMinutes = diffMs / (1000 * 60)

    // 倒计时文本
    let countdownText = ''
    let countdownSeconds = 0
    if (diffMs > 0) {
      countdownSeconds = Math.floor(diffMs / 1000)
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000)
      countdownText = hours > 0
        ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${mins}:${String(secs).padStart(2, '0')}`
    }

    // 最迟入场时间
    const latestEntryTime = new Date(startTime.getTime() + lateBufferMinutes * 60 * 1000)

    // 状态阶段
    let stage: string = booking.status
    if (booking.status === 'CONFIRMED' && diffMinutes <= verifyAdvanceMinutes && diffMinutes > 0) {
      stage = 'READY_TO_VERIFY'
    } else if (booking.status === 'READY' && diffMinutes <= 0) {
      stage = 'PLAYING_WINDOW'
    } else if (booking.status === 'NO_SHOW') {
      stage = 'NO_SHOW'
    }

    return success(res, {
      id: booking.id,
      status: booking.status,
      stage,
      startTime: booking.startTime,
      date: dateStr,
      countdownText,
      countdownSeconds,
      verifyAdvanceMinutes,
      lateBufferMinutes,
      noShowDeadlineMinutes,
      latestEntryTime: latestEntryTime.toISOString(),
      canCheckIn: ['CONFIRMED', 'READY'].includes(booking.status) && diffMinutes <= verifyAdvanceMinutes,
      isNoShow: booking.status === 'NO_SHOW',
      gameTitle: booking.game?.title || 'VR体验',
      venueName: booking.venue?.name || '',
      personCount: booking.personCount || 1,
      orderStatus: booking.order?.status || null,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 预约改签 ─── */
export async function reschedule(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { venueId, date, startTime, gameId, personCount, payMethod } = req.body
    const method = (payMethod || 'BALANCE').toUpperCase()

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { order: { include: { user: true } }, venue: true, game: true },
    })
    if (!booking) return error(res, '预约不存在', 404)
    if (!booking.order) return error(res, '预约未关联订单', 400)

    const order = booking.order

    // 1. 验证改签条件
    if (!['PAID', 'READY_TO_VERIFY'].includes(order.status)) {
      return error(res, '当前订单状态不允许改签', 400)
    }

    // 读取改签配置
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ['reschedule_deadline_hours', 'reschedule_fee_rate', 'reschedule_max_count', 'reschedule_allow_after_start', 'reschedule_after_start_minutes'] } },
    })
    const cfgMap: Record<string, any> = {}
    for (const s of settings) {
      const raw = s.value as any
      cfgMap[s.key] = raw?.value ?? raw
    }
    const deadlineHours = cfgMap.reschedule_deadline_hours ?? 2
    const feeRate = cfgMap.reschedule_fee_rate ?? 10
    const maxCount = cfgMap.reschedule_max_count ?? 1
    const allowAfterStart = cfgMap.reschedule_allow_after_start ?? true
    const afterStartMinutes = cfgMap.reschedule_after_start_minutes ?? 15

    // 检查改签次数
    if (order.rescheduleCount >= maxCount) {
      return error(res, `该订单已达到最大改签次数（${maxCount}次）`, 400)
    }

    // 检查是否超过开场后可改签时间
    const bookingDateStr = booking.date.toISOString().slice(0, 10)
    const bookingStart = new Date(`${bookingDateStr}T${booking.startTime}:00+08:00`)
    const now = new Date()
    const minutesSinceStart = (now.getTime() - bookingStart.getTime()) / (1000 * 60)
    if (minutesSinceStart > afterStartMinutes) {
      return error(res, '该场次已过期，无法改签', 400)
    }
    if (minutesSinceStart > 0 && !allowAfterStart) {
      return error(res, '该场次已开始，不允许改签', 400)
    }

    // 2. 确定新参数（未传则保持原值）
    const newVenueId = venueId || booking.venueId
    const newDate = date || booking.date.toISOString().slice(0, 10)
    const newGameId = gameId || booking.gameId
    const newPersonCount = personCount || booking.personCount || 1

    // 获取新游戏信息以计算 endTime
    const newGame = newGameId
      ? await prisma.game.findUnique({ where: { id: newGameId } })
      : booking.game
    if (!newGame && newGameId) {
      return error(res, '所选游戏不存在', 400)
    }
    const duration = newGame?.duration || booking.game?.duration || 30
    const newEndTime = addMinutesToTime(startTime || booking.startTime, duration)

    // 3. 冲突检测（排除自身）
    const queryDate = new Date(`${newDate}T00:00:00.000Z`)
    const overlapping = await prisma.booking.findMany({
      where: {
        venueId: newVenueId,
        date: queryDate,
        status: { not: 'CANCELLED' },
        id: { not: id },
        OR: [{ startTime: { lte: newEndTime }, endTime: { gt: startTime || booking.startTime } }],
      },
    })

    const venue = await prisma.venue.findUnique({ where: { id: newVenueId } })
    const deviceCount = venue?.deviceCount || 1
    const pc = parseInt(newPersonCount as any) || 1

    const s1 = timeToMinutes(startTime || booking.startTime)
    const e1 = timeToMinutes(newEndTime)

    // 精确时间重叠过滤
    const conflicts = overlapping.filter((b) => {
      const s2 = timeToMinutes(b.startTime)
      const e2 = timeToMinutes(b.endTime)
      return s1 < e2 && e1 > s2
    })

    // 检查是否有其他游戏的预约
    const otherGameBooking = conflicts.some((b) => b.gameId && b.gameId !== newGameId)
    if (otherGameBooking) {
      return error(res, '该时段已有其他游戏预约', 400)
    }

    // 统计同一游戏已预约人数
    const sameGameBookings = conflicts.filter((b) => b.gameId === newGameId)
    const currentCount = sameGameBookings.reduce((sum, b) => sum + (b.personCount || 1), 0)

    if (currentCount + pc > deviceCount) {
      return error(res, '该时段该游戏已约满', 400)
    }

    // 4. 计算价格差异
    const newOriginalAmount = (newGame?.price || booking.game?.price || 0) * newPersonCount
    const baseFeeAmount = Math.floor((order.originalAmount || order.amount) * feeRate / 100)

    // 5. 执行改签（更新 Booking 和 Order）
    let feeAmount = baseFeeAmount
    let freeRescheduleUsed = false
    let deltaAmount = newOriginalAmount - (order.originalAmount || order.amount) + baseFeeAmount
    await prisma.$transaction(async (tx) => {
      // 5.1 检查会员免费改签权益（在事务内执行，确保一致性）
      if (order.userId && baseFeeAmount > 0) {
        const benefitResult = await consumeBenefit(order.userId, 'FREE_RESCHEDULE', tx)
        if (benefitResult.success) {
          feeAmount = 0
          freeRescheduleUsed = true
        }
      }

      deltaAmount = newOriginalAmount - (order.originalAmount || order.amount) + feeAmount
      // 更新 Booking
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          venueId: newVenueId,
          date: queryDate,
          startTime: startTime || booking.startTime,
          endTime: newEndTime,
          gameId: newGameId || booking.gameId,
          personCount: newPersonCount,
        },
      })

      // 更新 Order
      const newVenue = await tx.venue.findUnique({ where: { id: newVenueId }, select: { name: true } })
      await tx.order.update({
        where: { id: order.id },
        data: {
          venueId: newVenueId,
          venueName: newVenue?.name || order.venueName,
          bookingTime: `${newDate} ${startTime || booking.startTime}-${newEndTime}`,
          originalAmount: newOriginalAmount,
          amount: newOriginalAmount, // 简化处理：改签后重新计算金额，不保留原折扣
          rescheduleCount: { increment: 1 },
          rescheduleFeeAmount: { increment: feeAmount },
        },
      })

      // 6. 处理补差价/退差价
      if (deltaAmount > 0) {
        if (method === 'BALANCE') {
          // 余额支付：从用户余额扣除
          if (order.userId) {
            const user = await tx.user.findUnique({ where: { id: order.userId } })
            const totalBalance = (user?.principalBalance || 0) + (user?.bonusBalance || 0)
            if (totalBalance >= deltaAmount) {
              const { principalDeduction, bonusDeduction } = deductProportional(
                { principal: user?.principalBalance || 0, bonus: user?.bonusBalance || 0 },
                deltaAmount
              )
              await tx.user.update({
                where: { id: order.userId },
                data: {
                  principalBalance: { decrement: principalDeduction },
                  bonusBalance: { decrement: bonusDeduction },
                  balance: { decrement: deltaAmount },
                },
              })
              await tx.balanceTransaction.create({
                data: {
                  userId: order.userId,
                  orderId: order.id,
                  type: 'RESCHEDULE_SURCHARGE',
                  amount: deltaAmount,
                  principalAmount: -principalDeduction,
                  bonusAmount: -bonusDeduction,
                  totalAmount: -deltaAmount,
                  remark: `改签补差价：${booking.startTime} → ${startTime || booking.startTime}`,
                },
              })
            } else {
              throw new Error('余额不足，无法支付改签差价')
            }
          }
        } else {
          // 微信/支付宝支付：不扣余额，记录支付流水（前端需先完成支付）
          await tx.payment.create({
            data: {
              orderId: order.id,
              amount: deltaAmount,
              method: method as any,
              status: 'SUCCESS',
            },
          })
        }
      } else if (deltaAmount < 0) {
        // 退差价：退到用户余额
        const refundAmount = Math.abs(deltaAmount)
        const ratio = order.principalDeduction + order.bonusDeduction > 0
          ? order.principalDeduction / (order.principalDeduction + order.bonusDeduction)
          : 1
        const refundPrincipal = Math.floor(refundAmount * ratio)
        const refundBonus = refundAmount - refundPrincipal

        if (order.userId) {
          await tx.user.update({
            where: { id: order.userId },
            data: {
              principalBalance: { increment: refundPrincipal },
              bonusBalance: { increment: refundBonus },
              balance: { increment: refundAmount },
            },
          })
          await tx.balanceTransaction.create({
            data: {
              userId: order.userId,
              orderId: order.id,
              type: 'RESCHEDULE_REFUND',
              amount: refundAmount,
              principalAmount: refundPrincipal,
              bonusAmount: refundBonus,
              totalAmount: refundAmount,
              remark: `改签退差价：${booking.startTime} → ${startTime || booking.startTime}`,
            },
          })
        }
      }

      // 改签手续费流水（无论是否有差价都记录）
      if (order.userId && feeAmount > 0) {
        await tx.balanceTransaction.create({
          data: {
            userId: order.userId,
            orderId: order.id,
            type: 'RESCHEDULE_FEE',
            amount: feeAmount,
            remark: `改签手续费（比例 ${feeRate}%）`,
          },
        })
      }
    })

    return success(res, {
      newAmount: newOriginalAmount,
      feeAmount,
      deltaAmount,
      freeRescheduleUsed,
    }, '改签成功')
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

    // 自动分配设备（签到后）
    try {
      const assigned = await assignEquipment(booking.id)
      console.log(`[checkIn] Booking ${booking.id} 自动分配设备: ${assigned.map((d) => d.name).join(', ')}`)
    } catch (e) {
      console.error(`[checkIn] Booking ${booking.id} 设备分配失败:`, e)
      // 设备分配失败不影响签到成功，仅记录日志
    }

    return success(res, null, '签到成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
