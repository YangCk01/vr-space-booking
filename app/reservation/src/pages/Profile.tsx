import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Receipt, Phone, LogOut, Wallet, Crown, Coins, Sparkles, Ticket, HelpCircle, Settings, ClipboardCheck, RotateCcw, FileText, Clock as ClockIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { resolveImageUrl } from '@/api/client'
import { getOrders } from '@/api/orders'
import { getPagePublicSettings } from '@/api/settings'

const menuItems = [
  { icon: Sparkles, label: '会员权益', path: '/member-benefits' },
  { icon: Receipt, label: '账户明细', path: '/account-records' },
  { icon: Coins, label: '积分商城', path: '/points-mall' },
  { icon: Ticket, label: '优惠券', path: '/coupons' },
]

async function getMemberPublicConfig() {
  const res = await apiClient.get('/settings/member-public')
  return res.data.data as {
    levels: Array<{ key: string; name: string; discount: number }>
    points: { earnRate: number; deductRate: number }
  }
}

function normalizeLevelKey(key?: string | null) {
  const value = (key || '').toUpperCase()
  if (value === 'VIP+' || value === 'VIP_PLUS') return 'VIP_PLUS'
  return value
}

function getLevelFallbackName(key?: string | null) {
  switch (normalizeLevelKey(key)) {
    case 'VIP_PLUS':
      return 'VIP+'
    case 'VIP':
      return 'VIP'
    case 'MEMBER':
      return '会员'
    case 'NORMAL':
      return '普通会员'
    default:
      return '普通会员'
  }
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading, isLoggedIn, logout, refreshUser } = useAuth()
  const authUser = !authLoading && isLoggedIn ? user : null

  useEffect(() => {
    if (isLoggedIn) {
      refreshUser()
    }
  }, [isLoggedIn, refreshUser])

  const { data: memberConfig } = useQuery({
    queryKey: ['member-public-config'],
    queryFn: getMemberPublicConfig,
    enabled: !!authUser,
  })

  const { data: orderData } = useQuery({
    queryKey: ['orders', 'profile-summary'],
    queryFn: () => getOrders({ pageSize: 50 }),
    enabled: !!authUser,
  })

  const { data: pageSettings } = useQuery({
    queryKey: ['page-public-settings'],
    queryFn: getPagePublicSettings,
    staleTime: 60000,
  })

  const currentLevelKey = normalizeLevelKey(authUser?.level)
  const currentLevel = memberConfig?.levels?.find((l) => normalizeLevelKey(l.key) === currentLevelKey)
  const currentLevelName = authUser
    ? (currentLevel?.name || getLevelFallbackName(authUser.level))
    : ''
  const discountLabel = currentLevel && currentLevel.discount < 100
    ? `享${currentLevel.discount}折`
    : ''
  const allOrders = orderData?.data || []
  const orderCounts = {
    // 待体验按「份数/券数」统计，多份团购拆单后每张券都计入
    pendingExperience: allOrders
      .filter((o: any) => o.orderKind !== 'FEE' && ['PAID', 'READY_TO_VERIFY'].includes(o.status))
      .reduce((sum: number, o: any) => sum + (o.quantity || 1), 0),
    pendingPayment: allOrders
      .filter((o: any) => o.orderKind !== 'FEE' && o.status === 'PENDING')
      .reduce((sum: number, o: any) => sum + (o.quantity || 1), 0),
  }
  const configuredMenuItems = [
    ...menuItems,
    ...(pageSettings?.cProfileHelpEnabled !== false ? [{
      icon: HelpCircle,
      label: pageSettings?.cProfileHelpTitle || '帮助与反馈',
      desc: pageSettings?.cProfileHelpSubtitle || '常见问题、意见反馈与使用帮助',
      path: '/help',
    }] : []),
    ...(pageSettings?.cProfileContactEnabled !== false ? [{
      icon: Phone,
      label: pageSettings?.cProfileContactTitle || '联系门店',
      desc: pageSettings?.cProfileContactSubtitle || '查看电话、地址与营业时间',
      path: '/store-contact',
    }] : []),
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="relative rounded-t-[28px] rounded-b-[20px] bg-gradient-accent px-5 pt-10 pb-16 overflow-hidden shadow-glow">
          <div className="absolute right-[-40px] top-[-40px] w-40 h-40 rounded-full border border-white/15" />
          <div className="absolute left-[-36px] bottom-[-56px] w-36 h-36 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center text-white text-xl font-bold overflow-hidden">
              {authUser?.avatar ? (
                <img src={resolveImageUrl(authUser.avatar)} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                authUser ? (authUser.name?.[0] || 'U') : 'VR'
              )}
            </div>
            <div className="flex-1 min-w-0">
            {authLoading ? (
              <>
                <h1 className="text-lg font-bold text-white">加载中...</h1>
                <p className="text-sm text-white/70 mt-0.5">正在同步账号信息</p>
              </>
            ) : authUser ? (
              <>
                <h1 className="text-xl font-black text-white">{authUser.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] text-white font-semibold">
                    {currentLevelName}
                  </span>
                  <span className="text-xs text-white/80">{authUser.points || 0} 积分</span>
                </div>
                {(currentLevel || currentLevelName) && (
                  <p className="text-xs text-white/70 mt-1">{discountLabel || '会员权益已生效'}</p>
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
            {authUser && (
              <button
                onClick={() => navigate('/account-settings')}
                className="shrink-0 w-9 h-9 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors flex items-center justify-center"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="max-w-lg mx-auto px-8 -mt-12 relative z-10">
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 flex items-center justify-around shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {authUser ? `¥${((authUser.principalBalance || 0) + (authUser.bonusBalance || 0)) / 100}` : '0'}
            </p>
            <p className="text-xs text-[var(--text-muted)] flex items-center justify-center gap-1"><Wallet className="w-3 h-3" />余额</p>
          </div>
          <div className="w-px h-8 bg-[var(--border-subtle)]" />
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {authUser ? (authUser.points || 0) : '0'}
            </p>
            <p className="text-xs text-[var(--text-muted)] flex items-center justify-center gap-1"><Coins className="w-3 h-3" />积分</p>
          </div>
          {authUser && (
            <>
              <div className="w-px h-8 bg-[var(--border-subtle)]" />
              <div className="text-center">
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {currentLevelName}
                </p>
                <p className="text-xs text-[var(--text-muted)] flex items-center justify-center gap-1"><Crown className="w-3 h-3" />会员等级</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-black text-[var(--text-primary)]">我的订单</h2>
            <button onClick={() => navigate('/orders')} className="text-xs text-[var(--text-muted)] flex items-center">
              查看全部 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 px-4 py-4">
            {[
              { icon: ClockIcon, label: '待体验', path: '/orders?tab=PAID', count: orderCounts.pendingExperience },
              { icon: FileText, label: '待支付', path: '/orders?tab=PENDING', count: orderCounts.pendingPayment },
              { icon: ClipboardCheck, label: '已完成', path: '/orders?tab=COMPLETED', count: 0 },
              { icon: RotateCcw, label: '退款', path: '/orders?tab=CANCELLED', count: 0 },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button key={item.label} onClick={() => navigate(item.path)} className="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                  <span className="relative">
                    <Icon className="w-5 h-5 text-[var(--accent-primary)]" />
                    {item.count > 0 && (
                      <span className="absolute -right-2.5 -top-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--error)] text-white text-[10px] font-bold leading-4 text-center">
                        {item.count > 99 ? '99+' : item.count}
                      </span>
                    )}
                  </span>
                  <span className="text-xs">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {authUser && (
        <div className="max-w-lg mx-auto px-4 pt-3">
          <button
            onClick={() => navigate('/recharge')}
            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] text-left hover:border-[var(--accent-primary)]/40 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--bg-active)] flex items-center justify-center">
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
      <div className="max-w-lg mx-auto px-4 pt-3">
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden">
          {configuredMenuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center justify-between px-4 py-4 text-left border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-secondary)] transition-colors"
              >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--bg-active)] flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <div>
                  <span className="text-sm text-[var(--text-primary)]">{item.label}</span>
                  {'desc' in item && item.desc && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.desc}</p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
            )
          })}
        </div>

        {authUser && (
          <button
            onClick={logout}
            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] text-left hover:border-[var(--border-hover)] transition-colors mt-4"
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
