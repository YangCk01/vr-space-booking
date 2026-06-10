import { apiClient } from './client'

export interface RefundTier {
  hours: number
  rate: number
  label: string
}

export interface RefundRules {
  tiers: RefundTier[]
  cancelHours: number
}

export async function getRefundRules() {
  const res = await apiClient.get('/settings/refund-rules')
  return res.data.data as RefundRules
}

export async function getBookingConfig() {
  const res = await apiClient.get('/settings/booking-config')
  return res.data.data as { advanceDays: number }
}

export interface BookingLifecycle {
  verifyAdvanceMinutes: number
  lateBufferMinutes: number
  noShowDeadlineMinutes: number
  noShowPenaltyRate: number
  rescheduleFeeRate: number
  rescheduleDeadlineHours: number
  rescheduleMaxCount: number
  rescheduleAllowAfterStart: boolean
  rescheduleAfterStartMinutes: number
}

export async function getBookingLifecycle() {
  const res = await apiClient.get('/settings/booking-lifecycle')
  return res.data.data as BookingLifecycle
}
