import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Crown, Zap, TrendingUp, Gift, Star } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { getRechargeConfig } from '@/api/recharges'

async function getMemberPublicConfig() {
  const res = await apiClient.get('/settings/member-public')
  return res.data.data as {
    levels: Array<{ key: string; name: string; discount: number; threshold?: number }>
    points: { earnRate: number; deductRate: number }
  }
}

const LEVEL_ORDER = ['NORMAL', 'MEMBER', 'VIP', 'VIP_PLUS']

const enumToConfigKey: Record<string, string> = { VIP_PLUS: 'VIP+' }

export default function MemberBenefits() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: memberConfig } = useQuery({
    queryKey: ['member-public-config'],
    queryFn: getMemberPublicConfig,
  })

  const { data: rechargeConfigs } = useQuery({
    queryKey: ['rechargeConfig'],
    queryFn: getRechargeConfig,
  })

  const levels = memberConfig?.levels || []
  const currentLevelKey = enumToConfigKey[user?.level || ''] || user?.level || 'NORMAL'
  const currentLevel = levels.find((l) => l.key === currentLevelKey)
  const currentIndex = LEVEL_ORDER.indexOf(currentLevelKey)
  const nextLevelKey = currentIndex < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[currentIndex + 1] : null
  const nextLevel = nextLevelKey ? levels.find((l) => l.key === (enumToConfigKey[nextLevelKey] || nextLevelKey)) : null

  // 计算升级进度：根据充值配置匹配下一档
  const nextConfig = nextLevelKey
    ? rechargeConfigs?.find((c) => c.level === nextLevelKey || c.level === (enumToConfigKey[nextLevelKey] || nextLevelKey))
    : null

  // 当前累计充值本金（近似用 totalSpent 作为已消费本金，实际升级看单次充值金额）
  // 更合理的方式：查询已充值总额
  const totalRecharged = user?.totalSpent || 0
  const progressPercent = nextConfig
    ? Math.min(100, Math.round((totalRecharged / nextConfig.amount) * 100))
    : 100
  const remaining = nextConfig ? Math.max(0, nextConfig.amount - totalRecharged) : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-b from-[var(--accent-primary)]/20 to-transparent backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">会员权益</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-2 space-y-4">
        {/* Current Level Card */}
        <div className="bg-gradient-to-br from-[var(--accent-primary)]/20 to-[var(--accent-secondary)]/10 rounded-2xl border border-[var(--accent-primary)]/30 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center">
              <Crown className="w-6 h-6 text-[var(--accent-primary)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">当前等级</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{currentLevel?.name || user?.level || '普通会员'}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
                <span>升级进度</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {nextLevel && remaining > 0 && (
                <p className="text-[10px] text-[var(--text-secondary)] mt-1.5">
                  再消费 ¥{(remaining / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} 可升级 {nextLevel.name}
                </p>
              )}
              {!nextLevel && (
                <p className="text-[10px] text-emerald-400 mt-1.5">恭喜，您已达到最高等级！</p>
              )}
            </div>
          </div>
        </div>

        {/* Current Benefits */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--warning)]" />
            当前权益
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--text-primary)]">消费折扣</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {currentLevel && currentLevel.discount < 100
                    ? `全场享 ${currentLevel.discount} 折`
                    : '暂无折扣'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--text-primary)]">积分回馈</p>
                <p className="text-xs text-[var(--text-muted)]">
                  消费返积分 {memberConfig?.points?.earnRate || 1}:1
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center shrink-0">
                <Star className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--text-primary)]">积分抵扣</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {memberConfig?.points?.deductRate || 100} 积分抵 1 元
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Level List */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">等级体系</h3>
          <div className="space-y-2">
            {LEVEL_ORDER.map((key, idx) => {
              const level = levels.find((l) => l.key === (enumToConfigKey[key] || key))
              const isCurrent = key === currentLevelKey
              const config = rechargeConfigs?.find((c) => c.level === key || c.level === (enumToConfigKey[key] || key))
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isCurrent
                      ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)] w-5">{idx + 1}</span>
                    <span className={`text-sm font-medium ${isCurrent ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>
                      {level?.name || key}
                    </span>
                    {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]">当前</span>}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {config ? `充值 ¥${(config.amount / 100).toLocaleString()}` : '默认等级'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
