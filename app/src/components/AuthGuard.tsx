import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { getMe } from '@/api/auth'

// 路由路径到所需权限码的映射（与 Sidebar keyToPermission 保持一致）
const routeToPermission: Record<string, string | string[]> = {
  '/':          'order:read',
  '/venues':    'venue:read',
  '/games':     'venue:read',
  '/booking':   'order:read',
  '/orders':    'order:read',
  '/users':     'user:read',
  '/analytics': 'order:read',
  '/venue-analytics': 'order:read',
  '/finance':   'finance:read',
  '/accounts':  'user:read',
  '/member-marketing': 'user:gift',
  '/settings':  'setting:read',
  '/audit-logs': 'audit:read',
  '/system-config': 'setting:read',
  '/roles': 'setting:write',
  '/system-health': 'setting:read',
  '/coupon-effects': 'marketing:campaign',
  '/campaigns': 'marketing:campaign',
  '/trigger-rules': 'marketing:rule',
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, setUser, setAuthenticated, setLoading, isLoading } = useAuthStore()
  const hasRedirected = useRef(false)

  // 初始化认证状态
  useEffect(() => {
    const initAuth = async () => {
      // Development bypass for testing
      if (import.meta.env.DEV && localStorage.getItem('devBypassAuth') === '1') {
        setUser({ id: '1', phone: '13800000000', name: '管理员', email: null, avatar: null, role: 'ADMIN', level: 'VIP', permissions: ['order:read','order:refund','order:verify','order:export','finance:read','finance:adjust','finance:report','user:read','user:edit','user:gift','user:export','venue:read','venue:manage','marketing:campaign','marketing:rule','setting:read','setting:write','audit:read'] })
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

  // 权限路由守卫（用 useEffect 避免渲染期调用 setState）
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user?.permissions) return
    const requiredPermission = routeToPermission[location.pathname]
    if (!requiredPermission) return

    const hasPermission = Array.isArray(requiredPermission)
      ? requiredPermission.some((p) => user.permissions!.includes(p))
      : user.permissions.includes(requiredPermission)

    if (!hasPermission && !hasRedirected.current) {
      hasRedirected.current = true
      if (location.pathname !== '/') {
        navigate('/')
      }
    }
  }, [isLoading, isAuthenticated, location.pathname, user, navigate])

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

  // 权限不足且已在首页时显示提示，避免无限循环
  const requiredPermission = routeToPermission[location.pathname]
  if (requiredPermission && user?.permissions) {
    const hasPermission = Array.isArray(requiredPermission)
      ? requiredPermission.some((p) => user.permissions!.includes(p))
      : user.permissions.includes(requiredPermission)
    if (!hasPermission) {
      return (
        <div className="min-h-[100dvh] bg-vrbg-base flex items-center justify-center">
          <div className="text-center">
            <p className="text-vr-body text-vrtext-secondary mb-2">无权访问该页面</p>
            <button
              onClick={() => navigate('/')}
              className="text-vraccent-primary hover:underline text-vr-body-sm"
            >
              返回首页
            </button>
          </div>
        </div>
      )
    }
  }

  return <>{children}</>
}
