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

export interface MemberGiftApprovalPolicy {
  enabled: boolean
  requirePointsGiftApproval: boolean
  requireCouponGiftApproval: boolean
  forceExperienceCouponApproval: boolean
  pointsThreshold: number
  batchSizeThreshold: number
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

export async function getMemberGiftApprovalPolicy() {
  const res = await apiClient.get('/gift/approval-policy')
  return res.data.data as MemberGiftApprovalPolicy
}

export async function updateMemberGiftApprovalPolicy(payload: MemberGiftApprovalPolicy) {
  const res = await apiClient.put('/gift/approval-policy', payload)
  return res.data.data as MemberGiftApprovalPolicy
}
