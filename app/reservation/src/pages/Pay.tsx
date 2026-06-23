import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Users, AlertCircle, CreditCard, XCircle, Timer, Store } from 'lucide-react'
import { getOrder, payOrder, cancelOrder } from '@/api/orders'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/lib/imageUrl'

const payMethodMap: Record<string, { label: string; method: string }> = {
  wechat: { label: '微信支付', method: 'WECHAT' },
  alipay: { label: '支付宝', method: 'ALIPAY' },
  balance: { label: '余额支付', method: 'BALANCE' },
}

/* ─── Countdown hook ─── */
function useCountdown(targetDate: Date | string | null | undefined) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!targetDate) return
    const target = new Date(targetDate).getTime()
    const tick = () => {
      const diff = target - Date.now()
      setLeft(Math.max(0, diff))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])
  return left
}

function fmtCountdown(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) {
    return `${days}天${hours}小时${minutes}分`
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分${seconds.toString().padStart(2, '0')}秒`
  }
  return `${minutes}分${seconds.toString().padStart(2, '0')}秒`
}

export default function Pay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoggedIn, refreshUser } = useAuth()

  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'balance'>('wechat')
  const [errorMsg, setErrorMsg] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const paymentInitRef = useRef(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id!),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const countdownMs = useCountdown(order?.expireAt)
  const isExpired = countdownMs <= 0 && !!order?.expireAt

  useEffect(() => {
    if (order?.status === 'PENDING' && isExpired) {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  }, [id, isExpired, order?.status, queryClient])

  const amountYuan = ((order?.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const balance = (user?.principalBalance || 0) + (user?.bonusBalance || 0)
  const balanceDisabled = !isLoggedIn || balance < (order?.amount || 0)

  // 切换订单时重置默认支付方式
  useEffect(() => {
    paymentInitRef.current = false
  }, [id])

  // 默认优先余额支付；余额不足时默认微信支付并提示充值
  useEffect(() => {
    if (!order || paymentInitRef.current) return
    paymentInitRef.current = true
    if (isLoggedIn && user && balance >= (order.amount || 0)) {
      setPaymentMethod('balance')
    } else {
      setPaymentMethod('wechat')
      if (isLoggedIn && user && (order.amount || 0) > 0) {
        setErrorMsg('余额不足，请先充值')
      }
    }
  }, [order, user, isLoggedIn, balance])

  const payMutation = useMutation({
    mutationFn: () => payOrder(id!, payMethodMap[paymentMethod].method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      refreshUser()

      // 支付成功后统一回到「我的订单 → 全部」
      navigate('/orders', { replace: true })
      return

      // 组装 success 页面参数
      const booking = order?.booking
      const durationMin = booking
        ? (parseInt(booking.endTime?.split(':')[0] || '0') * 60 + parseInt(booking.endTime?.split(':')[1] || '0')) -
          (parseInt(booking.startTime?.split(':')[0] || '0') * 60 + parseInt(booking.startTime?.split(':')[1] || '0'))
        : 0
      navigate('/success', {
        state: {
          venueName: order?.venueName || '',
          date: booking?.date || order?.bookingTime?.split(' ')[0] || '',
          startTime: booking?.startTime || '',
          endTime: booking?.endTime || '',
          durationMin,
          totalPrice: (order?.originalAmount || order?.amount || 0) / 100,
          finalPrice: ((order?.amount || 0) / 100).toFixed(2),
          originalPrice: ((order?.originalAmount || order?.amount || 0) / 100).toFixed(2),
          personName: order?.customer || '',
          personCount: booking?.personCount || 1,
          orderId: order?.id || '',
          orderNo: order?.orderNo || '',
          couponName: order?.userCoupon?.name,
          couponDiscount: order?.couponDiscount,
        },
        replace: true,
      })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || '支付失败，请稍后重试'
      setErrorMsg(msg)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate('/orders', { replace: true })
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message || '取消订单失败')
    },
  })

  // 已支付订单自动跳回订单列表（全部）
  useEffect(() => {
    if (order?.status === 'PAID') {
      navigate('/orders', { replace: true })
    }
  }, [order?.status, navigate])

  const handlePay = () => {
    if (isExpired) {
      setErrorMsg('订单已过期，请重新下单')
      return
    }
    if (paymentMethod === 'balance' && balanceDisabled) {
      setErrorMsg('余额不足，请先充值')
      return
    }
    setErrorMsg('')
    payMutation.mutate()
  }

  const handleCancelPay = () => {
    setShowCancelConfirm(true)
  }

  const goOrders = (tab = 'all') => {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    const target = tab === 'all' ? '/orders' : `/orders?tab=${tab}`
    navigate(target, { replace: true })
    window.setTimeout(() => {
      if (tab === 'all' ? window.location.pathname !== '/orders' : (window.location.pathname !== '/orders' || window.location.search !== `?tab=${tab}`)) {
        window.location.href = target
      }
    }, 100)
  }

  const orderListHref = '/orders'

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order || (order.status !== 'PENDING' && order.status !== 'PAID')) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)] px-4">
        <CreditCard className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">{order ? '该订单已过期或已取消' : '订单不存在'}</p>
        <a
          href={orderListHref}
          onPointerUp={() => goOrders()}
          className="mt-4 px-6 py-2 rounded-xl text-sm font-medium text-white bg-gradient-accent"
        >
          返回订单列表
        </a>
      </div>
    )
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
            onClick={() => navigate('/orders')}
            className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{order?.orderKind === 'FEE' ? '支付改签费' : '订单支付'}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Order info */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 space-y-4">
          <div className="flex gap-3">
            <div className="w-20 h-20 rounded-xl bg-[var(--bg-elevated)] overflow-hidden shrink-0">
              <img
                src={getImageUrl(
                  order.orderKind === 'FEE'
                    ? order.parentOrder?.booking?.game?.coverImage
                    : (order.groupBuyPackage?.coverImage || order.booking?.game?.coverImage)
                  || null
                )}
                alt={order.orderKind === 'FEE' ? '改签手续费' : (order.groupBuyPackage?.title || order.booking?.game?.title || 'VR体验')}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight">
                {order.orderKind === 'FEE'
                  ? `${order.parentOrder?.booking?.game?.title || 'VR体验'} · 改签手续费`
                  : order.groupBuyPackage
                    ? `【${order.groupBuyPackage.label}】${order.groupBuyPackage.title}`
                    : (order.booking?.game?.title || 'VR体验')}
              </h2>
              {order.groupBuyPackage && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {['随时退', '过期自动退'].map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[var(--text-secondary)]">
                  {order.orderKind === 'FEE'
                    ? `${order.parentOrder?.booking?.personCount || 1}人`
                    : order.groupBuyPackage
                      ? `${order.quantity || 1}份 · 每份${order.groupBuyPackage.maxPeople}人`
                      : `${order.booking?.personCount || 1}人`}
                </span>
                <div className="flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5 text-[var(--warning)]" />
                  <span className={cn('text-xs font-medium', isExpired ? 'text-[var(--error)]' : 'text-[var(--warning)]')}>
                    {isExpired ? '已过期' : `剩余 ${fmtCountdown(countdownMs)}`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {order.orderKind === 'FEE' ? (
              <>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Clock className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{order.bookingTime}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <MapPin className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{order.parentOrder?.booking?.venue?.address || order.venueName || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Users className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{`${order.parentOrder?.booking?.personCount || 1}人`}</span>
                </div>
              </>
            ) : order.groupBuyPackage ? (
              <>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Store className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{order.groupBuyPackage.venues.map((v: any) => v.name).join('、') || order.venueName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Clock className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>体验时长 {order.groupBuyPackage.game?.duration || 20} 分钟</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Users className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{`${order.quantity || 1}份`}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Clock className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{order.bookingTime}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <MapPin className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{order.booking?.venue?.address || order.venueName || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Users className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                  <span>{`${order.booking?.personCount || 1}人`}</span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-3 flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">订单金额</span>
            <span className="text-xl font-bold text-[var(--error)]">¥{amountYuan}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">选择支付方式</h3>
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
                disabled={m.disabled || isExpired}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                  m.disabled || isExpired
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
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
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
        </AnimatePresence>
      </div>

      {/* Bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-primary)]/95 backdrop-blur-md border-t border-[var(--border-subtle)]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <button
            onClick={order.orderKind === 'FEE' ? () => navigate('/orders', { replace: true }) : handleCancelPay}
            disabled={payMutation.isPending || cancelMutation.isPending}
            className="h-10 px-4 rounded-xl text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50 shrink-0"
          >
            {order.orderKind === 'FEE' ? '返回订单' : '取消支付'}
          </button>
          <div className="flex-1 flex items-center justify-end gap-3">
            <div className="text-right">
              <span className="text-xs text-[var(--text-muted)]">待支付</span>
              <span className="text-lg font-bold text-[var(--error)] ml-2">¥{amountYuan}</span>
            </div>
            <button
              onClick={handlePay}
              disabled={payMutation.isPending || isExpired}
              className={cn(
                'h-10 px-5 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.97] shrink-0',
                payMutation.isPending || isExpired
                  ? 'bg-[var(--accent-primary)]/50 cursor-not-allowed'
                  : 'bg-gradient-accent shadow-glow hover:shadow-glow-sm',
              )}
            >
              {payMutation.isPending ? '支付中...' : isExpired ? '已过期' : '确认支付'}
            </button>
          </div>
        </div>
      </div>

      {/* Cancel confirm modal */}
      <AnimatePresence>
        {showCancelConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6"
            onClick={() => setShowCancelConfirm(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl p-5 max-w-sm w-full border border-[var(--border-subtle)] shadow-2xl"
            >
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">确认取消支付？</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-5">
                取消后订单将保留在「待支付」中，您可以在订单列表中随时继续支付。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-accent"
                >
                  继续支付
                </button>
                <button
                  onClick={() => goOrders()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] transition-colors"
                >
                  稍后支付
                </button>
              </div>
              {order?.orderKind !== 'FEE' && (
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50"
                >
                  {cancelMutation.isPending ? '取消中...' : '取消订单'}
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
