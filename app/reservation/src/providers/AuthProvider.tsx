import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getMe, login as loginApi, register as registerApi } from '@/api/auth'
import type { LoginInput, RegisterInput, AuthUser } from '@/api/auth'

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

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const init = useCallback(async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      setIsLoading(false)
      return
    }
    try {
      const me = await getMe()
      setUser(me)
    } catch {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    init()
  }, [init])

  const handleLogin = async (input: LoginInput) => {
    const res = await loginApi(input)
    localStorage.setItem('accessToken', res.accessToken)
    localStorage.setItem('refreshToken', res.refreshToken)
    const me = await getMe()
    setUser(me)
  }

  const handleRegister = async (input: RegisterInput) => {
    const res = await registerApi(input)
    localStorage.setItem('accessToken', res.accessToken)
    localStorage.setItem('refreshToken', res.refreshToken)
    const me = await getMe()
    setUser(me)
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    setUser(null)
  }

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) return
    try {
      const me = await getMe()
      setUser(me)
    } catch {
      // ignore
    }
  }, [])

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
