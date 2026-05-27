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
  usedAt: string | null
  createdAt: string
  updatedAt: string
}

export async function verifyCoupon(code: string, source: string) {
  const res = await apiClient.post('/coupons/verify', { code, source })
  return res.data.data as ThirdPartyCoupon
}

export async function getMyCoupons() {
  const res = await apiClient.get('/coupons/my')
  return res.data.data as ThirdPartyCoupon[]
}

export async function useCoupon(id: string) {
  const res = await apiClient.put(`/coupons/${id}/use`)
  return res.data.data as ThirdPartyCoupon
}
