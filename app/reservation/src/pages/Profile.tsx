import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Receipt, Phone, LogOut, Wallet, Crown, Coins, Sparkles, Ticket, HelpCircle, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { resolveImageUrl } from '@/api/client'

const menuItems = [
  { icon: Sparkles, label: '会员权益', path: '/member-benefits' },
  { icon: Receipt, label: '账户明细', path: '/account-records' },
  { icon: Ticket, label: '优惠券', path: '/coupons' },
  { icon: HelpCircle, label: '帮助与反馈', path: '/help' },
  { icon: Phone, label: '联系门店', path: '#' },
]

async function getMemberPublicConfig() {
  const res = await apiClient.get('/settings/member-public')
  return res.data.data as {
    levels: Array<{ key: string; name: string; discount: number }>
    points: { earnRate: number; deductRate: number }
  }
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, isLoggedIn, logout, refreshUser } = useAuth()

  useEffect(() => {
    if (isLoggedIn) {
      refreshUser()
    }
  }, [isLoggedIn, refreshUser])

  const { data: memberConfig } = useQuery({
    queryKey: ['member-public-config'],
    queryFn: getMemberPublicConfig,
    enabled: isLoggedIn,
  })

  const enumToConfigKey: Record<string, string> = { VIP_PLUS: 'VIP+' }
  const currentLevel = memberConfig?.levels?.find((l) => l.key === user?.level || l.key === enumToConfigKey[user?.level || ''])
  const discountLabel = currentLevel && currentLevel.discount < 100
    ? `享${currentLevel.discount}折`
    : ''

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24"
    >
      {/* Header */}
      <div className="bg-gradient-accent pt-12 pb-8 px-4">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold overflow-hidden">
            {isLoggedIn && user?.avatar ? (
              <img src={resolveImageUrl(user.avatar)} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              isLoggedIn ? (user?.name?.[0] || 'U') : 'VR'
            )}
          </div>
          <div className="flex-1 min-w-0">
            {isLoggedIn ? (
              <>
                <h1 className="text-lg font-bold text-white">{user?.name}</h1>
                <p className="text-sm text-white/70">{user?.phone}</p>
                {currentLevel && (
                  <p className="text-xs text-white/80 mt-0.5">
                    {currentLevel.name} {discountLabel && `· ${discountLabel}`}
                  </p>
                )}
              </>
            ) : (
              <>
                <h1 className="text-lg font-bold text-white">访客用户</h1>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm text-white/70 hover:text-white underline underline-offset-2 mt-0.5"
                >
                  登录 / 注册
                </button>
              </>
            )}
          </div>
          {isLoggedIn && (
            <button
              onClick={() => navigate('/account-settings')}
              className="shrink-0 px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors flex items-center gap-1"
            >
              <Settings className="w-3 h-3" />
              账户设置
            </button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="max-w-lg mx-auto px-4 -mt-4">
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 flex items-center justify-around">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {isLoggedIn ? `¥${((user?.principalBalance || 0) + (user?.bonusBalance || 0)) / 100}` : '0'}
            </p>
            <p className="text-xs text-[var(--text-muted)]">余额</p>
          </div>
          <div className="w-px h-8 bg-[var(--border-subtle)]" />
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {isLoggedIn ? (user?.points || 0) : '0'}
            </p>
            <p className="text-xs text-[var(--text-muted)]">积分</p>
          </div>
          {isLoggedIn && (
            <>
              <div className="w-px h-8 bg-[var(--border-subtle)]" />
              <div className="text-center">
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {currentLevel?.name || user?.level || '普通'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">会员等级</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recharge Button */}
      {isLoggedIn && (
        <div className="max-w-lg mx-auto px-4 pt-3">
          <button
            onClick={() => navigate('/recharge')}
            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[var(--accent-primary)]/20 to-[var(--accent-secondary)]/20 rounded-xl border border-[var(--accent-primary)]/30 text-left hover:border-[var(--accent-primary)]/60 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/20 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">会员储值</span>
                <p className="text-xs text-[var(--text-muted)]">
                  {currentLevel && currentLevel.discount < 100
                    ? `${currentLevel.name}享${currentLevel.discount}折，充值升级享更多特权`
                    : '充值升级会员享特权'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Crown className="w-3.5 h-3.5 text-[var(--warning)]" />
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
          </button>
        </div>
      )}

      {/* Menu */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              onClick={() => item.path !== '#' && navigate(item.path)}
              className="w-full flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] text-left hover:border-[var(--border-hover)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <span className="text-sm text-[var(--text-primary)]">{item.label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          )
        })}

        {isLoggedIn && (
          <button
            onClick={logout}
            className="w-full flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] text-left hover:border-[var(--border-hover)] transition-colors mt-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--error)]/10 flex items-center justify-center">
                <LogOut className="w-4 h-4 text-[var(--error)]" />
              </div>
              <span className="text-sm text-[var(--error)]">退出登录</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        )}
      </div>
    </motion.div>
  )
}
