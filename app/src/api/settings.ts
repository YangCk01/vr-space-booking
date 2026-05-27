import { apiClient } from './client'

export async function getSettings(category?: string) {
  const res = await apiClient.get('/settings', { params: { category } })
  return res.data.data
}

export async function getSetting(key: string) {
  const res = await apiClient.get(`/settings/${key}`)
  return res.data.data
}

export async function saveSetting(key: string, value: any, category?: string) {
  const res = await apiClient.post('/settings', { key, value, category })
  return res.data.data
}

export async function bulkSaveSettings(settings: Array<{ key: string; value: any; category?: string }>) {
  const res = await apiClient.post('/settings/bulk', settings)
  return res.data.data
}
