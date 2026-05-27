import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Users, AlertCircle, CreditCard } from 'lucide-react'
import { getOrder, payOrder } from '@/api/orders'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'

const payMethodMap: Record<string, { label: string; method: string }> = {
  wechat: { label: '微信支付', method: 'WECHAT' },
  alipay: { label: '支付宝', method: 'ALIPAY' },
  balance: { label: '余额支付', method: 'BALANCE' },
}

export default function Pay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoggedIn, refreshUser } = useAuth()

  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'balance'>('wechat')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id!),
    enabled: !!id,
  })

  const payMutation = useMutation({
    mutationFn: () => payOrder(id!, payMethodMap[paymentMethod].method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      refreshUser()
      navigate('/orders', { replace: true })
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message || '支付失败，请稍后重试')
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order || order.status !== 'PENDING') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)] px-4">
        <CreditCard className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">{order ? '该订单无需支付' : '订单不存在'}</p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 px-6 py-2 rounded-xl text-sm font-medium text-white bg-gradient-accent"
        >
          返回订单列表
        </button>
      </div>
    )
  }

  const amountYuan = ((order.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const balance = user?.balance || 0
  const balanceDisabled = balance < order.amount

  const handlePay = () => {
    setErrorMsg('')

    if (paymentMethod === 'balance' && balanceDisabled) {
      setErrorMsg('余额不足，请先充值')
      return
    }

    payMutation.mutate()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav-xl"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">订单支付</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Order info */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--text-primary)]">{order.venueName}</h2>
            <span className="text-xs text-[var(--warning)] font-medium">待支付</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Clock className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
              <span>{order.bookingTime}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Users className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
              <span>{order.booking?.personCount || 1}人</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <MapPin className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
              <span>{order.customer || '-'}</span>
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-3 flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">订单金额</span>
            <span className="text-xl font-bold text-[var(--error)]">¥{amountYuan}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">支付方式</h3>
          <div className="space-y-2">
            {[
              { key: 'wechat' as const, label: '微信支付', sub: '使用微信支付' },
              { key: 'alipay' as const, label: '支付宝', sub: '使用支付宝支付' },
              ...(isLoggedIn && user ? [{
                key: 'balance' as const,
                label: '余额支付',
                sub: `当前余额 ¥${((balance || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                disabled: balanceDisabled,
              }] : []),
            ].map((m: any) => (
              <button
                key={m.key}
                onClick={() => !m.disabled && setPaymentMethod(m.key)}
                disabled={m.disabled}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                  m.disabled
                    ? 'border-[var(--border-subtle)] bg-transparent opacity-50 cursor-not-allowed'
                    : paymentMethod === m.key
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                      : 'border-[var(--border-subtle)] bg-transparent hover:border-[var(--border-hover)]',
                )}
              >
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                  paymentMethod === m.key ? 'border-[var(--accent-primary)]' : 'border-[var(--text-muted)]',
                )}>
                  {paymentMethod === m.key && <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[var(--text-primary)]">{m.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{m.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-xl text-[var(--error)] text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
            {errorMsg.includes('余额不足') && (
              <button
                onClick={() => navigate('/recharge')}
                className="ml-auto text-xs font-medium underline"
              >
                去充值
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-primary)]/95 backdrop-blur-md border-t border-[var(--border-subtle)]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--text-muted)]">待支付</span>
            <span className="text-lg font-bold text-[var(--error)] ml-2">¥{amountYuan}</span>
          </div>
          <button
            onClick={handlePay}
            disabled={payMutation.isPending}
            className={cn(
              'h-10 px-6 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.97]',
              payMutation.isPending
                ? 'bg-[var(--accent-primary)]/50 cursor-not-allowed'
                : 'bg-gradient-accent shadow-glow hover:shadow-glow-sm',
            )}
          >
            {payMutation.isPending ? '支付中...' : '确认支付'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
