import cron from 'node-cron'
import { prisma } from '../utils/prisma'
import { releaseEquipment } from '../services/equipmentService'
import { pushNotification } from '../controllers/notificationController'

interface LifecycleConfig {
  verifyAdvanceMinutes: number
  lateBufferMinutes: number
  noShowDeadlineMinutes: number
  enableAutoNoShow: boolean
  allowOvertime: boolean
  overtimeMinutes: number
}

async function getLifecycleConfig(): Promise<LifecycleConfig> {
  const keys = [
    'verify_advance_minutes',
    'late_buffer_minutes',
    'no_show_deadline_minutes',
    'enable_auto_no_show',
    'booking_allow_overtime',
    'booking_overtime_minutes',
  ]
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  })
  const map: Record<string, any> = {}
  for (const s of settings) {
    const raw = s.value as any
    map[s.key] = raw?.value ?? raw
  }
  return {
    verifyAdvanceMinutes: map.verify_advance_minutes ?? 15,
    lateBufferMinutes: map.late_buffer_minutes ?? 10,
    noShowDeadlineMinutes: map.no_show_deadline_minutes ?? 15,

    enableAutoNoShow: map.enable_auto_no_show ?? true,
    allowOvertime: map.booking_allow_overtime ?? false,
    overtimeMinutes: map.booking_overtime_minutes ?? 10,
  }
}

/**
 * 计算预约的开始时间（东八区）
 * booking.date 是 UTC 午夜，startTime 是本地时间字符串如 "20:00"
 * 返回东八区对应的 Date 对象
 */
function getBookingStartTime(date: Date, startTime: string): Date {
  const dateStr = date.toISOString().split('T')[0] // '2026-06-04'
  return new Date(`${dateStr}T${startTime}:00+08:00`)
}

