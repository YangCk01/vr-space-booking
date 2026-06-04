import cron from 'node-cron'
import { prisma } from '../utils/prisma'

interface LifecycleConfig {
  verifyAdvanceMinutes: number
  lateBufferMinutes: number
  noShowDeadlineMinutes: number
  playingDurationMinutes: number
  noShowPenaltyRate: number
  enableAutoNoShow: boolean
}

async function getLifecycleConfig(): Promise<LifecycleConfig> {
  const keys = [
    'verify_advance_minutes',
    'late_buffer_minutes',
    'no_show_deadline_minutes',
    'playing_duration_minutes',
    'no_show_penalty_rate',
    'enable_auto_no_show',
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
    playingDurationMinutes: map.playing_duration_minutes ?? 40,
    noShowPenaltyRate: map.no_show_penalty_rate ?? 100,
    enableAutoNoShow: map.enable_auto_no_show ?? true,
  }
}

function toBeijingDate(date: Date): Date {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000)
}

function getBookingStartTime(date: Date, startTime: string): Date {
  const d = new Date(date)
  const [h, m] = startTime.split(':')
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  return d
}

/**
 * 预约生命周期定时任务
 * 每分钟执行一次：自动流转预约和订单状态
 */
export function startBookingLifecycleJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date()
      const cfg = await getLifecycleConfig()

      // ── 1. 开场前 X 分钟：PAID → READY_TO_VERIFY，Booking → READY ──
      const verifyThreshold = new Date(now.getTime() + cfg.verifyAdvanceMinutes * 60 * 1000)
      const readyBookings = await prisma.booking.findMany({
        where: {
          status: 'CONFIRMED',
          date: { lte: new Date(verifyThreshold.getTime() + 24 * 60 * 60 * 1000) },
        },
        include: { order: true },
      })

      for (const b of readyBookings) {
        const start = getBookingStartTime(b.date, b.startTime)
        const diffMs = start.getTime() - now.getTime()
        if (diffMs <= cfg.verifyAdvanceMinutes * 60 * 1000 && diffMs > -cfg.lateBufferMinutes * 60 * 1000) {
          if (b.order && b.order.status === 'PAID') {
            await prisma.order.update({
              where: { id: b.order.id },
              data: { status: 'READY_TO_VERIFY' },
            })
          }
          if (b.status === 'CONFIRMED') {
            await prisma.booking.update({
              where: { id: b.id },
              data: { status: 'READY' },
            })
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
        if (now >= start) {
          await prisma.$transaction(async (tx) => {
            await tx.booking.update({
              where: { id: b.id },
              data: { status: 'PLAYING', playingStartedAt: now },
            })
            if (b.order) {
              await tx.order.update({
                where: { id: b.order.id },
                data: { status: 'PLAYING', playingStartedAt: now },
              })
            }
          })
        }
      }

      // ── 3. 游戏结束：PLAYING → COMPLETED ──
      const completedBookings = await prisma.booking.findMany({
        where: {
          status: 'PLAYING',
        },
        include: { order: true },
      })

      for (const b of completedBookings) {
        const start = getBookingStartTime(b.date, b.startTime)
        const endTime = new Date(start.getTime() + cfg.playingDurationMinutes * 60 * 1000)
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
              if (b.order && b.order.status !== 'NO_SHOW') {
                const penaltyAmount = Math.floor((b.order.amount || 0) * cfg.noShowPenaltyRate / 100)
                await tx.order.update({
                  where: { id: b.order.id },
                  data: {
                    status: 'NO_SHOW',
                    noShowAt: now,
                    noShowReason: 'auto',
                    penaltyAmount,
                  },
                })
                // 记录 No-Show 财务流水
                await tx.balanceTransaction.create({
                  data: {
                    userId: b.order.userId ?? '',
                    orderId: b.order.id,
                    type: 'NO_SHOW_PENALTY',
                    amount: penaltyAmount,
                    remark: `顾客超时未到场，系统自动标记爽约，违约金比例 ${cfg.noShowPenaltyRate}%`,
                  },
                })
              }
            })
            console.log(`[BookingLifecycleJob] Booking ${b.id} 自动标记为 NO_SHOW`)
          }
        }
      }
    } catch (e) {
      console.error('[BookingLifecycleJob] 执行失败:', e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[BookingLifecycleJob] 预约生命周期定时任务已启动 (每分钟检查)')
}
