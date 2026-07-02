import { apiClient } from './client'

export interface RechargeConfig {
  amount: number
  bonus: number
  total: number
  level: string
}

export interface RechargeRecord {
  id: string
  userId: string
  venueId: string | null
  amount: number
  bonus: number
  total: number
  payMethod: string
  status: string
  paidAt: string | null
  createdAt: string
}

export async function getRechargeConfig() {
  const res = await apiClient.get('/recharges/config')
  return res.data.data as RechargeConfig[]
}

export async function staffRecharge(data: {
  userId: string
  amount: number
  venueId: string
  payMethod: 'CASH' | 'CARD'
  remark?: string
}) {
  const res = await apiClient.post('/recharges/staff', data)
  return res.data.data as RechargeRecord
}
