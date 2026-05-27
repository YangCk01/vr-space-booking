import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { getMe } from '@/api/auth'

const routeToPermission: Record<string, string> = {
  '/':          'home',
  '/venues':    'venues',
  '/games':     'games',
  '/booking':   'booking',
  '/orders':    'orders',
  '/users':     'users',
  '/analytics': 'analytics',
  '/finance':   'finance',
  '/accounts':  'accounts',
  '/member-marketing': 'member-marketing',
  '/settings':  'settings',
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, setUser, setAuthenticated, setLoading, isLoading } = useAuthStore()

  useEffect(() => {
    const initAuth = async () => {
      // Development bypass for testing
      if (import.meta.env.DEV && localStorage.getItem('devBypassAuth') === '1') {
        setUser({ id: '1', phone: '13800000000', name: '管理员', email: null, avatar: null, role: 'ADMIN', level: 'VIP', permissions: ['home','venues','games','booking','orders','users','analytics','finance','accounts','member-marketing','settings'] })
        setAuthenticated(true)
        setLoading(false)
        return
      }

      const token = localStorage.getItem('accessToken')

      if (!token) {
        setLoading(false)
        if (location.pathname !== '/login' && location.pathname !== '/reservation') {
          navigate('/login')
        }
        return
      }

      try {
        const user = await getMe()
        setUser(user)
        setAuthenticated(true)
      } catch {
        setAuthenticated(false)
        if (location.pathname !== '/login' && location.pathname !== '/reservation') {
          navigate('/login')
        }
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [navigate, location.pathname, setUser, setAuthenticated, setLoading])

  // 登录页不需要守卫
  if (location.pathname === '/login') {
    return <>{children}</>
  }

  // 用户端预约页暂时开放
  if (location.pathname === '/reservation') {
    return <>{children}</>
  }

  // 加载中显示空白或 Loading
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-vrbg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-vraccent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // 未认证跳转登录
  if (!isAuthenticated) {
    return null
  }

  // 角色路由守卫（基于动态权限）
  const requiredPermission = routeToPermission[location.pathname]
  if (requiredPermission && user?.permissions && !user.permissions.includes(requiredPermission)) {
    navigate('/')
    return null
  }

  return <>{children}</>
}
