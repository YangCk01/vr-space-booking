import { Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { Prisma } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { pushNotification, pushAdminNotification } from '../controllers/notificationController'
import { startOfDay, endOfDay, parseISO } from 'date-fns'
import { assignEquipment, releaseEquipment } from '../services/equipmentService'
import { consumeBenefit } from '../services/userBenefitService'
import { generateOrderNo } from '../utils/orderNo'
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

async function getVerifyAdvanceMinutes(client: Prisma.TransactionClient | typeof prisma) {
  const setting = await client.systemSetting.findUnique({ where: { key: 'verify_advance_minutes' } })
  const raw = setting?.value as any
  return Number(raw?.value ?? raw ?? 15)
}

function getLocalBookingStartTime(date: string, startTime: string) {
  return new Date(`${date}T${startTime}:00+08:00`)
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
    const operatorName = (req as any).user?.name || personName || '用户'
    if (userId) {
      await pushNotification(
        userId,
        'BOOKING_SUCCESS',
        '预约成功',
        `您已成功预约 ${venue.name} ${date} ${startTime}-${endTime}`
      )
    }
    // 给管理员推送用户预约通知（管理员视角）
    await pushAdminNotification(
      'ADMIN_NEW_ORDER',
      '新预约',
      `${operatorName} 预约了 ${venue.name} ${date} ${startTime}-${endTime}，${personCount || 1}人`,
      'USER'
    )

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

/* ─── 改签执行（事务内）─── */
export interface RescheduleExecuteParams {
  newVenueId: string
  newDate: string
  newStartTime: string
  newEndTime: string
  newGameId: string
  newPersonCount: number
  newOriginalAmount: number
  deltaAmount: number
  feeAmount: number
  feeRate: number
  method: string
  isGroupBuy: boolean
  freeRescheduleUsed: boolean
  clearDisruption?: boolean
}

export async function executeRescheduleInTx(
  tx: Prisma.TransactionClient,
  booking: any,
  order: any,
  params: RescheduleExecuteParams
) {
  const {
    newVenueId,
    newDate,
    newStartTime,
    newEndTime,
    newGameId,
    newPersonCount,
    newOriginalAmount,
    deltaAmount,
    feeAmount,
    feeRate,
    method,
    isGroupBuy,
    freeRescheduleUsed,
    clearDisruption,
  } = params

  const queryDate = new Date(`${newDate}T00:00:00.000Z`)
  const verifyAdvanceMinutes = await getVerifyAdvanceMinutes(tx)
  const newStartAt = getLocalBookingStartTime(newDate, newStartTime)
  const minutesUntilStart = (newStartAt.getTime() - Date.now()) / (1000 * 60)
  const shouldBeReady = minutesUntilStart > 0 && minutesUntilStart <= verifyAdvanceMinutes
  const nextBookingStatus = shouldBeReady ? 'READY' : 'CONFIRMED'
  const nextOrderStatus = shouldBeReady ? 'READY_TO_VERIFY' : 'PAID'

  // 记录改签前原时间，用于 C 端展示
  const originalBookingDate = booking.date
    ? (booking.date instanceof Date ? booking.date.toISOString().slice(0, 10) : String(booking.date).slice(0, 10))
    : (order.bookingTime ? order.bookingTime.split(' ')[0] : null)
  const originalMetadata = (order.metadata as Record<string, any>) || {}

  // 1. 更新 Booking
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      venueId: newVenueId,
      date: queryDate,
      startTime: newStartTime,
      endTime: newEndTime,
      gameId: newGameId,
      personCount: newPersonCount,
      status: nextBookingStatus,
    },
  })

  // 2. 更新原消费订单（保持原订单会员折扣/优惠券优惠，避免改签后价格变回原价）
  const newVenue = await tx.venue.findUnique({ where: { id: newVenueId }, select: { name: true } })

  let orderUpdateData: any = {
    venueId: newVenueId,
    venueName: newVenue?.name || order.venueName,
    bookingTime: `${newDate} ${newStartTime}-${newEndTime}`,
    status: nextOrderStatus,
    rescheduleCount: clearDisruption ? (order.rescheduleCount || 0) : { increment: 1 },
    rescheduleFeeAmount: { increment: feeAmount },
    metadata: {
      ...originalMetadata,
      originalBookingDate,
      originalStartTime: booking.startTime || null,
      originalEndTime: booking.endTime || null,
      originalBookingTime: order.bookingTime || null,
      ...(clearDisruption ? { maintenanceDisruptionResolvedAt: new Date().toISOString() } : {}),
    },
  }

  if (clearDisruption) {
    orderUpdateData = {
      ...orderUpdateData,
      disruptionStatus: 'NONE',
      disruptionReason: null,
      disruptionSource: null,
      disruptionAt: null,
    }
  }

  if (!isGroupBuy) {
    const discountRate = order.discountRate || 100
    const couponDiscount = order.couponDiscount || 0
    const discountBase = Math.max(0, newOriginalAmount - couponDiscount)
    const newDiscountAmount = discountBase - Math.round(discountBase * discountRate / 100)
    const newFinalAmount = Math.max(0, newOriginalAmount - couponDiscount - newDiscountAmount)

    orderUpdateData = {
      ...orderUpdateData,
      originalAmount: newOriginalAmount,
      discountAmount: newDiscountAmount,
      amount: newFinalAmount,
    }
  }

  await tx.order.update({
    where: { id: order.id },
    data: orderUpdateData,
  })

  // 3. 处理场次差价
  if (deltaAmount > 0) {
    if (method !== 'BALANCE') {
      throw new Error('在线支付改签时暂不支持补差价，请使用余额支付')
    }
    if (!order.userId) {
      throw new Error('订单未关联用户，无法扣除差价')
    }
    const user = await tx.user.findUnique({ where: { id: order.userId } })
    const wallet = { principal: user?.principalBalance || 0, bonus: user?.bonusBalance || 0 }
    const totalBalance = wallet.principal + wallet.bonus
    if (totalBalance < deltaAmount) {
      throw new Error('余额不足，无法支付改签差价')
    }
    const { principalDeduction, bonusDeduction } = deductProportional(wallet, deltaAmount)
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
        remark: `改签补差价：${booking.startTime} → ${newStartTime}`,
      },
    })
  } else if (deltaAmount < 0) {
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
          remark: `改签退差价：${booking.startTime} → ${newStartTime}`,
        },
      })
    }
  }

  // 4. 改签手续费流水
  if (order.userId && feeAmount > 0) {
    await tx.balanceTransaction.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        type: 'RESCHEDULE_FEE',
        amount: feeAmount,
        remark: freeRescheduleUsed
          ? '免费改签（会员权益）'
          : `改签手续费（比例 ${feeRate}%）`,
      },
    })
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
    const isMaintenanceAffected = order.disruptionStatus === 'VENUE_MAINTENANCE'

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

    // 检查改签次数（maxCount <= 0 表示不限制）
    if (!isMaintenanceAffected && maxCount > 0 && order.rescheduleCount >= maxCount) {
      return error(res, `该订单已达到最大改签次数（${maxCount}次）`, 400)
    }

    // 检查是否超过开场后可改签时间
    if (!isMaintenanceAffected) {
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
    const newStartTime = startTime || booking.startTime
    const newEndTime = addMinutesToTime(newStartTime, duration)

    // 3. 冲突检测（排除自身）
    const queryDate = new Date(`${newDate}T00:00:00.000Z`)
    const overlapping = await prisma.booking.findMany({
      where: {
        venueId: newVenueId,
        date: queryDate,
        status: { not: 'CANCELLED' },
        id: { not: id },
        OR: [{ startTime: { lte: newEndTime }, endTime: { gt: newStartTime } }],
      },
    })

    const venue = await prisma.venue.findUnique({ where: { id: newVenueId } })
    const deviceCount = venue?.deviceCount || 1
    const pc = parseInt(newPersonCount as any) || 1

    const s1 = timeToMinutes(newStartTime)
    const e1 = timeToMinutes(newEndTime)

    if (venue?.status === 'MAINTENANCE' && venue.maintenanceStartDate && venue.maintenanceEndDate && venue.maintenanceStartTime && venue.maintenanceEndTime) {
      const maintStartStr = venue.maintenanceStartDate.toISOString().slice(0, 10)
      const maintEndStr = venue.maintenanceEndDate.toISOString().slice(0, 10)
      if (newDate >= maintStartStr && newDate <= maintEndStr) {
        const ms1 = timeToMinutes(venue.maintenanceStartTime)
        const me1 = timeToMinutes(venue.maintenanceEndTime)
        if (s1 < me1 && e1 > ms1) {
          return error(res, '该时段场地正在维护中，无法改签', 409)
        }
      }
    }

    const conflicts = overlapping.filter((b) => {
      const s2 = timeToMinutes(b.startTime)
      const e2 = timeToMinutes(b.endTime)
      return s1 < e2 && e1 > s2
    })

    const otherGameBooking = conflicts.some((b) => b.gameId && b.gameId !== newGameId)
    if (otherGameBooking) {
      return error(res, '该时段已有其他游戏预约', 400)
    }

    const sameGameBookings = conflicts.filter((b) => b.gameId === newGameId)
    const currentCount = sameGameBookings.reduce((sum, b) => sum + (b.personCount || 1), 0)

    if (currentCount + pc > deviceCount) {
      return error(res, '该时段该游戏已约满', 400)
    }

    // 4. 计算价格差异与改签费
    const isGroupBuy = !!order.groupBuyPackageId
    const newOriginalAmount = isGroupBuy
      ? (order.originalAmount || order.amount)
      : (newGame?.price || booking.game?.price || 0) * newPersonCount

    // 保持原订单折扣率/优惠券，计算改签后实际应付金额
    const discountRate = order.discountRate || 100
    const couponDiscount = order.couponDiscount || 0
    const discountBase = Math.max(0, newOriginalAmount - couponDiscount)
    const newDiscountAmount = discountBase - Math.round(discountBase * discountRate / 100)
    const newFinalAmount = isGroupBuy ? order.amount : Math.max(0, newOriginalAmount - couponDiscount - newDiscountAmount)

    const baseFeeAmount = (isGroupBuy || isMaintenanceAffected) ? 0 : Math.floor((order.originalAmount || order.amount) * feeRate / 100)
    const deltaAmount = newFinalAmount - order.amount

    // 5. 检查会员免费改签权益
    // 非维护原因改签时，先尝试用会员免费改签额度抵扣手续费；
    // 若抵扣成功，本次改签标记为已使用权益，且无论原手续费是否大于 0 都会计入免费次数。
    let feeAmount = baseFeeAmount
    let freeRescheduleUsed = false
    if (!isMaintenanceAffected && order.userId) {
      const benefitResult = await consumeBenefit(order.userId, 'FREE_RESCHEDULE')
      if (benefitResult.success) {
        feeAmount = 0
        freeRescheduleUsed = true
      }
    }

    // 6. 免费改签：直接执行
    if (feeAmount === 0) {
      await prisma.$transaction(async (tx) => {
        await executeRescheduleInTx(tx, booking, order, {
          newVenueId,
          newDate,
          newStartTime,
          newEndTime,
          newGameId,
          newPersonCount,
          newOriginalAmount,
          deltaAmount,
          feeAmount,
          feeRate,
          method,
          isGroupBuy,
          freeRescheduleUsed,
          clearDisruption: isMaintenanceAffected,
        })
      })

      // 发送改签通知
      const rescheduleVenue = await prisma.venue.findUnique({ where: { id: newVenueId }, select: { name: true } })
      const operatorName = order.user?.name || booking.personName || '用户'
      if (order.userId) {
        await pushNotification(
          order.userId,
          'BOOKING_SUCCESS',
          '改签成功',
          `您的预约已改签至 ${rescheduleVenue?.name || booking.venue?.name} ${newDate} ${newStartTime}-${newEndTime}`
        )
      }
      await pushAdminNotification(
        'ADMIN_NEW_ORDER',
        '预约已改签',
        `${operatorName} 将预约改签至 ${rescheduleVenue?.name || booking.venue?.name} ${newDate} ${newStartTime}-${newEndTime}，${newPersonCount}人`,
        'USER'
      )

      return success(res, {
        newAmount: newFinalAmount,
        feeAmount,
        deltaAmount,
        freeRescheduleUsed,
      }, '改签成功')
    }

    // 7. 收费改签：生成独立的改签费订单，不自动扣款，等待顾客选择支付方式
    if (!['BALANCE', 'WECHAT', 'ALIPAY'].includes(method)) {
      return error(res, '不支持的支付方式', 400)
    }

    // 在线支付暂不支持补差价（避免一笔订单包含非改签费金额）
    if (method !== 'BALANCE' && deltaAmount > 0) {
      return error(res, '当前改签需要补差价，请选择余额支付或联系管理员处理', 400)
    }

    const feeOrder = await prisma.$transaction(async (tx) => {
      // 幂等：同一原订单仅允许存在一个待支付的改签费订单
      const existingPending = await tx.order.findFirst({
        where: {
          parentOrderId: order.id,
          orderKind: 'FEE',
          feeType: 'RESCHEDULE_FEE',
          status: 'PENDING',
        },
      })
      if (existingPending) {
        await tx.order.delete({ where: { id: existingPending.id } })
      }

      return tx.order.create({
        data: {
          orderNo: await generateOrderNo('reschedule', tx),
          userId: order.userId,
          venueId: order.venueId,
          venueName: order.venueName,
          amount: feeAmount,
          originalAmount: feeAmount,
          discountAmount: 0,
          discountRate: 100,
          status: 'PENDING',
          expireAt: new Date(Date.now() + 30 * 60 * 1000),
          payMethod: method as any,
          orderKind: 'FEE',
          feeType: 'RESCHEDULE_FEE',
          parentOrderId: order.id,
          feeReason: '改签手续费',
          bookingTime: `${newDate} ${newStartTime}-${newEndTime}`,
          metadata: {
            rescheduleBookingId: booking.id,
            newVenueId,
            newDate,
            newStartTime,
            newEndTime,
            newGameId,
            newPersonCount,
            newOriginalAmount,
            deltaAmount,
            feeAmount,
            feeRate,
            isGroupBuy,
          } as any,
        },
      })
    })

    return success(res, {
      feeOrder: {
        id: feeOrder.id,
        orderNo: feeOrder.orderNo,
        amount: feeOrder.amount,
        status: feeOrder.status,
        payMethod: feeOrder.payMethod,
      },
      deltaAmount,
      requirePayment: true,
    }, '已生成改签费订单，请支付后完成改签')
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
          data: { status: 'COMPLETED', verifiedAt: new Date() },
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
