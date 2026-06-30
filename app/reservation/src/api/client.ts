import axios from 'axios'
import { API_BASE_HOST, API_BASE_URL } from '@/lib/apiBase'
import { readAuthSessionVersion } from '@/lib/authSession'

export const CUSTOMER_ACCESS_TOKEN_KEY = 'customerAccessToken'
export const CUSTOMER_REFRESH_TOKEN_KEY = 'customerRefreshToken'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/** 将相对路径的图片 URL 转换为完整 URL */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `${API_BASE_HOST}${url}`
  return url
}

// 请求拦截器：自动附加 Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(CUSTOMER_ACCESS_TOKEN_KEY)
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：统一错误处理 + Token 刷新
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Token 过期，尝试刷新
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem(CUSTOMER_REFRESH_TOKEN_KEY)
      const authSessionVersion = readAuthSessionVersion()

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          })
          const { accessToken, refreshToken: newRefreshToken } = res.data.data
          if (
            readAuthSessionVersion() !== authSessionVersion ||
            localStorage.getItem(CUSTOMER_REFRESH_TOKEN_KEY) !== refreshToken
          ) {
            return Promise.reject(error)
          }
          localStorage.setItem(CUSTOMER_ACCESS_TOKEN_KEY, accessToken)
          localStorage.setItem(CUSTOMER_REFRESH_TOKEN_KEY, newRefreshToken)
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return apiClient(originalRequest)
        } catch {
          // 刷新失败，清除登录态
          localStorage.removeItem(CUSTOMER_ACCESS_TOKEN_KEY)
          localStorage.removeItem(CUSTOMER_REFRESH_TOKEN_KEY)
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)
