import { apiClient } from './client'

export interface SystemConfig {
  id: string
  key: string
  value: string
  category: string
  label: string
  type: 'text' | 'number' | 'boolean'
  description?: string
  updatedBy?: string
  updatedByName?: string
  updatedAt?: string
}

export async function getSystemConfigs() {
  const res = await apiClient.get('/system-configs')
  return res.data.data as SystemConfig[]
}

export async function updateSystemConfig(key: string, value: string) {
  const res = await apiClient.put('/system-configs', { key, value })
  return res.data.data
}