export async function processBookingLifecycle(now = new Date()) {
  const cfg = await getLifecycleConfig()

  // ── 1. 开场前 X 分钟：PAID → READY_TO_VERIFY，Booking → READY ──
  // 只处理开场前且状态为 CONFIRMED 的预约
  const readyBookings = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      date: {
        gte: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1小时前开始
        lte: new Date(now.getTime() + cfg.verifyAdvanceMinutes * 60 * 1000 + 24 * 60 * 60 * 1000),
      },
    },
    include: { order: true },
  })

  for (const b of readyBookings) {
    const start = getBookingStartTime(b.date, b.startTime)
    const diffMs = start.getTime() - now.getTime()
    // 开场前 verifyAdvanceMinutes 分钟内触发，开场后不触发
    if (diffMs > 0 && diffMs <= cfg.verifyAdvanceMinutes * 60 * 1000) {
      // 把订单和预约的状态更新放到同一个事务，避免两边不一致
      await prisma.$transaction(async (tx) => {
        if (b.order && b.order.status === 'PAID') {
          await tx.order.update({
            where: { id: b.order.id },
            data: { status: 'READY_TO_VERIFY' },
          })
        }
        if (b.status === 'CONFIRMED') {
          await tx.booking.update({
            where: { id: b.id },
            data: { status: 'READY' },
          })
        }
      })
    }
  }

  // ── 1.5 兜底补偿：Booking/Order READY 只允许存在于开场前核销窗口内 ──
  const inconsistentBookings = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'READY'] },
      order: { status: { in: ['PAID', 'READY_TO_VERIFY'] } },
    },
    include: { order: true },
  })
  for (const b of inconsistentBookings) {
    if (b.order) {
      const start = getBookingStartTime(b.date, b.startTime)
      const readyAt = new Date(start.getTime() - cfg.verifyAdvanceMinutes * 60 * 1000)
      const noShowDeadline = new Date(start.getTime() + cfg.noShowDeadlineMinutes * 60 * 1000)
      const inVerifyWindow = now >= readyAt && now < noShowDeadline

      if (inVerifyWindow) {
        await prisma.$transaction(async (tx) => {
          if (b.status === 'CONFIRMED') {
            await tx.booking.update({
              where: { id: b.id },
              data: { status: 'READY' },
            })
          }
          if (b.order && b.order.status === 'PAID') {
            await tx.order.update({
              where: { id: b.order.id },
              data: { status: 'READY_TO_VERIFY' },
            })
          }
        })
        console.log(`[BookingLifecycleJob] 兜底同步 Booking/Order ${b.id} → READY_TO_VERIFY`)
      } else if (!inVerifyWindow) {
        await prisma.$transaction(async (tx) => {
          if (b.status === 'READY') {
            await tx.booking.update({
              where: { id: b.id },
              data: { status: 'CONFIRMED' },
            })
          }
          if (b.order && b.order.status === 'READY_TO_VERIFY') {
            await tx.order.update({
              where: { id: b.order.id },
              data: { status: 'PAID' },
            })
          }
        })
        console.log(`[BookingLifecycleJob] 修正过早待核销 Booking ${b.id}`)
      }
    }
  }

  // ── 2. 开场时间到达：CHECKED_IN → PLAYING ──
  const playingBookings = await prisma.booking.findMany({
    where: {
      status: 'CHECKED_IN',
    },
    include: { order: true },
  })

  for (const b of playingBookings) {
    const start = getBookingStartTime(b.date, b.startTime)
    const deadline = new Date(start.getTime() + cfg.lateBufferMinutes * 60 * 1000)
    if (now >= start && now <= deadline) {
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: b.id },
          data: { status: 'PLAYING', playingStartedAt: now },
        })
        if (b.order && b.order.status !== 'COMPLETED') {
          await tx.order.update({
            where: { id: b.order.id },
            data: { status: 'PLAYING', playingStartedAt: now },
          })
        }
      })
    }
  }

  // ── 3. 游戏结束：PLAYING → COMPLETED ──
  // 使用场地/游戏自身设置的 duration，不再读取全局配置
  const completedBookings = await prisma.booking.findMany({
    where: {
      status: 'PLAYING',
    },
    include: { order: true, game: true },
  })

  for (const b of completedBookings) {
    // 没有关联游戏的预约不自动结束，需店长手动标记
    if (!b.game) continue

    const start = getBookingStartTime(b.date, b.startTime)
    const baseDuration = b.game.duration || 30
    const totalDuration = baseDuration + (cfg.allowOvertime ? cfg.overtimeMinutes : 0)
    const endTime = new Date(start.getTime() + totalDuration * 60 * 1000)
    if (now >= endTime) {
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: b.id },
          data: { status: 'COMPLETED', playingEndedAt: now },
        })
        if (b.order) {
          await tx.order.update({
            where: { id: b.order.id },
            data: { status: 'COMPLETED', playingEndedAt: now },
          })
          // 游戏结束，释放设备
          try {
            await releaseEquipment(b.id)
            console.log(`[BookingLifecycleJob] Booking ${b.id} 游戏结束，设备已释放`)
          } catch (e) {
            console.error(`[BookingLifecycleJob] Booking ${b.id} 设备释放失败:`, e)
          }
          // 触发订单完成事件（积分发放等）
          try {
            const { handleEvent } = await import('../jobs/triggerJob')
            if (b.order.userId) {
              await handleEvent('ORDER_COMPLETED', {
                userId: b.order.userId,
                orderId: b.order.id,
                amount: b.order.amount,
              })
            }
          } catch (e) {
            console.error('[BookingLifecycleJob] 触发订单完成事件失败:', e)
          }
        }
      })
    }
  }

  // ── 4. 超过最大缓冲期未到场：自动标记 NO_SHOW ──
  if (cfg.enableAutoNoShow) {
    const noShowBookings = await prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'READY'] },
        date: {
          gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2天前开始
          lte: new Date(now.getTime() + 1 * 60 * 60 * 1000),      // 1小时后结束（容错）
        },
      },
      include: { order: true },
    })

    for (const b of noShowBookings) {
      const start = getBookingStartTime(b.date, b.startTime)
      const deadline = new Date(start.getTime() + cfg.noShowDeadlineMinutes * 60 * 1000)
      if (now >= deadline) {
        await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { id: b.id },
            data: { status: 'NO_SHOW', noShowAt: now },
          })
          if (b.order && ['PAID', 'READY_TO_VERIFY'].includes(b.order.status)) {
            await tx.order.update({
              where: { id: b.order.id },
              data: {
                status: 'NO_SHOW',
                noShowAt: now,
                noShowReason: 'auto',
              },
            })
            // 爽约，释放设备
            try {
              await releaseEquipment(b.id)
              console.log(`[BookingLifecycleJob] Booking ${b.id} 爽约，设备已释放`)
            } catch (e) {
              console.error(`[BookingLifecycleJob] Booking ${b.id} 设备释放失败:`, e)
            }

            // 推送爽约通知
            if (b.order.userId) {
              const bookingDate = b.date
                ? new Date(b.date).toLocaleDateString('zh-CN')
                : ''
              pushNotification(
                b.order.userId,
                'NO_SHOW',
                '预约已标记为爽约',
                `您在 ${bookingDate} ${b.startTime} 的预约因超时未到场被系统自动标记为爽约`
              ).catch((e) => console.error('[markNoShow] 推送通知失败:', e))
            }
          }
        })
        console.log(`[BookingLifecycleJob] Booking ${b.id} 自动标记为 NO_SHOW`)
      }
    }
  }
}

/**
 * 预约生命周期定时任务
 * 每分钟执行一次：自动流转预约和订单状态
 */
export function startBookingLifecycleJob() {
  cron.schedule('* * * * *', async () => {
    try {
      await processBookingLifecycle()
    } catch (e) {
      console.error('[BookingLifecycleJob] 执行失败:', e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[BookingLifecycleJob] 预约生命周期定时任务已启动 (每分钟检查)')
}
