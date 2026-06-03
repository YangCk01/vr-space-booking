import { apiClient } from './client'

export interface CouponEffectReport {
  date: string
  couponType: string
  source: string
  giftedCount: number
  usedCount: number
  expiredCount: number
  totalOrderAmount: number
  avgOrderAmount: number
  couponDiscountCost: number
  reorderUserCount: number
  reorderAmount: number
}

export interface CouponEffectSummary {
  totalGifted: number
  totalUsed: number
  useRate: number
  totalDiscountCost: number
  pointsTotal: number
  pointsRecipients: number
}

export async function getCouponEffects(params?: {
  startDate?: string
  endDate?: string
  couponType?: string
}) {
  const res = await apiClient.get('/coupon-effects', { params: { ...params, pageSize: 1000 } })
  return res.data.data as CouponEffectReport[]
}

export async function getCouponEffectSummary(params?: {
  startDate?: string
  endDate?: string
}) {
  const res = await apiClient.get('/coupon-effects/summary', { params })
  return res.data.data as CouponEffectSummary
}
