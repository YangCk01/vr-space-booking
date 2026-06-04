import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ClipboardList, LogIn, XCircle, MapPin, Clock, Calendar, Users, Ticket, QrCode, Timer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getOrders, cancelOrder } from '@/api/orders'
import { getRefundRules } from '@/api/settings'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { SimpleQRCode } from '@/components/SimpleQRCode'
import type { RefundTier } from '@/api/settings'

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'PAID', label: '待核销' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
]

const statusMap: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待支付', color: 'text-[var(--warning)]' },
  PAID: { label: '待核销', color: 'text-[var(--accent-primary)]' },
  COMPLETED: { label: '已完成', color: 'text-[var(--success)]' },
  CANCELLED: { label: '已取消', color: 'text-[var(--text-muted)]' },
  REFUNDED: { label: '已退款', color: 'text-[var(--text-muted)]' },
}

/* ─── 阶梯退费计算（动态规则） ─── */
function getRefundInfo(order: any, tiers: RefundTier[]) {
  const booking = order?.booking
  if (!booking?.date || !booking?.startTime) {
    return { rate: 0, refundAmount: 0, refundText: '¥0.00', canCancel: true, deadlineText: '', isExpired: false, activeTier: null as RefundTier | null }
  }
  const startDate = new Date(booking.date)
  const [h, m] = booking.startTime.split(':')
  startDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  const now = new Date()
  const diffMs = startDate.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  // 按 hours 降序排列，找到第一个满足 diffHours >= hours 的规则
  const sorted = [...tiers].sort((a, b) => b.hours - a.hours)
  let activeTier: RefundTier | null = null
  for (const tier of sorted) {
    if (diffHours >= tier.hours) {
      activeTier = tier
      break
    }
  }
  const rate = activeTier ? activeTier.rate / 100 : 0

  const refundAmount = Math.floor((order.amount || 0) * rate)
  const refundText = `¥${(refundAmount / 100).toFixed(2)}`

  // 最小阈值（不可取消的小时数）
  const minHours = sorted.length > 0 ? sorted[sorted.length - 1].hours : 0

  // 最迟取消提示
  let deadlineText = ''
  if (diffHours > minHours) {
    const d = new Date(startDate.getTime() - minHours * 60 * 60 * 1000)
    if (minHours >= 24) {
      deadlineText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 前可取消`
    } else {
      deadlineText = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 前可取消`
    }
  } else if (diffHours > 0) {
    deadlineText = `开场前${minHours}小时内不可取消`
  } else {
    deadlineText = '已开场，不可取消'
  }

  return { rate, refundAmount, refundText, canCancel: diffHours > minHours || order.status === 'PENDING', deadlineText, isExpired: diffHours <= 0, activeTier }
}

