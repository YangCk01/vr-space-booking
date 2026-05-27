import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  Gamepad2,
  Wallet,
  Shield,
  Gift,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

const menuItems = [
  { key: 'home', label: '首页概览', icon: 'LayoutDashboard', path: '/' },
  { key: 'venues', label: '场地管理', icon: 'Building2', path: '/venues' },
  { key: 'games', label: '内容管理', icon: 'Gamepad2', path: '/games' },
  { key: 'booking', label: '预约排场', icon: 'CalendarDays', path: '/booking' },
  { key: 'orders', label: '订单管理', icon: 'ClipboardList', path: '/orders' },
  { key: 'users', label: '会员管理', icon: 'Users', path: '/users' },
  { key: 'analytics', label: '数据统计', icon: 'BarChart3', path: '/analytics' },
  { key: 'finance', label: '财务管理', icon: 'Wallet', path: '/finance' },
  { key: 'accounts', label: '账号管理', icon: 'Shield', path: '/accounts' },
  { key: 'member-marketing', label: '会员营销', icon: 'Gift', path: '/member-marketing' },
  { key: 'settings', label: '系统设置', icon: 'Settings', path: '/settings' },
]

const iconMap: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  LayoutDashboard,
  Building2,
  CalendarDays,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  Gamepad2,
  Wallet,
  Shield,
  Gift,
}

export default function Sidebar() {
  const location = useLocation()
  const { user } = useAuthStore()

  const visibleItems = menuItems.filter((item) =>
    user?.permissions?.includes(item.key)
  )

  return (
    <div className="h-full flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-vrborder-subtle shrink-0">
        <img src="/logo.svg" alt="VR Logo" className="w-8 h-8" />
        <div>
          <h1 className="text-vr-h4 text-vrtext-primary font-semibold leading-tight">VR大空间</h1>
        </div>
      </div>

      {/* Tagline */}
      <div className="px-4 py-3 border-b border-vrborder-subtle shrink-0">
        <p className="text-vr-caption text-vrtext-tertiary">预约排场系统</p>
        <p className="text-vr-caption text-vrtext-muted mt-0.5">高效管理·便捷预约·沉浸体验</p>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = iconMap[item.icon]
          const isActive = location.pathname === item.path

          return (
            <Link
              key={item.key}
              to={item.path}
              className={cn(
                'relative flex items-center gap-3 h-11 px-3 rounded-lg transition-all duration-150 group',
                isActive
                  ? 'bg-vrbg-active text-vraccent-primary'
                  : 'text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary'
              )}
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-vraccent-primary rounded-r-full"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}

              {Icon && <Icon className="w-5 h-5 shrink-0" />}
              <span className="text-vr-body-sm font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom version */}
      <div className="px-4 py-3 border-t border-vrborder-subtle shrink-0">
        <p className="text-vr-caption text-vrtext-muted">版本 v1.0.0</p>
      </div>
    </div>
  )
}
