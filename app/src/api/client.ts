import axios, { type AxiosResponse } from 'axios'
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

interface LegacyMeta {
  requestId?: string
  timestamp?: string
  page?: number
  pageSize?: number
  total?: number
  totalPages?: number
  [key: string]: any
}

interface UnifiedResponse<T = any> {
  code: number
  message: string
  data: T
  meta?: LegacyMeta
  details?: any
}

function adaptToLegacyResponse<T = any>(response: AxiosResponse<UnifiedResponse<T> | any>): AxiosResponse<any> {
  const payload = response.data
  if (!payload || typeof payload.code !== 'number') {
    return response
  }

  const { code, message, data, meta, details } = payload

  if (code !== 0) {
    const error: any = new Error(message || '请求失败')
    error.response = {
      ...response,
      data: { code, message, details, meta },
    }
    error.config = response.config
    error.status = response.status
    throw error
  }

  let adaptedData: any = data
  let adaptedMeta: LegacyMeta | undefined = meta

  if (data && Array.isArray(data.list) && typeof data.total === 'number') {
    adaptedData = data.list
    adaptedMeta = {
      ...meta,
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
      totalPages: Math.ceil(data.total / data.pageSize),
    }
  }

  response.data = {
    success: true,
    data: adaptedData,
    message,
    meta: adaptedMeta,
  }

  return response
}

function extractMessageFromErrorData(data: any): string | undefined {
  if (!data) return undefined
  if (typeof data.message === 'string') return data.message
  if (typeof data.error === 'string') return data.error
  return undefined
}

// 响应拦截器：兼容新旧统一响应格式 + 统一错误处理 + Token 刷新
apiClient.interceptors.response.use(
  (response) => adaptToLegacyResponse(response),
  async (error) => {
    const originalRequest = error.config

    // 统一错误体：优先取服务端返回的 message
    if (error.response?.data) {
      const message = extractMessageFromErrorData(error.response.data)
      if (message && !error.message) {
        error.message = message
      }
    }

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
