import { apiClient } from './client'

export interface Booking {
  id: string
  venueId: string
  venue?: { id: string; name: string; theme: string }
  gameId: string | null
  game?: { id: string; title: string } | null
  userId: string | null
  user?: { id: string; name: string; phone: string }
  type: string
  title: string
  date: string
  startTime: string
  endTime: string
  personName: string
  personPhone: string
  personCount: number
  note: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface BookingInput {
  venueId: string
  type: string
  date: string
  startTime: string
  endTime: string
  personName: string
  personPhone: string
  personCount?: number
  note?: string
  title?: string
  gameId?: string
}

export async function getBookings(params?: {
  venueId?: string
  date?: string
  startDate?: string
  endDate?: string
  type?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/bookings', { params })
  return res.data
}

export async function getCalendar(params: {
  startDate: string
  endDate: string
  venueId?: string
}) {
  const res = await apiClient.get('/bookings/calendar', { params })
  return res.data
}

export async function checkConflict(params: {
  venueId: string
  date: string
  startTime: string
  endTime: string
  gameId?: string
  excludeId?: string
}) {
  const res = await apiClient.get('/bookings/check-conflict', { params })
  return res.data.data
}

export async function createBooking(input: BookingInput) {
  const res = await apiClient.post('/bookings', input)
  return res.data.data
}

export async function updateBooking(id: string, input: Partial<BookingInput>) {
  const res = await apiClient.put(`/bookings/${id}`, input)
  return res.data.data
}

export async function cancelBooking(id: string) {
  const res = await apiClient.delete(`/bookings/${id}`)
  return res.data.data
}

export async function checkInBooking(id: string) {
  const res = await apiClient.post(`/bookings/${id}/check-in`)
  return res.data
}
