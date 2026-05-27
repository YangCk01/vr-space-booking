import { apiClient } from './client'

export async function getDashboard(range?: string | object, startDate?: string, endDate?: string) {
  const rangeParam = typeof range === 'string' ? range : undefined
  const res = await apiClient.get('/analytics/dashboard', { params: { range: rangeParam, startDate, endDate } })
  return res.data.data
}

export async function getRevenue(range?: string) {
  const res = await apiClient.get('/analytics/revenue', { params: { range } })
  return res.data.data
}

export async function getVenueRevenueRanking(range?: string, startDate?: string, endDate?: string) {
  const res = await apiClient.get('/analytics/venue-revenue-ranking', { params: { range, startDate, endDate } })
  return res.data.data
}

export async function getTimeDistribution(range?: string, startDate?: string, endDate?: string) {
  const res = await apiClient.get('/analytics/time-distribution', { params: { range, startDate, endDate } })
  return res.data.data
}

export async function getUserGrowth(range?: string) {
  const res = await apiClient.get('/analytics/user-growth', { params: { range } })
  return res.data.data
}

export async function getPaymentMethodDistribution(range?: string, startDate?: string, endDate?: string) {
  const res = await apiClient.get('/analytics/payment-methods', { params: { range, startDate, endDate } })
  return res.data.data
}

export async function getOrderStatusDistribution(range?: string, startDate?: string, endDate?: string) {
  const res = await apiClient.get('/analytics/order-status', { params: { range, startDate, endDate } })
  return res.data.data
}

export async function getRepurchaseRate(range?: string, startDate?: string, endDate?: string) {
  const res = await apiClient.get('/analytics/repurchase-rate', { params: { range, startDate, endDate } })
  return res.data.data
}

export async function getGamePopularity(range?: string, startDate?: string, endDate?: string) {
  const res = await apiClient.get('/analytics/game-popularity', { params: { range, startDate, endDate } })
  return res.data.data
}
