import cron from 'node-cron'
import { prisma } from '../utils/prisma'

function getMaintenanceEnd(venue: {
  maintenanceEndDate: Date | null
  maintenanceEndTime: string | null
}): Date | null {
  if (!venue.maintenanceEndDate || !venue.maintenanceEndTime) return null
  const end = new Date(venue.maintenanceEndDate)
  const [h, m] = venue.maintenanceEndTime.split(':').map(Number)
  end.setHours(h, m, 0, 0)
  return end
}

function isMaintenanceExpired(venue: {
  maintenanceEndDate: Date | null
  maintenanceEndTime: string | null
}): boolean {
  const end = getMaintenanceEnd(venue)
  return end !== null && new Date() > end
}

export async function restoreExpiredMaintenanceVenues() {
  const venues = await prisma.venue.findMany({
    where: {
      status: 'MAINTENANCE',
      maintenanceEndDate: { not: null },
      maintenanceEndTime: { not: null },
    },
  })

  const expiredIds = venues.filter(isMaintenanceExpired).map((v) => v.id)
  if (expiredIds.length === 0) return 0

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

  return expiredIds.length
}

export function startVenueMaintenanceJob() {
  // 每分钟检查一次，确保维护到期的场地能及时恢复营业
  cron.schedule('* * * * *', async () => {
    try {
      const restored = await restoreExpiredMaintenanceVenues()
      if (restored > 0) {
        console.log(`[Cron] Restored ${restored} expired maintenance venue(s)`)
      }
    } catch (err) {
      console.error('[Cron] Failed to restore maintenance venues:', err)
    }
  })
}
