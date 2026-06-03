import { apiClient } from './client'

export interface TriggerRule {
  id: string
  name: string
  event: string
  conditions: Record<string, any>
  actions: Array<{ type: string; [key: string]: any }>
  enabled: boolean
  runOnce: boolean
  campaignId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTriggerRuleInput {
  name: string
  event: string
  conditions?: Record<string, any>
  actions: Array<{ type: string; [key: string]: any }>
  runOnce?: boolean
  campaignId?: string | null
}

export async function getTriggerRules(params?: {
  page?: number
  pageSize?: number
  event?: string
}) {
  const res = await apiClient.get('/trigger-rules', { params })
  return res.data
}

export async function createTriggerRule(data: CreateTriggerRuleInput) {
  const res = await apiClient.post('/trigger-rules', data)
  return res.data.data
}

export async function updateTriggerRule(id: string, data: Partial<CreateTriggerRuleInput>) {
  const res = await apiClient.put(`/trigger-rules/${id}`, data)
  return res.data.data
}

export async function deleteTriggerRule(id: string) {
  const res = await apiClient.delete(`/trigger-rules/${id}`)
  return res.data.data
}

export async function toggleTriggerRule(id: string) {
  const res = await apiClient.post(`/trigger-rules/${id}/toggle`)
  return res.data.data
}
