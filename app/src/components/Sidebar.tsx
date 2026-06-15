import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  ClipboardList,
  Users,
  BarChart3,
  Megaphone,
  Settings,
  Gamepad2,
  Wallet,
  Shield,
  Gift,
  FileSearch,
  ShieldCheck,
  ChevronDown,
  Table2,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { getSettings } from '@/api/settings'
import { getImageUrl } from '@/lib/imageUrl'

interface MenuItem {
  key: string
  label: string
  icon?: string
  path?: string
  children?: MenuItem[]
  roles?: string[]
}

interface MenuGroup {
  key: string
  label: string
  items: MenuItem[]
  defaultOpen?: boolean
}

const menuGroups: MenuGroup[] = [
  {
    key: 'workspace',
    label: '工作台',
    defaultOpen: true,
    items: [
      { key: 'home', label: '首页概览', icon: 'LayoutDashboard', path: '/' },
    ],
  },
  {
    key: 'operation',
    label: '预约与订单',
    defaultOpen: true,
    items: [
      { key: 'booking', label: '预约排场', icon: 'CalendarDays', path: '/booking' },
      { key: 'orders', label: '订单管理', icon: 'ClipboardList', path: '/orders' },
      { key: 'approvals', label: '审批中心', icon: 'ShieldCheck', path: '/approvals' },
    ],
  },
  {
    key: 'content',
    label: '门店与内容',
    defaultOpen: true,
    items: [
      { key: 'venues', label: '场地管理', icon: 'Building2', path: '/venues' },
      { key: 'games', label: '内容管理', icon: 'Gamepad2', path: '/games' },
    ],
  },
  {
    key: 'member',
    label: '会员与营销',
    items: [
      {
        key: 'users',
        label: '会员管理',
        icon: 'Users',
        path: '/users',
        children: [
          { key: 'campaigns', label: '营销活动', path: '/campaigns' },
          { key: 'member-marketing', label: '会员营销', path: '/member-marketing' },
        ],
      },
    ],
  },
  {
    key: 'finance-data',
    label: '财务与数据',
    items: [
      { key: 'finance', label: '财务管理', icon: 'Wallet', path: '/finance' },
      { key: 'analytics', label: '数据统计', icon: 'BarChart3', path: '/analytics' },
      {
        key: 'reports',
        label: '数据报表',
        icon: 'Table2',
        path: '/coupon-effects',
        children: [
          { key: 'coupon-effects', label: '营销效果', path: '/coupon-effects' },
          { key: 'venue-analytics', label: '场地运营', path: '/venue-analytics' },
        ],
      },
    ],
  },
  {
    key: 'system',
    label: '系统治理',
    items: [
      { key: 'accounts', label: '账号管理', icon: 'Shield', path: '/accounts' },
      { key: 'audit-logs', label: '审计日志', icon: 'FileSearch', path: '/audit-logs', roles: ['SUPER_ADMIN', 'FINANCE'] },
      { key: 'settings', label: '系统设置', icon: 'Settings', path: '/settings' },
    ],
  },
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
  FileSearch,
  ShieldCheck,
  Table2,
  Megaphone,
  Zap,
}

// 菜单项 key 到所需权限码的映射
const keyToPermission: Record<string, string | string[]> = {
  home: 'order:read',
  venues: 'venue:read',
  games: 'venue:read',
  booking: 'order:read',
  orders: 'order:read',
  approvals: ['approval:read', 'approval:request'],
  users: 'user:read',
  campaigns: 'marketing:campaign',
  analytics: 'order:read',
  finance: 'finance:read',
  accounts: 'user:read',
  'member-marketing': 'user:gift',
  'audit-logs': 'audit:read',
  reports: ['marketing:campaign', 'marketing:rule'],
  'coupon-effects': 'marketing:campaign',
  'venue-analytics': 'venue:read',
  settings: 'setting:read',
}

function isItemVisible(item: MenuItem, user: { role: string; permissions?: string[] } | null): boolean {
  if (!user) return false
  // SUPER_ADMIN 拥有所有权限
  if (user.role === 'SUPER_ADMIN') return true
  // Role-based filtering takes precedence
  if (item.roles && item.roles.length > 0) {
    return item.roles.includes(user.role)
  }
  // Permission-based filtering with key mapping
  const required = keyToPermission[item.key]
  if (required) {
    if (Array.isArray(required)) {
      return required.some((p) => user.permissions?.includes(p))
    }
    return user.permissions?.includes(required) ?? false
  }
  // Fallback: show if user has any permissions
  return (user.permissions?.length ?? 0) > 0
}

