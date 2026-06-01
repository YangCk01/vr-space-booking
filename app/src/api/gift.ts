import { apiClient } from './client'

export interface GiftPointsPayload {
  userId: string
  points: number
  reason: 'COMPLAINT' | 'EQUIPMENT_FAILURE' | 'ENTERTAIN_CLIENT' | 'OTHER'
  remark?: string
}

export interface GiftCouponPayload {
  userId: string
  name: string
  type: 'EXPERIENCE_FREE' | 'DISCOUNT'
  discountRate?: number
  validityDays: number
  reason: 'COMPLAINT' | 'EQUIPMENT_FAILURE' | 'ENTERTAIN_CLIENT' | 'OTHER'
  remark?: string
}

export async function giftPoints(payload: GiftPointsPayload) {
  const res = await apiClient.post('/gift/points', payload)
  return res.data
}

export async function giftCoupon(payload: GiftCouponPayload) {
  const res = await apiClient.post('/gift/coupon', payload)
  return res.data
}

export async function getPointsGiftRecords(params?: {
  userId?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/gift/points-records', { params })
  return res.data
}

export async function getCouponGiftRecords(params?: {
  userId?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/gift/coupon-records', { params })
  return res.data
}
