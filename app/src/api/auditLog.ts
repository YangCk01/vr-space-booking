import { apiClient } from './client'

export interface AuditLog {
  id: string
  operatorId: string
  operatorName: string
  action: string
  targetType: string
  targetId: string
  targetLabel?: string
  beforeValue?: Record<string, any>
  afterValue?: Record<string, any>
  summary: string
  reason?: string
  createdAt: string
}

export async function getAuditLogs(params?: {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  operatorId?: string
  action?: string
  targetType?: string
}) {
  const res = await apiClient.get('/audit-logs', { params })
  return res.data
}

export async function getAuditLogActions() {
  const res = await apiClient.get('/audit-logs/actions')
  return res.data.data as string[]
}

export async function getAuditLogTargetTypes() {
  const res = await apiClient.get('/audit-logs/target-types')
  return res.data.data as string[]
}
