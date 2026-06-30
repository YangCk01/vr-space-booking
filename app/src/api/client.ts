import axios from 'axios'
import { API_BASE_URL } from '@/lib/apiBase'

export const ADMIN_ACCESS_TOKEN_KEY = 'adminAccessToken'
export const ADMIN_REFRESH_TOKEN_KEY = 'adminRefreshToken'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：自动附加 Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY)
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
      const refreshToken = localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY)

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          })
          const { accessToken, refreshToken: newRefreshToken } = res.data.data
          localStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, accessToken)
          localStorage.setItem(ADMIN_REFRESH_TOKEN_KEY, newRefreshToken)
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return apiClient(originalRequest)
        } catch {
          // 刷新失败，清除登录态
          localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY)
          localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY)
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)
