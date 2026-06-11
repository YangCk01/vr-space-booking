import { apiClient } from './client'

export interface SystemConfig {
  id: string
  key: string
  value: any
  category: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'
  description?: string
  updatedBy?: string
  updatedByName?: string
  updatedAt?: string
}

export async function getSystemConfigs() {
  const res = await apiClient.get('/system-configs')
  return res.data.data as SystemConfig[]
}

export async function updateSystemConfig(key: string, value: any) {
  const res = await apiClient.put(`/system-configs/${encodeURIComponent(key)}`, { value })
  return res.data.data
}
