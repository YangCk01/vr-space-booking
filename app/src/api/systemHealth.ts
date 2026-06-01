import { apiClient } from './client'

export interface HealthCheck {
  id: string
  checkType: string
  checkName: string
  status: 'PASS' | 'FAIL' | 'WARN'
  details?: string
  expectedValue?: string
  actualValue?: string
  runAt: string
}

export interface HealthStats {
  totalToday: number
  failCount: number
  passRate: number
}

export async function getHealthChecks(params?: {
  page?: number
  pageSize?: number
  checkType?: string
  startDate?: string
  endDate?: string
}) {
  const res = await apiClient.get('/health-checks', { params })
  return res.data
}

export async function getHealthStats() {
  const res = await apiClient.get('/health-checks/stats')
  return res.data.data as HealthStats
}

export async function runHealthCheck() {
  const res = await apiClient.post('/health-checks/run')
  return res.data.data
}