export default function Orders() {
  const navigate = useNavigate()
  const { isLoggedIn, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('all')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketOrder, setTicketOrder] = useState<any>(null)

  // 全局 tick 用于倒计时刷新
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => getOrders({ pageSize: 50 }),
    enabled: isLoggedIn,
  })

  const { data: refundTiersData } = useQuery({
    queryKey: ['refundRules'],
    queryFn: () => getRefundRules(),
    enabled: isLoggedIn,
    staleTime: 1000 * 60 * 5,
  })

  const refundTiers = refundTiersData ?? [
    { hours: 24, rate: 100, label: '开场24小时前' },
    { hours: 2, rate: 50, label: '开场2-24小时' },
  ]

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['usable-coupons'] })
      queryClient.invalidateQueries({ queryKey: ['points-coupons'] })
      refreshUser()
      setCancelId(null)
    },
  })

  const allOrders = data?.data || []
  const orders = activeTab === 'all'
    ? allOrders
    : allOrders.filter((o: any) => o.status === activeTab)

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">我的订单</h1>
        </div>

        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'text-sm font-medium whitespace-nowrap pb-1 transition-colors relative',
                activeTab === t.key ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {t.label}
              {activeTab === t.key && (
                <motion.div layoutId="order-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
            <LogIn className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm mb-4">请先登录后查看订单</p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-2 rounded-xl text-sm font-medium text-white bg-gradient-accent"
            >
              去登录
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
            <ClipboardList className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">此处暂无数据</p>
          </div>
        ) : (
          orders.map((o: any, i: number) => {
            const s = statusMap[o.status] || { label: o.status, color: 'text-[var(--text-muted)]' }
            // 倒计时计算
            let countdownText = ''
            let isExpired = false
            if (o.status === 'PENDING' && o.expireAt) {
              const diff = new Date(o.expireAt).getTime() - Date.now()
              if (diff <= 0) {
                countdownText = '已过期'
                isExpired = true
              } else {
                const m = Math.floor(diff / 60000)
                const s = Math.floor((diff % 60000) / 1000)
                countdownText = `${m}分${s.toString().padStart(2, '0')}秒后过期`
              }
            }
            return (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 cursor-pointer hover:border-[var(--accent-primary)]/40 transition-colors"
                onClick={() => { setTicketOrder(o); setTicketOpen(true) }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{o.venueName}</h3>
                  <div className="flex items-center gap-2">
                    {countdownText && (
                      <span className={cn('text-[10px] font-medium flex items-center gap-0.5', isExpired ? 'text-[var(--error)]' : 'text-[var(--warning)]')}>
                        <Timer className="w-3 h-3" />
                        {countdownText}
                      </span>
                    )}
                    <span className={cn('text-xs font-medium', s.color)}>{s.label}</span>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-1">{o.bookingTime}</p>
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  {o.booking?.game?.title || 'VR体验'} · {o.booking?.personCount || 1}人
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-[var(--error)]">¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {o.couponDiscount > 0 && (
                      <span className="text-xs text-[var(--success)]">-¥{(o.couponDiscount / 100).toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {o.status === 'PENDING' && !isExpired && (
                      <button
                        onClick={() => navigate('/pay/' + o.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-gradient-accent"
                      >
                        去支付
                      </button>
                    )}
                    {(o.status === 'PENDING' || o.status === 'PAID') && (
                      <button
                        onClick={() => setCancelId(o.id)}
                        disabled={cancelMutation.isPending}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {cancelMutation.isPending && cancelId === o.id ? (
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        取消订单
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>
      {/* 取消确认弹窗 */}
      <AnimatePresence>
        {cancelId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0"
            onClick={() => setCancelId(null)}
          >
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl max-w-sm w-full border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
            >
              {(() => {
                const o = data?.data?.find((oo: any) => oo.id === cancelId)
                if (!o) return null
                const info = getRefundInfo(o, refundTiers)
                const isPaid = o.status === 'PAID'
                return (
                  <div className="p-5 space-y-4">
                    {/* 订单摘要 */}
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">{o.venueName}</h3>
                      <p className="text-xs text-[var(--text-muted)]">{o.bookingTime}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {o.booking?.game?.title || 'VR体验'} · {o.booking?.personCount || 1}人
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-[var(--error)]">¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <button
                          onClick={() => setCancelId(null)}
                          className="px-3 py-1 rounded-full text-xs font-medium text-[var(--error)] border border-[var(--error)]/40 hover:bg-[var(--error)]/10 transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" />
                          取消订单
                        </button>
                      </div>
                    </div>

                    {/* 最迟取消 */}
                    {isPaid && (
                      <div className="bg-[var(--bg-elevated)] rounded-xl p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--warning)] font-medium">最迟取消</span>
                          <span className="text-xs text-[var(--text-primary)] font-medium">{info.deadlineText}</span>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)]">{info.isExpired ? '已开场，超过后不可取消' : info.rate === 0 ? '开场前2小时内不可取消' : '按申请取消时间计算退费比例'}</p>
                      </div>
                    )}

                    {/* 阶梯式退费规则 */}
                    {isPaid && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-[var(--text-primary)]">阶梯式退费规则</span>
                          <span className="text-[10px] text-[var(--text-muted)]">按申请取消时间计算</span>
                        </div>
                        <div className={cn('grid gap-2', refundTiers.length >= 3 ? 'grid-cols-3' : refundTiers.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                          {[...refundTiers].sort((a, b) => b.hours - a.hours).map((tier, idx, arr) => {
                            const nextHours = arr[idx + 1]?.hours ?? 0
                            const isActive = info.activeTier?.hours === tier.hours
                            const rangeText = nextHours > 0 ? `开场${nextHours}~${tier.hours}小时` : `开场${tier.hours}小时内`
                            return (
                              <div key={tier.hours} className={cn('rounded-lg p-2 text-center border', isActive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)]')}>
                                <p className={cn('text-sm font-bold', isActive ? 'text-emerald-400' : 'text-[var(--text-muted)]')}>退{tier.rate}%</p>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{tier.label || rangeText}</p>
                              </div>
                            )
                          })}
                          <div className={cn('rounded-lg p-2 text-center border', info.rate === 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)]')}>
                            <p className={cn('text-sm font-bold', info.rate === 0 ? 'text-red-400' : 'text-[var(--text-muted)]')}>不退款</p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                              开场{refundTiers.length > 0 ? Math.min(...refundTiers.map((t) => t.hours)) : 2}小时内
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 退费金额确认 */}
                    {isPaid && (
                      <div className="bg-[var(--bg-elevated)] rounded-xl p-3 space-y-1">
                        <p className="text-xs font-medium text-[var(--text-primary)]">取消前请确认退费金额</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          系统已按当前时间自动计算可退金额，确认取消后将退回 <span className={cn('font-bold', info.rate === 0 ? 'text-[var(--error)]' : 'text-emerald-400')}>{info.refundText}</span>
                          {info.rate === 0 ? `（开场前${refundTiers.length > 0 ? Math.min(...refundTiers.map((t) => t.hours)) : 2}小时内取消不予退款）` : ''}
                        </p>
                      </div>
                    )}

                    {/* 待支付取消提示 */}
                    {!isPaid && (
                      <p className="text-sm text-[var(--text-secondary)]">
                        取消后订单将被关闭，优惠券将自动返还。
                      </p>
                    )}

                    {/* 按钮 */}
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={() => setCancelId(null)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] transition-colors"
                      >
                        保留订单
                      </button>
                      <button
                        onClick={() => {
                          if (isPaid && !info.canCancel) return
                          cancelMutation.mutate(cancelId)
                        }}
                        disabled={cancelMutation.isPending || (isPaid && !info.canCancel)}
                        className={cn(
                          'flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50',
                          isPaid && !info.canCancel
                            ? 'bg-[var(--text-muted)] cursor-not-allowed'
                            : 'bg-[var(--error)] hover:bg-red-600'
                        )}
                      >
                        {cancelMutation.isPending ? '取消中...' : isPaid && !info.canCancel ? '不可取消' : '确认取消'}
                      </button>
                    </div>
                  </div>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 入场券弹窗 */}
      <AnimatePresence>
        {ticketOpen && ticketOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setTicketOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl w-full max-w-sm overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-[var(--accent-primary)]/20 to-[var(--accent-secondary)]/20 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-[var(--accent-primary)]" />
                    <h3 className="text-base font-bold text-[var(--text-primary)]">入场券</h3>
                  </div>
                  <button
                    onClick={() => setTicketOpen(false)}
                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  订单号：{ticketOrder.orderNo}
                </p>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                {/* 状态 */}
                <div className="flex items-center justify-center">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
                    ticketOrder.status === 'PAID' ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' :
                    ticketOrder.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                  )}>
                    {ticketOrder.status === 'PAID' ? '待核销' :
                     ticketOrder.status === 'COMPLETED' ? '已完成' :
                     ticketOrder.status === 'CANCELLED' ? '已取消' :
                     ticketOrder.status === 'REFUNDED' ? '已退款' : ticketOrder.status}
                  </span>
                </div>

                {/* 订单信息 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">场地</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.venueName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">时间</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.bookingTime}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">游戏</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.booking?.game?.title || 'VR体验'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">人数</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.booking?.personCount || 1}人</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--border-subtle)] pt-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">实付金额</span>
                  <span className="text-lg font-bold text-[var(--error)]">
                    ¥{((ticketOrder.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* 支付方式 */}
                {ticketOrder.payMethod && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-[var(--text-muted)]">支付方式</span>
                    <span className="text-xs text-[var(--text-primary)]">
                      {ticketOrder.payMethod === 'BALANCE' ? '余额支付'
                        : ticketOrder.payMethod === 'WECHAT' ? '微信支付'
                        : ticketOrder.payMethod === 'ALIPAY' ? '支付宝'
                        : ticketOrder.payMethod === 'CASH' ? '现金'
                        : ticketOrder.payMethod === 'SCANBOX' ? '扫码盒'
                        : ticketOrder.payMethod}
                    </span>
                  </div>
                )}

                {/* QR Code */}
                {ticketOrder.status === 'PAID' || ticketOrder.status === 'COMPLETED' ? (
                  <div className="flex flex-col items-center pt-2">
                    <div className="bg-white rounded-xl p-3 shadow-sm">
                      <SimpleQRCode value={ticketOrder.id} size={160} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">出示二维码签到入场</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-mono">{ticketOrder.id.slice(0, 12)}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center pt-2 py-4">
                    <div className="w-40 h-40 bg-[var(--bg-elevated)] rounded-xl flex items-center justify-center border border-dashed border-[var(--border-subtle)]">
                      <QrCode className="w-10 h-10 text-[var(--text-muted)] opacity-30" />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      {ticketOrder.status === 'CANCELLED' ? '订单已取消，二维码已失效' :
                       ticketOrder.status === 'REFUNDED' ? '订单已退款，二维码已失效' :
                       '二维码未生成'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
