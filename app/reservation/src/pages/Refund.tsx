import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, XCircle } from 'lucide-react'
import { getOrder, cancelOrder } from '@/api/orders'
import { getRefundRules } from '@/api/settings'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/lib/imageUrl'
import { getRefundInfo, formatAmount } from '@/lib/refund'

const reasons = [
  '预约时间不合适',
  '临时有事无法到店',
  '买错套餐/人数',
  '其他原因',
]

export default function Refund() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isLoggedIn, refreshUser } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  const [reason, setReason] = useState(reasons[0])

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id!),
    enabled: !!id && isLoggedIn,
  })

  const { data: refundRulesData } = useQuery({
    queryKey: ['refundRules'],
    queryFn: () => getRefundRules(),
    enabled: isLoggedIn,
    staleTime: 1000 * 60 * 5,
  })

  const refundTiers = refundRulesData?.tiers ?? [
    { hours: 24, rate: 100, label: '开场24小时前' },
    { hours: 2, rate: 50, label: '开场2-24小时' },
    { hours: 0, rate: 0, label: '开场2小时内' },
  ]
  const cancelHours = refundRulesData?.cancelHours ?? 2

  const isGroupBuy = !!order?.groupBuyPackage
  const pkg = order?.groupBuyPackage

  const refundInfo = order && !isGroupBuy ? getRefundInfo(order, refundTiers, cancelHours) : null
  const refundAmount = isGroupBuy ? (order?.amount || 0) : (refundInfo?.refundAmount || 0)
  const canRefund = isGroupBuy ? true : (refundInfo?.canCancel ?? false)

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      refreshUser()
      toastSuccess(isGroupBuy ? '退款申请已提交' : '取消退费申请已提交')
      navigate('/orders', { replace: true })
    },
    onError: (error: any) => {
      toastError(`${isGroupBuy ? '退款' : '取消退费'}失败: ` + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)] px-6">
        <XCircle className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">订单不存在或已删除</p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 px-6 py-2 rounded-xl text-sm font-medium text-white bg-gradient-accent"
        >
          返回订单列表
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] bg-[var(--bg-primary)] pb-24"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{isGroupBuy ? '申请退款' : '取消退费'}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 订单卡片 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
          <div className="flex gap-3">
            <div className="w-20 h-20 rounded-xl bg-[var(--bg-elevated)] overflow-hidden shrink-0">
              <img
                src={getImageUrl(pkg?.coverImage || order.booking?.game?.coverImage || null)}
                alt={pkg?.title || order.booking?.game?.title || 'VR体验'}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight">
                {isGroupBuy ? `【${pkg.label}】${pkg.title}` : (order.booking?.game?.title || 'VR体验')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {isGroupBuy ? '随时退 · 过期自动退 · 需预约' : order.venueName}
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-base font-black text-[var(--error)]">{formatAmount(order.amount)}</span>
                <span className="text-xs text-[var(--text-secondary)]">x{order.quantity || 1}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 退费原因 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-[var(--shadow-sm)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">{isGroupBuy ? '退款原因' : '取消原因'}</h3>
          <div className="space-y-2">
            {reasons.map((r) => (
              <label
                key={r}
                className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] cursor-pointer"
              >
                <span className="text-sm text-[var(--text-primary)]">{r}</span>
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                    reason === r
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
                      : 'border-[var(--border-subtle)]'
                  )}
                >
                  {reason === r && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <input
                  type="radio"
                  name="refund-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="sr-only"
                />
              </label>
            ))}
          </div>
        </div>

        {/* 退费金额 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{isGroupBuy ? '退款金额' : '预计退费'}</h3>
            <span className="text-lg font-black text-[var(--error)]">{formatAmount(refundAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>{isGroupBuy ? '原路退回' : '取消后按规则退回'}</span>
            <span>余额/支付账户</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">提交后预计 1-3 个工作日到账</p>
        </div>

        {/* 退费规则 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-[var(--shadow-sm)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">{isGroupBuy ? '退款规则' : '取消退费规则'}</h3>
          {isGroupBuy ? (
            <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] list-disc pl-4">
              <li>未预约或团购券到期，可全额退款</li>
              <li>已核销或超过预约开始时间后不可退款</li>
            </ul>
          ) : refundInfo?.isExpired ? (
            <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20">
              <p className="text-sm font-medium text-red-400">已过最迟取消时间</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">该订单已开场或超出取消时限，不可取消退费</p>
            </div>
          ) : refundInfo?.rate === 0 ? (
            <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20">
              <p className="text-sm font-medium text-red-400">开场前{cancelHours}小时内不可退费</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">确认取消后订单将关闭，款项不予退回</p>
            </div>
          ) : (
            <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] list-disc pl-4">
              <li>当前可退比例 {Math.round((refundInfo?.rate || 0) * 100)}%（{refundInfo?.activeTier?.label}）</li>
              <li>开场前{cancelHours}小时内不可退费</li>
            </ul>
          )}
        </div>
      </div>

      {/* 底部提交栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-[calc(3.5rem+var(--safe-bottom))] pb-[var(--safe-bottom)] flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-[var(--text-secondary)]">{isGroupBuy ? '退款 ' : '预计退费 '}</span>
            <span className="font-black text-[var(--error)]">{formatAmount(refundAmount)}</span>
          </div>
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={!canRefund || cancelMutation.isPending}
            className="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-accent disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-sm"
          >
            {cancelMutation.isPending ? '提交中...' : !canRefund ? (isGroupBuy ? '不可退款' : '不可退费') : '提交申请'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
