import { apiClient } from './client'

export interface LoginInput {
  phone: string
  password: string
}

export interface RegisterInput {
  phone: string
  password: string
  name: string
}

export interface AuthUser {
  id: string
  phone: string
  name: string
  email: string | null
  avatar: string | null
  role: string
  level: string
  balance: number          // 总余额 = principal + bonus（兼容）
  principalBalance: number // 本金钱包
  bonusBalance: number     // 赠送钱包
  points: number
  totalSpent: number
}

export interface AuthResult {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const res = await apiClient.post('/auth/login', input)
  return res.data.data
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const res = await apiClient.post('/auth/register', input)
  return res.data.data
}

export async function getMe(): Promise<AuthUser> {
  const res = await apiClient.get('/auth/me')
  return res.data.data
}

export async function updateProfile(data: { name?: string; avatar?: string; email?: string }) {
  const res = await apiClient.put('/auth/profile', data)
  return res.data.data as AuthUser
}

export async function updatePhone(newPhone: string, password: string) {
  const res = await apiClient.put('/auth/phone', { newPhone, password })
  return res.data.data as AuthUser
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const res = await apiClient.post('/auth/change-password', { oldPassword, newPassword })
  return res.data
}

export async function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post('/upload/avatars', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.data as { url: string; filename: string; size: number }
}
