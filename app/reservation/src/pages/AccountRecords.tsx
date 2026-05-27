import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Coins, Wallet, ArrowDownLeft, ArrowUpRight, Minus, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getMyRechargeList, getMyTransactions } from '@/api/recharges'
import { format } from 'date-fns'

type TabKey = 'points' | 'recharge'

const typeLabelMap: Record<string, string> = {
  RECHARGE: '充值到账',
  DEDUCT: '余额消费',
  REFUND: '退款到账',
  POINTS_EARN: '积分获取',
  POINTS_DEDUCT: '积分抵扣',
}

const typeColorMap: Record<string, string> = {
  RECHARGE: 'text-emerald-400',
  DEDUCT: 'text-red-400',
  REFUND: 'text-blue-400',
  POINTS_EARN: 'text-emerald-400',
  POINTS_DEDUCT: 'text-orange-400',
}

export default function AccountRecords() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('points')

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['my-transactions'],
    queryFn: getMyTransactions,
  })

  const { data: recharges, isLoading: rechargeLoading } = useQuery({
    queryKey: ['my-recharges'],
    queryFn: getMyRechargeList,
  })

  // 筛选积分相关的流水
  const pointTransactions = transactions?.filter(
    (t) => t.type === 'POINTS_EARN' || t.type === 'POINTS_DEDUCT'
  ) || []

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">账户明细</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-1">
          <button
            onClick={() => setActiveTab('points')}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'points'
                ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            <Coins className="w-4 h-4" />
            积分明细
          </button>
          <button
            onClick={() => setActiveTab('recharge')}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'recharge'
                ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            <Wallet className="w-4 h-4" />
            充值记录
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        {activeTab === 'points' && (
          <div className="space-y-3">
            {txLoading ? (
              <div className="text-center py-12 text-[var(--text-muted)] text-sm">加载中...</div>
            ) : pointTransactions.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)] text-sm">
                <Coins className="w-10 h-10 mx-auto mb-3 opacity-30" />
                暂无积分记录
              </div>
            ) : (
              pointTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 flex items-center gap-3"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    tx.type === 'POINTS_EARN' ? 'bg-emerald-500/10' : 'bg-orange-500/10'
                  }`}>
                    {tx.type === 'POINTS_EARN' ? (
                      <Plus className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Minus className="w-4 h-4 text-orange-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {typeLabelMap[tx.type] || tx.type}
                      </span>
                      <span className={`text-sm font-bold ${typeColorMap[tx.type] || 'text-[var(--text-primary)]'}`}>
                        {tx.type === 'POINTS_EARN' ? '+' : ''}{tx.pointsAmount} 积分
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{tx.remark}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                      {format(new Date(tx.createdAt), 'yyyy-MM-dd HH:mm')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'recharge' && (
          <div className="space-y-3">
            {rechargeLoading ? (
              <div className="text-center py-12 text-[var(--text-muted)] text-sm">加载中...</div>
            ) : !recharges || recharges.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)] text-sm">
                <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                暂无充值记录
              </div>
            ) : (
              recharges.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">会员充值</span>
                      <span className="text-sm font-bold text-emerald-400">
                        +¥{(r.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      赠送 ¥{(r.bonus / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · 到账 ¥{(r.total / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                      {r.paidAt ? format(new Date(r.paidAt), 'yyyy-MM-dd HH:mm') : '-'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
