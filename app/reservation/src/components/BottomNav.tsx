import { Link, useLocation } from 'react-router-dom'
import { Home, Gamepad2, ClipboardList, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { key: 'home', label: '首页', icon: Home, path: '/' },
  { key: 'venues', label: '体验', icon: Gamepad2, path: '/venues' },
  { key: 'orders', label: '订单', icon: ClipboardList, path: '/orders' },
  { key: 'profile', label: '我的', icon: User, path: '/profile' },
]

export default function BottomNav({ fixed = true }: { fixed?: boolean }) {
  const location = useLocation()

  return (
    <nav className={cn(
      'bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-[var(--border-subtle)] shadow-[0_-10px_30px_rgba(15,23,42,0.08)]',
      fixed ? 'fixed' : 'absolute'
    )}
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="max-w-lg mx-auto flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive =
            location.pathname === tab.path ||
            (tab.key === 'venues' && (location.pathname === '/venues' || location.pathname.startsWith('/venue')))
          return (
            <Link
              key={tab.key}
              to={tab.path}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 w-16 transition-all duration-200',
                isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              <div className={cn('relative', isActive && 'scale-110')}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
