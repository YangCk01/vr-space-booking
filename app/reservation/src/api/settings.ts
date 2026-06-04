import { apiClient } from './client'

export interface RefundTier {
  hours: number
  rate: number
  label: string
}

export async function getRefundRules() {
  const res = await apiClient.get('/settings/refund-rules')
  return res.data.data.tiers as RefundTier[]
}
