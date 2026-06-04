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
