import { apiClient } from './client'

export interface OperationLog {
  id: string
  userId: string | null
  user: {
    id: string
    name: string
    phone: string
    role: string
  } | null
  operator: string
  type: string
  content: string
  ip: string | null
  createdAt: string
}

export async function getLogs(params?: {
  type?: string
  operator?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/logs', { params })
  return res.data
}

export async function getLogTypes() {
  const res = await apiClient.get('/logs/types')
  return res.data.data
}
