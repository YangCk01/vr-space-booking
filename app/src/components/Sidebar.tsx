import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
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
  Package,
  Scale,
  Crown,
  Ticket,
  Handshake,
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
    items: [{ key: 'home', label: '首页概览', icon: 'LayoutDashboard', path: '/' }],
  },
  {
    key: 'operation',
    label: '预约与订单',
    defaultOpen: true,
    items: [
      { key: 'booking', label: '预约排场', icon: 'CalendarDays', path: '/booking' },
      { key: 'orders', label: '订单管理', icon: 'ClipboardList', path: '/orders' },
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
      { key: 'member-center', label: '会员中心', icon: 'Crown', path: '/member-center' },
      { key: 'campaigns', label: '营销活动', icon: 'Megaphone', path: '/campaigns' },
      { key: 'member-marketing', label: '会员营销', icon: 'Gift', path: '/member-marketing' },
      { key: 'group-buys', label: '团购套餐', icon: 'Package', path: '/group-buys' },
      { key: 'coupon-effects', label: '营销效果', icon: 'Ticket', path: '/coupon-effects' },
      { key: 'venue-analytics', label: '场地运营', icon: 'BarChart3', path: '/venue-analytics' },
      { key: 'platforms', label: '平台管理', icon: 'Handshake', path: '/platforms' },
    ],
  },
  {
    key: 'finance-data',
    label: '财务与数据',
    items: [
      { key: 'finance', label: '财务管理', icon: 'Wallet', path: '/finance' },
      { key: 'compliance', label: '业财合规控制台', icon: 'Scale', path: '/finance/compliance' },
      { key: 'approvals', label: '审批中心', icon: 'ShieldCheck', path: '/approvals' },
      { key: 'analytics', label: '数据统计', icon: 'BarChart3', path: '/analytics' },
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
  Scale,
  Table2,
  Megaphone,
  Zap,
  Package,
  Crown,
  Ticket,
  Handshake,
}

const keyToPermission: Record<string, string | string[]> = {
  home: 'order:read',
  venues: 'venue:read',
  games: 'content:read',
  'group-buys': 'group-buy:read',
  booking: 'booking:read',
  orders: 'order:read',
  approvals: ['approval:read', 'approval:request'],
  'member-center': 'user:read',
  users: 'user:read',
  campaigns: 'marketing:campaign',
  analytics: ['finance:report', 'order:read', 'venue:read'],
  finance: 'finance:read',
  compliance: 'finance:read',
  accounts: 'account:read',
  'member-marketing': 'member:marketing',
  'audit-logs': 'audit:read',
  'coupon-effects': 'marketing:campaign',
  'venue-analytics': ['finance:report', 'venue:read'],
  platforms: 'marketing:campaign',
  settings: 'setting:read',
}

function isItemVisible(item: MenuItem, user: { role: string; permissions?: string[] } | null): boolean {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true
  if (item.roles && item.roles.length > 0) return item.roles.includes(user.role)
  const required = keyToPermission[item.key]
  if (required) {
    if (Array.isArray(required)) return required.some((p) => user.permissions?.includes(p))
    return user.permissions?.includes(required) ?? false
  }
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

function findActiveKey(groups: MenuGroup[], pathname: string): string | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (pathname === item.path) return item.key
      if (item.children) {
        for (const child of item.children) {
          if (pathname === child.path) return child.key
          if (child.children) {
            for (const grand of child.children) {
              if (pathname === grand.path) return grand.key
            }
          }
        }
      }
    }
  }
  return null
}

const MotionLink = motion.create(Link)

