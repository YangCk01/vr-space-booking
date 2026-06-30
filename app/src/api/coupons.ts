import { apiClient } from './client'

export interface ThirdPartyCoupon {
  id: string
  code: string
  source: 'MEITUAN' | 'DOUYIN' | 'DIANPING'
  name: string
  description: string | null
  discountAmount: number
  minOrderAmount: number
  status: 'UNUSED' | 'USED' | 'EXPIRED'
  userId: string | null
  user?: { id: string; name: string | null; phone: string }
  createdAt: string
}

export interface ThirdPartyPlatformOverview {
  summary: {
    total: number
    unused: number
    used: number
    expired: number
    totalDiscountAmount: number
    usedDiscountAmount: number
  }
  platforms: {
    source: 'MEITUAN' | 'DOUYIN' | 'DIANPING'
    label: string
    total: number
    unused: number
    used: number
    expired: number
    locked: number
    userCount: number
    totalDiscountAmount: number
    usedDiscountAmount: number
    lastSyncedAt: string
  }[]
  recentCoupons: ThirdPartyCoupon[]
}

export async function lookupThirdPartyCoupon(code: string) {
  const res = await apiClient.get('/coupons/lookup', { params: { code } })
  return res.data.data as ThirdPartyCoupon
}

export async function getThirdPartyPlatformOverview() {
  const res = await apiClient.get('/coupons/admin/overview')
  return res.data.data as ThirdPartyPlatformOverview
}
