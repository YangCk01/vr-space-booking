import { apiClient } from './client'

export interface OccupancyData {
  date: string
  hour: number
  occupancyRate: number
  bookings: number
  totalPlayers: number
}

export interface GamePerformance {
  gameName: string
  bookingCount: number
  avgOccupancyRate: number
  repurchaseRate: number
}

export async function getVenueOccupancy(params: {
  venueId?: string
  startDate: string
  endDate: string
}) {
  const res = await apiClient.get('/analytics/venue-occupancy', { params })
  return res.data.data as OccupancyData[]
}

export async function getGamePerformance(params: {
  startDate: string
  endDate: string
  venueId?: string
}) {
  const res = await apiClient.get('/analytics/game-performance', { params })
  return res.data.data as GamePerformance[]
}
