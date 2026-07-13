import { apiClient } from './client'

export interface User {
  id: string
  phone: string
  password?: string
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
  userGroup?: string | null
  address?: string | null
  idCard?: string | null
  birthday: string | null
  registerDate: string
  lastLogin: string | null
  createdAt: string
}

export interface UserDetail extends User {
  orders?: unknown[]
  bookings?: unknown[]
}

export async function getUsers(params?: {
  level?: string
  status?: string
  search?: string
  searchType?: 'all' | 'uid' | 'phone' | 'name'
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
  birthday?: string
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
  roles?: {
    id: string
    name: string
    description?: string | null
    isSystem: boolean
  }[]
  status: 'ACTIVE' | 'INACTIVE'
  managedVenues?: { id: string; name: string }[]
  createdAt: string
}

export async function getStaffList(params?: {
  search?: string
  role?: string
  roleId?: string
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
  roleIds?: string[]
  status?: string
  venueIds?: string[]
}) {
  const res = await apiClient.post('/users/staff', data)
  return res.data.data
}

export async function updateStaff(id: string, data: Partial<StaffUser> & { password?: string; venueIds?: string[]; roleIds?: string[] }) {
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

export async function batchGiftPoints(userIds: string[], points: number, reason: string, remark?: string) {
  const res = await apiClient.post('/gift/batch-gift-points', { userIds, points, reason, remark })
  return res.data
}

export async function batchGiftCoupon(userIds: string[], couponData: {
  name: string
  type: string
  discountRate?: number
  validDays: number
  source?: string
  giftReason?: string
  giftRemark?: string
}) {
  const { name, type, discountRate, validDays, giftReason, giftRemark } = couponData
  const res = await apiClient.post('/gift/batch-gift-coupon', {
    userIds,
    couponConfig: {
      name,
      type,
      discountRate,
      validityDays: validDays,
    },
    reason: giftReason,
    remark: giftRemark,
  })
  return res.data
}
