import { apiClient } from './client'

export interface LoginInput {
  phone: string
  password: string
}

export interface LoginResult {
  user: {
    id: string
    phone: string
    name: string
    email: string | null
    avatar: string | null
    role: string
    level: string
  }
  accessToken: string
  refreshToken: string
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const res = await apiClient.post('/auth/admin-login', input)
  return res.data.data
}

export async function getMe() {
  const res = await apiClient.get('/auth/me')
  return res.data.data
}

export async function logout() {
  await apiClient.post('/auth/logout')
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

export async function changePassword(input: { oldPassword: string; newPassword: string }) {
  const res = await apiClient.post('/auth/change-password', input)
  return res.data
}
