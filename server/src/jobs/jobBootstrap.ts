import cron from 'node-cron'
import { format, subDays } from 'date-fns'
import { runDailyReport } from '../controllers/financialController'
import { startBookingLifecycleJob } from './bookingLifecycleJob'
import { startBookingReminderJob } from './bookingReminderJob'
import { startCouponEffectJob } from './couponEffectJob'
import { startDataConsistencyJob } from './dataConsistencyJob'
import { startOrderTimeoutJob } from './orderTimeoutJob'
import { startReconJob } from './reconciliationJob'
import { startTriggerJob } from './triggerJob'
import { startUserTagJob } from './userTagJob'
import { startVenueMaintenanceJob } from './venueMaintenanceJob'
import { runTrackedJob } from './jobRunner'

export interface JobStartupItem {
  name: string
  start: () => void
}

function startDailyFinancialReportJob() {
  cron.schedule('5 0 * * *', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    try {
      await runTrackedJob('daily-financial-report', () => runDailyReport(yesterday))
    } catch (err) {
      console.error('[Cron] Failed to generate daily financial report:', err)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[Cron] Daily financial report job scheduled (00:05)')
}

export function buildJobStartupPlan(): JobStartupItem[] {
  return [
    { name: 'reconciliation', start: startReconJob },
    { name: 'data-consistency', start: startDataConsistencyJob },
    { name: 'user-tag', start: startUserTagJob },
    { name: 'trigger', start: startTriggerJob },
    { name: 'coupon-effect', start: startCouponEffectJob },
    { name: 'order-timeout', start: startOrderTimeoutJob },
    { name: 'booking-lifecycle', start: startBookingLifecycleJob },
    { name: 'booking-reminder', start: startBookingReminderJob },
    { name: 'venue-maintenance', start: startVenueMaintenanceJob },
    { name: 'daily-financial-report', start: startDailyFinancialReportJob },
  ]
}

export function startBackgroundJobs() {
  const started = new Set<string>()
  for (const job of buildJobStartupPlan()) {
    if (started.has(job.name)) {
      console.warn(`[JobBootstrap] skipped duplicate job registration: ${job.name}`)
      continue
    }
    started.add(job.name)
    job.start()
  }
}
