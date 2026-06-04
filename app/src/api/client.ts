import axios from 'axios'

// 根据当前端口自动判断 API 地址
// 5173/5174 = 测试环境 (4000)
// 5175/5176 = 开发环境 (4001)
const currentPort = window.location.port
const isDevEnv = currentPort === '5175' || currentPort === '5176'
const defaultApiUrl = isDevEnv
  ? 'http://localhost:4001/api'
  : 'http://192.168.2.200:4000/api'

const API_BASE_URL = import.meta.env.VITE_API_URL || defaultApiUrl

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
    const token = localStorage.getItem('accessToken')
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
      const refreshToken = localStorage.getItem('refreshToken')

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          })
          const { accessToken, refreshToken: newRefreshToken } = res.data.data
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', newRefreshToken)
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return apiClient(originalRequest)
        } catch {
          // 刷新失败，清除登录态
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)
