import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getMe, login as loginApi, register as registerApi } from '@/api/auth'
import type { LoginInput, RegisterInput, AuthUser } from '@/api/auth'
import { apiClient } from '@/api/client'
import { AUTH_LOGOUT_EVENT, bumpAuthSessionVersion, emitAuthLogout } from '@/lib/authSession'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isLoggedIn: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isValidCustomerUser(user: AuthUser | null | undefined): user is AuthUser {
  return !!user && !!user.id && !!user.phone && user.role === 'CUSTOMER'
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const authVersionRef = useRef(0)

  const clearPrivateQueries = useCallback(async () => {
    await queryClient.cancelQueries()
    queryClient.removeQueries({ queryKey: ['orders'] })
    queryClient.removeQueries({ queryKey: ['notifications'] })
    queryClient.removeQueries({ queryKey: ['my-user-coupons'] })
    queryClient.removeQueries({ queryKey: ['points-orders'] })
    queryClient.removeQueries({ queryKey: ['points-exchanges'] })
    queryClient.removeQueries({ queryKey: ['user-benefits'] })
    queryClient.removeQueries({ queryKey: ['member-public-config'] })
  }, [queryClient])

  const clearAuthState = useCallback(() => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    delete apiClient.defaults.headers.common.Authorization
    setUser(null)
    void clearPrivateQueries()
  }, [clearPrivateQueries])

  const init = useCallback(async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      setUser(null)
      setIsLoading(false)
      return
    }
    const authVersion = authVersionRef.current
    try {
      const me = await getMe()
      if (authVersionRef.current === authVersion && localStorage.getItem('accessToken') === token) {
        if (isValidCustomerUser(me)) {
          setUser(me)
        } else {
          clearAuthState()
        }
      }
    } catch {
      clearAuthState()
    } finally {
      if (authVersionRef.current === authVersion) {
        setIsLoading(false)
      }
    }
  }, [clearAuthState])

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const syncLogout = () => {
      authVersionRef.current += 1
      delete apiClient.defaults.headers.common.Authorization
      setUser(null)
      void clearPrivateQueries()
    }

    window.addEventListener(AUTH_LOGOUT_EVENT, syncLogout)
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, syncLogout)
  }, [clearPrivateQueries])

  const handleLogin = async (input: LoginInput) => {
    authVersionRef.current += 1
    bumpAuthSessionVersion()
    const res = await loginApi(input)
    localStorage.setItem('accessToken', res.accessToken)
    localStorage.setItem('refreshToken', res.refreshToken)
    const me = await getMe()
    if (isValidCustomerUser(me)) {
      setUser(me)
    } else {
      clearAuthState()
      throw new Error('登录状态异常，请重新登录')
    }
  }

  const handleRegister = async (input: RegisterInput) => {
    authVersionRef.current += 1
    bumpAuthSessionVersion()
    const res = await registerApi(input)
    localStorage.setItem('accessToken', res.accessToken)
    localStorage.setItem('refreshToken', res.refreshToken)
    const me = await getMe()
    if (isValidCustomerUser(me)) {
      setUser(me)
    } else {
      clearAuthState()
      throw new Error('登录状态异常，请重新登录')
    }
  }

  const handleLogout = () => {
    authVersionRef.current += 1
    bumpAuthSessionVersion()
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    delete apiClient.defaults.headers.common.Authorization
    setUser(null)
    void clearPrivateQueries()
    emitAuthLogout()
  }

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      setUser(null)
      void clearPrivateQueries()
      return
    }
    const authVersion = authVersionRef.current
    try {
      const me = await getMe()
      if (authVersionRef.current === authVersion && localStorage.getItem('accessToken') === token) {
        if (isValidCustomerUser(me)) {
          setUser(me)
        } else {
          clearAuthState()
        }
      }
    } catch {
      if (authVersionRef.current === authVersion) {
        clearAuthState()
      }
    }
  }, [clearAuthState, clearPrivateQueries])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
