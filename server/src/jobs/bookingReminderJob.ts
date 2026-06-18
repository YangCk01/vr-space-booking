import cron from 'node-cron'
import { prisma } from '../utils/prisma'
import { pushNotification } from '../controllers/notificationController'

/**
 * 计算预约的开始时间（东八区）
 */
function getBookingStartTime(date: Date, startTime: string): Date {
  const dateStr = date.toISOString().split('T')[0]
  return new Date(`${dateStr}T${startTime}:00+08:00`)
}

/**
 * 预约提醒定时任务
 * 每5分钟执行一次：检查需要发送提醒的预约
 */
export function startBookingReminderJob() {
  // 记录已发送的提醒，避免重复发送
  const sentReminders = new Set<string>()

  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date()

      // 读取配置
      const advanceSetting = await prisma.systemSetting.findUnique({ where: { key: 'verify_advance_minutes' } })
      const raw = advanceSetting?.value as any
      const verifyAdvanceMinutes = (typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw) ?? 15

      const lateBufferSetting = await prisma.systemSetting.findUnique({ where: { key: 'late_buffer_minutes' } })
      const rawLate = lateBufferSetting?.value as any
      const lateBufferMinutes = (typeof rawLate === 'object' && rawLate !== null && 'value' in rawLate ? rawLate.value : rawLate) ?? 10

      // 查询未来24小时内的已支付/待核销预约
      const upcomingBookings = await prisma.booking.findMany({
        where: {
          status: { in: ['CONFIRMED', 'READY'] },
          date: {
            gte: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1小时前开始
            lte: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24小时后结束
          },
          order: { status: { in: ['PAID', 'READY_TO_VERIFY'] } },
        },
        include: {
          order: true,
          user: true,
          venue: true,
        },
      })

      for (const booking of upcomingBookings) {
        if (!booking.userId || !booking.order) continue

        const start = getBookingStartTime(booking.date, booking.startTime)
        const diffMs = start.getTime() - now.getTime()
        const diffMinutes = diffMs / (1000 * 60)
        const diffHours = diffMs / (1000 * 60 * 60)

        // 使用精确类型的 reminder key，避免不同类型提醒冲突
        const key2h = `${booking.id}-2h`
        const keyVerifyAdvance = `${booking.id}-verify-advance`
        const keyUrgent = `${booking.id}-urgent`

        // 场景1：开场前2小时提醒
        if (diffMinutes <= 120 && diffMinutes > 115) {
          if (sentReminders.has(key2h)) continue
          await pushNotification(
            booking.userId,
            'BOOKING_REMIND',
            '场次即将开始',
            `您预约的 ${booking.venue?.name || 'VR体验'} ${booking.startTime} 场次将在2小时后开始，请提前${verifyAdvanceMinutes}分钟到场准备。`
          )
          sentReminders.add(key2h)
          console.log(`[ReminderJob] 发送2小时提醒: ${booking.id}`)
        }

        // 场景2：开场前核销提前量提醒（进入待核销阶段）
        else if (diffMinutes <= verifyAdvanceMinutes && diffMinutes > verifyAdvanceMinutes - 5) {
          if (sentReminders.has(keyVerifyAdvance)) continue
          await pushNotification(
            booking.userId,
            'BOOKING_VERIFY',
            '场次即将开始',
            `您预约的 ${booking.venue?.name || 'VR体验'} ${booking.startTime} 场次即将开始，请尽快到场签到入场。`
          )
          sentReminders.add(keyVerifyAdvance)
          console.log(`[ReminderJob] 发送开场前提醒: ${booking.id}`)
        }

        // 场景3：预约时距开场不足2小时（立即发送提醒）
        else if (diffMinutes > 0 && diffMinutes <= 120 && booking.order.createdAt) {
          const orderAgeMinutes = (now.getTime() - new Date(booking.order.createdAt).getTime()) / (1000 * 60)
          // 订单创建后5分钟内且距开场不足2小时
          if (orderAgeMinutes <= 5) {
            if (sentReminders.has(keyUrgent)) continue
            const hours = Math.floor(diffMinutes / 60)
            const mins = Math.floor(diffMinutes % 60)
            const timeText = hours > 0 ? `${hours}小时${mins}分` : `${mins}分钟`
            await pushNotification(
              booking.userId,
              'BOOKING_URGENT',
              '预约成功，场次临近',
              `您预约的 ${booking.venue?.name || 'VR体验'} ${booking.startTime} 场次距开场仅剩${timeText}，请务必提前${verifyAdvanceMinutes}分钟到达，迟到将导致游戏时间缩短或无法入场。`
            )
            sentReminders.add(keyUrgent)
            console.log(`[ReminderJob] 发送紧急提醒: ${booking.id}`)
          }
        }
      }

      // ── 场景4：开场后迟到提醒 ──
      // 查询状态为 READY（待入场）且开场时间在最近5分钟内的预约
      const lateBookings = await prisma.booking.findMany({
        where: {
          status: 'READY',
          date: {
            gte: new Date(now.getTime() - 1 * 60 * 60 * 1000),
            lte: new Date(now.getTime() + 1 * 60 * 60 * 1000),
          },
          order: { status: 'READY_TO_VERIFY' },
        },
        include: {
          order: true,
          user: true,
          venue: true,
        },
      })

      for (const booking of lateBookings) {
        if (!booking.userId || !booking.order) continue
        const start = getBookingStartTime(booking.date, booking.startTime)
        const diffMs = now.getTime() - start.getTime()
        const diffMinutes = diffMs / (1000 * 60)
        const keyLate = `${booking.id}-late`

        // 开场后 0~5 分钟内发送迟到提醒
        if (diffMinutes >= 0 && diffMinutes <= 5) {
          if (sentReminders.has(keyLate)) continue
          await pushNotification(
            booking.userId,
            'BOOKING_LATE',
            '场次已开始',
            `您的场次已开始，请在 ${lateBufferMinutes} 分钟内到场，超时将无法入场。`
          )
          sentReminders.add(keyLate)
          console.log(`[ReminderJob] 发送开场后迟到提醒: ${booking.id}`)
        }
      }

      // 清理已过期超过24小时的提醒记录，防止内存泄漏
      if (sentReminders.size > 10000) {
        sentReminders.clear()
      }
    } catch (e) {
      console.error('[ReminderJob] 执行失败:', e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[ReminderJob] 预约提醒定时任务已启动 (每5分钟检查)')
}