function normalizeVisibleItem(item: MenuItem, user: { role: string; permissions?: string[] } | null): MenuItem | null {
  const children = item.children?.map((child) => normalizeVisibleItem(child, user)).filter(Boolean) as MenuItem[] | undefined
  if (!isItemVisible(item, user) && (!children || children.length === 0)) return null
  return children ? { ...item, children } : item
}

function isPathInItem(item: MenuItem, pathname: string): boolean {
  return pathname === item.path || !!item.children?.some((child) => isPathInItem(child, pathname))
}

function SubMenu({
  item,
  depth = 0,
}: {
  item: MenuItem
  depth?: number
}) {
  const location = useLocation()
  const [expanded, setExpanded] = useState(() => {
    if (!item.children) return false
    return item.children.some((c) => location.pathname === c.path) || location.pathname === item.path
  })

  const Icon = item.icon ? iconMap[item.icon] : null
  const isParentActive = location.pathname === item.path || item.children?.some((c) => location.pathname === c.path)

  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          'relative flex items-center gap-1 h-11 px-3 rounded-lg transition-all duration-150 group',
          isParentActive
            ? 'bg-vrbg-active text-vraccent-primary'
            : 'text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary'
        )}
        style={{ paddingLeft: depth > 0 ? `${12 + depth * 16}px` : undefined }}
      >
        {isParentActive && !depth && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-vraccent-primary rounded-r-full"
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          />
        )}
        {item.path ? (
          <Link
            to={item.path}
            className="flex-1 flex items-center gap-3 min-w-0"
          >
            {Icon && <Icon className="w-5 h-5 shrink-0" />}
            <span className="text-vr-body-sm font-medium truncate">{item.label}</span>
          </Link>
        ) : (
          <div className="flex-1 flex items-center gap-3 min-w-0">
            {Icon && <Icon className="w-5 h-5 shrink-0" />}
            <span className="text-vr-body-sm font-medium truncate">{item.label}</span>
          </div>
        )}
        {item.children && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setExpanded((v) => !v)
            }}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
          >
            <ChevronDown
              className={cn(
                'w-4 h-4 shrink-0 transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      {item.children && expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-0.5"
        >
          {item.children.map((child) => {
            const isActive = location.pathname === child.path
            return (
              <Link
                key={child.key}
                to={child.path || '#'}
                className={cn(
                  'relative flex items-center h-10 px-3 rounded-lg transition-all duration-150 text-vr-body-sm',
                  isActive
                    ? 'bg-vrbg-active text-vraccent-primary font-medium'
                    : 'text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary'
                )}
                style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-sub-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-vraccent-primary rounded-r-full"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="w-1.5 h-1.5 rounded-full mr-2 shrink-0 bg-current opacity-40" />
                {child.label}
              </Link>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}

function MenuSection({ group }: { group: MenuGroup }) {
  const location = useLocation()
  const hasActive = group.items.some((item) => isPathInItem(item, location.pathname))
  const [expanded, setExpanded] = useState(() => group.defaultOpen || hasActive)
  const isOpen = expanded || hasActive

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-8 w-full items-center justify-between rounded-lg px-2 text-vr-caption font-semibold text-vrtext-muted transition-colors hover:bg-vrbg-elevated hover:text-vrtext-secondary"
      >
        <span>{group.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-0.5"
        >
          {group.items.map((item) => <SubMenu key={item.key} item={item} />)}
        </motion.div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { user } = useAuthStore()
  const { data: settings } = useQuery({
    queryKey: ['settings', 'sidebar-brand'],
    queryFn: () => getSettings('page'),
    enabled: !!user,
    staleTime: 60000,
  })

  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.map((item) => normalizeVisibleItem(item, user)).filter(Boolean) as MenuItem[],
    }))
    .filter((group) => group.items.length > 0)
  const brandName = settings?.venue_name?.value || 'VR大空间'
  const logo = settings?.logo?.value || ''

  return (
    <div className="h-full flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-vrborder-subtle shrink-0">
        <img src={logo ? getImageUrl(logo) : '/logo.svg'} alt="VR Logo" className="w-8 h-8 object-contain" />
        <div className="min-w-0">
          <h1 className="text-vr-h4 text-vrtext-primary font-semibold leading-tight truncate max-w-[130px]">{brandName}</h1>
          <p className="text-vr-caption text-vrtext-muted mt-0.5 truncate">预约排场系统</p>
        </div>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-2">
        {visibleGroups.map((group) => <MenuSection key={group.key} group={group} />)}
      </nav>

      {/* Bottom version */}
      <div className="px-4 py-3 border-t border-vrborder-subtle shrink-0">
        <p className="text-vr-caption text-vrtext-muted">版本 v1.0.0</p>
      </div>
    </div>
  )
}
