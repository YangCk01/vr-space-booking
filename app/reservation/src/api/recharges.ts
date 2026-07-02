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

export async function createRecharge(data: { amount: number; payMethod: 'CASH' | 'CARD'; venueId: string }) {
  const res = await apiClient.post('/recharges', data)
  return res.data.data as RechargeRecord
}

export async function confirmRecharge(rechargeId: string) {
  const res = await apiClient.post('/recharges/confirm', { rechargeId })
  return res.data.data as RechargeRecord
}

export async function getRechargeList() {
  const res = await apiClient.get('/recharges')
  return res.data.data as RechargeRecord[]
}

export async function getMyRechargeList() {
  const res = await apiClient.get('/recharges/my')
  return res.data.data as RechargeRecord[]
}

export interface BalanceTransaction {
  id: string
  userId: string
  type: string
  amount: number
  principalAmount: number | null
  bonusAmount: number | null
  pointsAmount: number | null
  totalAmount: number | null
  remark: string
  createdAt: string
}

export async function getMyTransactions() {
  const res = await apiClient.get('/recharges/my-transactions')
  return res.data.data as BalanceTransaction[]
}
