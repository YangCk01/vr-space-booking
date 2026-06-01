import { apiClient } from './client'

export interface User {
  id: string
  phone: string
  name: string
  email: string | null
  avatar: string | null
  level: string
  totalVisits: number
  totalSpent: number
  balance: number
  principalBalance: number
  bonusBalance: number
  points: number
  status: string
  registerDate: string
  lastLogin: string | null
  createdAt: string
}

export interface UserDetail extends User {
  orders?: any[]
  bookings?: any[]
}

export async function getUsers(params?: {
  level?: string
  status?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/users', { params })
  return res.data
}

export async function getUser(id: string) {
  const res = await apiClient.get(`/users/${id}`)
  return res.data.data
}

export async function createUser(data: {
  phone: string
  name: string
  password?: string
  email?: string
  level?: string
  status?: string
}) {
  const res = await apiClient.post('/users', data)
  return res.data.data
}

export async function updateUser(id: string, data: Partial<User>) {
  const res = await apiClient.put(`/users/${id}`, data)
  return res.data.data
}

export async function deleteUser(id: string) {
  const res = await apiClient.delete(`/users/${id}`)
  return res.data.data
}

export interface StaffUser {
  id: string
  name: string
  phone: string
  role: 'OPERATOR' | 'FINANCE' | 'MANAGER' | 'SUPER_ADMIN' | 'ADMIN'
  status: 'ACTIVE' | 'INACTIVE'
  managedVenues?: { id: string; name: string }[]
  createdAt: string
}

export async function getStaffList(params?: {
  search?: string
  role?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/users/staff', { params })
  return res.data
}

export async function createStaff(data: {
  name: string
  phone: string
  password?: string
  role: string
  status?: string
  venueIds?: string[]
}) {
  const res = await apiClient.post('/users/staff', data)
  return res.data.data
}

export async function updateStaff(id: string, data: Partial<StaffUser> & { password?: string; venueIds?: string[] }) {
  const res = await apiClient.put(`/users/staff/${id}`, data)
  return res.data.data
}

export async function deleteStaff(id: string) {
  const res = await apiClient.delete(`/users/staff/${id}`)
  return res.data.data
}

export async function resetStaffPassword(id: string, password: string = '123456') {
  const res = await apiClient.post(`/users/staff/${id}/reset-password`, { password })
  return res.data.data
}

export async function assignManagerVenues(id: string, venueIds: string[]) {
  const res = await apiClient.post(`/users/staff/${id}/assign-venues`, { venueIds })
  return res.data.data
}
