import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Check, Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getRechargeConfig } from '@/api/recharges'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { apiClient } from '@/api/client'

async function getMemberPublicConfig() {
  const res = await apiClient.get('/settings/member-public')
  return res.data.data as {
    levels: Array<{ key: string; name: string; discount: number }>
    points: { earnRate: number; deductRate: number }
  }
}

export default function Recharge() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const { data: configs, isLoading } = useQuery({
    queryKey: ['rechargeConfig'],
    queryFn: getRechargeConfig,
  })

  const { data: memberConfig } = useQuery({
    queryKey: ['member-public-config'],
    queryFn: getMemberPublicConfig,
  })

  const currentLevel = memberConfig?.levels?.find((l) => l.key === user?.level)

  const handleContactStore = () => {
    if (selectedIdx === null || !configs) return
    navigate('/store-contact')
  }

  const selectedCfg = selectedIdx !== null && configs ? configs[selectedIdx] : null

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">会员储值</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Current balance & level */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 text-center">
          <p className="text-xs text-[var(--text-muted)] mb-1">当前余额</p>
          <p className="text-3xl font-bold text-[var(--text-primary)]">¥{((user?.principalBalance || 0) + (user?.bonusBalance || 0)) / 100}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <p className="text-xs text-[var(--text-secondary)]">
              当前等级：{currentLevel?.name || user?.level || '普通用户'}
            </p>
            {currentLevel && currentLevel.discount < 100 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                消费享{currentLevel.discount}折
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            当前积分：{user?.points || 0} 分
          </p>
        </div>

        {/* Config cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {configs?.map((cfg, idx) => {
              const isSelected = selectedIdx === idx
              const levelInfo = memberConfig?.levels?.find((l) =>
                l.key === cfg.level ||
                (cfg.level === 'VIP+' && l.key === 'VIP_PLUS') ||
                (cfg.level === 'VIP_PLUS' && l.key === 'VIP+')
              )
              const levelLabel = levelInfo?.name || cfg.level
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  className={cn(
                    'relative p-4 rounded-xl border text-left transition-all',
                    isSelected
                      ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] shadow-glow-sm'
                      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]',
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <p className={cn('text-xl font-bold', isSelected ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]')}>
                    ¥{cfg.amount / 100}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">到账 ¥{cfg.total / 100}</p>
                  <div className="mt-2 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-[var(--warning)]" />
                    <span className="text-xs text-[var(--warning)]">赠¥{cfg.bonus / 100}</span>
                  </div>
                  <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[10px] text-[var(--text-secondary)]">
                    {levelLabel}
                  </div>

                </button>
              )
            })}
          </div>
        )}

        {/* Pay method */}
        {selectedCfg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-3"
          >
            <p className="text-sm font-medium text-[var(--text-primary)]">办理方式</p>
            <div className="rounded-lg border border-[var(--warning)]/25 bg-[var(--warning)]/10 px-3 py-2 text-xs text-[var(--warning)]">
              线上储值暂未开放。请到店由员工确认现金或刷卡收款后入账，避免未接入真实支付前出现虚假到账。
            </div>

            {/* Summary */}
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">充值金额</span>
                <span className="text-[var(--text-primary)]">¥{selectedCfg.amount / 100}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">赠送金额</span>
                <span className="text-[var(--warning)]">+¥{selectedCfg.bonus / 100}</span>
              </div>

              <div className="flex items-center justify-between text-sm font-medium">
                <span className="text-[var(--text-primary)]">到账金额</span>
                <span className="text-[var(--accent-primary)] text-lg">¥{selectedCfg.total / 100}</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom CTA */}
      {selectedCfg && (
        <div className="fixed bottom-[calc(3.5rem+var(--safe-bottom))] left-0 right-0 z-40 bg-gradient-to-t from-[var(--bg-primary)] to-transparent pt-6 pb-4 px-4">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleContactStore}
              className="w-full h-12 rounded-xl bg-gradient-accent text-white font-semibold text-base shadow-glow hover:shadow-glow-sm active:scale-[0.98] transition-all disabled:opacity-60"
            >
              联系门店到店办理
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
