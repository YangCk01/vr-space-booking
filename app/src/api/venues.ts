import { apiClient } from './client'

export interface Venue {
  id: string
  name: string
  theme: string
  status: string
  area: number
  capacity: number
  pricePerHour: number
  deviceCount: number
  image: string | null
  description: string | null
  address: string | null
  phone: string | null
  openTime: string | null
  closeTime: string | null
  maintenanceStartDate: string | null
  maintenanceEndDate: string | null
  maintenanceStartTime: string | null
  maintenanceEndTime: string | null
  createdAt: string
  updatedAt: string
}

export interface VenueInput {
  name: string
  theme: string
  status?: string
  area: number
  capacity: number
  image?: string
  description?: string
  address?: string
  phone?: string
  openTime?: string
  closeTime?: string
}

export async function getVenues(params?: { status?: string; search?: string; page?: number; pageSize?: number }) {
  const res = await apiClient.get('/venues', { params })
  return res.data
}

export async function getVenue(id: string) {
  const res = await apiClient.get(`/venues/${id}`)
  return res.data.data
}

export async function createVenue(input: VenueInput) {
  const res = await apiClient.post('/venues', input)
  return res.data.data
}

export async function updateVenue(id: string, input: Partial<VenueInput>) {
  const res = await apiClient.put(`/venues/${id}`, input)
  return res.data.data
}

export async function deleteVenue(id: string) {
  const res = await apiClient.delete(`/venues/${id}`)
  return res.data.data
}

export async function batchDeleteVenues(ids: string[]) {
  const res = await apiClient.post('/venues/batch-delete', { ids })
  return res.data
}

export async function batchUpdateVenueStatus(ids: string[], status: string) {
  const res = await apiClient.post('/venues/batch-status', { ids, status })
  return res.data
}