function SidebarLeaf({
  item,
  depth = 0,
  activeKey,
  hoverKey,
  onHover,
}: {
  item: MenuItem
  depth?: number
  activeKey: string | null
  hoverKey: string | null
  onHover: (key: string | null) => void
}) {
  const isActive = activeKey === item.key

  return (
    <MotionLink
      to={item.path || '#'}
      data-testid={`nav-${item.key}`}
      className={cn(
        'relative z-0 flex items-center h-9 mx-1 rounded-full text-sm transition-colors duration-200 group',
        isActive
          ? 'text-vraccent-primary font-medium bg-vrbg-hover'
          : 'text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-hover'
      )}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      whileHover={isActive ? undefined : { x: 8 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onMouseEnter={() => onHover(item.key)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-2 shrink-0 bg-current opacity-40" />
      <span className={cn('truncate transition-colors duration-200', !isActive && 'group-hover:text-vraccent-primary')}>
        {item.label}
      </span>
    </MotionLink>
  )
}

function SidebarItem({
  item,
  depth = 0,
  activeKey,
  hoverKey,
  onHover,
}: {
  item: MenuItem
  depth?: number
  activeKey: string | null
  hoverKey: string | null
  onHover: (key: string | null) => void
}) {
  const location = useLocation()
  const [expanded, setExpanded] = useState(() => {
    if (!item.children) return false
    return item.children.some((c) => location.pathname === c.path) || location.pathname === item.path
  })

  const Icon = item.icon ? iconMap[item.icon] : null
  const isActive = activeKey === item.key

  return (
    <div className="space-y-0.5">
      <motion.div
        className={cn(
          'relative z-0 flex items-center gap-1 h-10 px-2 rounded-full transition-colors duration-200 group cursor-pointer',
          depth > 0 ? 'h-8' : ''
        )}
        onMouseEnter={() => onHover(item.key)}
        onMouseLeave={() => onHover(null)}
        style={{ paddingLeft: depth > 0 ? `${8 + depth * 14}px` : undefined }}
        whileHover={isActive ? undefined : { x: 8 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {isActive ? (
          <motion.div
            layoutId="nav-bg"
            className="absolute inset-x-1 inset-y-0.5 rounded-full -z-10 bg-gradient-to-r from-vraccent-primary to-vraccent-secondary shadow-[0_10px_22px_rgba(59,130,246,0.22)]"
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
          />
        ) : (
          <div className="absolute inset-x-1 inset-y-0.5 rounded-full -z-10 bg-vrbg-hover opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        )}
        {isActive && (
          <motion.div
            layoutId="sidebar-active-dot"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white/80 rounded-r-full"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <div className="relative z-10 flex-1 flex items-center gap-3 min-w-0 py-2 px-2">
          {item.path ? (
            <Link to={item.path} data-testid={`nav-${item.key}`} className="flex-1 flex items-center gap-3 min-w-0">
              {Icon && (
                <Icon
                  className={cn(
                    'w-[18px] h-[18px] shrink-0 transition-colors duration-200',
                    isActive ? 'text-white' : 'text-vrtext-secondary group-hover:text-vraccent-primary'
                  )}
                />
              )}
              <span
                className={cn(
                  'text-sm font-medium truncate transition-colors duration-200',
                  isActive ? 'text-white' : 'text-vrtext-secondary group-hover:text-vraccent-primary'
                )}
              >
                {item.label}
              </span>
            </Link>
          ) : (
            <div className="flex-1 flex items-center gap-3 min-w-0">
              {Icon && (
                <Icon
                  className={cn(
                    'w-[18px] h-[18px] shrink-0 transition-colors duration-200',
                    isActive ? 'text-white' : 'text-vrtext-secondary group-hover:text-vraccent-primary'
                  )}
                />
              )}
              <span
                className={cn(
                  'text-sm font-medium truncate transition-colors duration-200',
                  isActive ? 'text-white' : 'text-vrtext-secondary group-hover:text-vraccent-primary'
                )}
              >
                {item.label}
              </span>
            </div>
          )}
        </div>
        {item.children && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setExpanded((v) => !v)
            }}
            className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
          >
            <ChevronDown
              className={cn(
                'w-4 h-4 shrink-0 transition-transform duration-200',
                isActive ? 'text-white/80' : 'text-vrtext-muted',
                expanded && 'rotate-180'
              )}
            />
          </button>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {item.children && expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 pt-0.5">
              {item.children.map((child) =>
                child.children ? (
                  <SidebarItem
                    key={child.key}
                    item={child}
                    depth={depth + 1}
                    activeKey={activeKey}
                    hoverKey={hoverKey}
                    onHover={onHover}
                  />
                ) : (
                  <SidebarLeaf
                    key={child.key}
                    item={child}
                    depth={depth + 1}
                    activeKey={activeKey}
                    hoverKey={hoverKey}
                    onHover={onHover}
                  />
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuSection({
  group,
  activeKey,
  hoverKey,
  onHover,
}: {
  group: MenuGroup
  activeKey: string | null
  hoverKey: string | null
  onHover: (key: string | null) => void
}) {
  const location = useLocation()
  const hasActive = group.items.some((item) => isPathInItem(item, location.pathname))
  const [expanded, setExpanded] = useState(() => group.defaultOpen || hasActive)
  const isOpen = expanded || hasActive
  const groupHoverKey = `group:${group.key}`
  const isGroupHover = hoverKey === groupHoverKey

  return (
    <div className="space-y-1">
      <button
        type="button"
        data-testid={`nav-group-${group.key}`}
        onClick={() => setExpanded((v) => !v)}
        className="relative z-0 flex h-8 w-full items-center justify-between rounded-lg px-2 text-xs font-semibold text-vrtext-muted transition-colors"
        onMouseEnter={() => onHover(groupHoverKey)}
        onMouseLeave={() => onHover(null)}
      >
        {isGroupHover && (
          <motion.div
            layoutId="group-hover"
            className="absolute inset-0 rounded-lg bg-vrbg-hover -z-10"
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
          />
        )}
        <span>{group.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarItem key={item.key} item={item} activeKey={activeKey} hoverKey={hoverKey} onHover={onHover} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Sidebar() {
  const { user } = useAuthStore()
  const location = useLocation()
  const [hoverKey, setHoverKey] = useState<string | null>(null)

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

  const activeKey = findActiveKey(visibleGroups, location.pathname)
  const brandName = settings?.venue_name?.value || 'VR大空间'
  const logo = settings?.logo?.value || ''

  return (
    <div className="h-full flex flex-col bg-vrbg-sidebar text-vrtext-primary">
      <div className="h-16 flex items-center gap-3 px-4 border-b border-vrborder-subtle shrink-0">
        <div className="soft-icon h-10 w-10 bg-vrbg-surface">
          <img src={logo ? getImageUrl(logo) : '/logo.svg'} alt="VR Logo" className="w-7 h-7 object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="text-vr-h4 text-vrtext-primary font-semibold leading-tight truncate max-w-[130px]">{brandName}</h1>
          <p className="text-vr-caption text-vrtext-muted mt-0.5 truncate">预约排场系统</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-2">
        {visibleGroups.map((group) => (
          <MenuSection
            key={group.key}
            group={group}
            activeKey={activeKey}
            hoverKey={hoverKey}
            onHover={setHoverKey}
          />
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-vrborder-subtle shrink-0">
        <p className="text-vr-caption text-vrtext-muted">版本 v1.0.0</p>
      </div>
    </div>
  )
}
