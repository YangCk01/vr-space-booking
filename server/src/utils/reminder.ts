import { prisma } from './prisma'
import { pushNotification } from '../controllers/notificationController'

const INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function getVerifyAdvanceMinutes() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'verify_advance_minutes' } })
  const raw = setting?.value as any
  return Number((typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw) ?? 15)
}

async function sendBookingReminders() {
  try {
    const now = new Date()
    const verifyAdvanceMinutes = await getVerifyAdvanceMinutes()
    const windowStart = new Date(now.getTime() + verifyAdvanceMinutes * 60 * 1000)
    const windowEnd = new Date(windowStart.getTime() + INTERVAL_MS)

    // Find bookings starting within the configured verify-advance window that haven't been reminded yet
    const bookings = await prisma.booking.findMany({
      where: {
        remindSent: false,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        date: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
      include: {
        venue: { select: { name: true } },
        user: { select: { id: true, name: true } },
      },
    })

    // Filter by actual start time (startTime is a string like "14:00")
    const toRemind = bookings.filter((b) => {
      const [hours, minutes] = b.startTime.split(':').map(Number)
      const bookingDateTime = new Date(b.date)
      bookingDateTime.setHours(hours, minutes, 0, 0)
      return bookingDateTime >= windowStart && bookingDateTime <= windowEnd && b.user?.id
    })

    for (const booking of toRemind) {
      await pushNotification(
        booking.user!.id,
        'BOOKING_REMIND',
        '预约提醒',
        `您预约的 ${booking.venue.name} ${booking.startTime} 即将开始，请提前到场准备`
      )
      await prisma.booking.update({
        where: { id: booking.id },
        data: { remindSent: true },
      })
    }

    if (toRemind.length > 0) {
      console.log(`[Reminder] Sent ${toRemind.length} booking reminders`)
    }
  } catch (err) {
    console.error('[Reminder] Error sending reminders:', err)
  }
}

export function startReminderJob() {
  // Run immediately on startup, then every 5 minutes
  sendBookingReminders()
  setInterval(sendBookingReminders, INTERVAL_MS)
  console.log(`[Reminder] Booking reminder job started (interval: ${INTERVAL_MS / 1000}s)`)
}
