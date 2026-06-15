import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ClipboardList, LogIn, XCircle, MapPin, Clock, Calendar, Users, Ticket, QrCode, Timer, Star } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrders, cancelOrder } from '@/api/orders'
import { apiClient } from '@/api/client'
import { getRefundRules, getBookingLifecycle } from '@/api/settings'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { SimpleQRCode } from '@/components/SimpleQRCode'
import { useToast } from '@/hooks/useToast'
import type { RefundTier, RefundRules } from '@/api/settings'
import { getImageUrl } from '@/lib/imageUrl'
import { getBookingTargetPath } from '@/lib/selectedVenue'

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'PAID', label: '待核销' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
]

const statusMap: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待支付', color: 'text-[var(--warning)]' },
  PAID: { label: '已付款', color: 'text-[var(--accent-primary)]' },
  READY_TO_VERIFY: { label: '待核销', color: 'text-blue-400' },
  PLAYING: { label: '游戏中', color: 'text-emerald-400' },
  COMPLETED: { label: '已完成', color: 'text-[var(--success)]' },
  NO_SHOW: { label: '已作废', color: 'text-[var(--text-muted)]' },
  CANCELLED: { label: '已取消', color: 'text-[var(--text-muted)]' },
  REFUNDED: { label: '已退款', color: 'text-[var(--text-muted)]' },
}

/* ─── 阶梯退费计算（动态规则） ─── */
function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function canReschedule(order: any, lifecycle: any) {
  if (!['PAID', 'READY_TO_VERIFY'].includes(order.status)) return false
  const booking = order?.booking
  if (!booking?.date || !booking?.startTime) return false
  const startDate = new Date(booking.date)
  const [h, m] = booking.startTime.split(':')
  startDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  const now = new Date()
  const minutesSinceStart = (now.getTime() - startDate.getTime()) / (1000 * 60)
  const allowAfterStart = lifecycle?.rescheduleAllowAfterStart ?? true
  const afterStartMinutes = lifecycle?.rescheduleAfterStartMinutes ?? 15
  if (minutesSinceStart > afterStartMinutes) return false
  if (minutesSinceStart > 0 && !allowAfterStart) return false
  return true
}

function getRefundInfo(order: any, tiers: RefundTier[], cancelHours: number) {
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

  // 最迟取消提示（使用 cancelHours 作为不可取消阈值）
  let deadlineText = ''
  if (diffHours > cancelHours) {
    const d = new Date(startDate.getTime() - cancelHours * 60 * 60 * 1000)
    if (cancelHours >= 24) {
      deadlineText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 前可取消`
    } else {
      deadlineText = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 前可取消`
    }
  } else if (diffHours > 0) {
    deadlineText = `开场前${cancelHours}小时内不可取消`
  } else {
    deadlineText = '已开场，不可取消'
  }

  return { rate, refundAmount, refundText, canCancel: diffHours > cancelHours || order.status === 'PENDING', deadlineText, isExpired: diffHours <= 0, activeTier }
}

export default function Orders() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isLoggedIn, refreshUser, user } = useAuth()
  const queryClient = useQueryClient()
  const { toast, success: toastSuccess, error: toastError } = useToast()
  const initialTab = searchParams.get('tab') || 'all'
  const [activeTab, setActiveTab] = useState(tabs.some((t) => t.key === initialTab) ? initialTab : 'all')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketOrder, setTicketOrder] = useState<any>(null)

  // 改签弹窗状态
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleOrder, setRescheduleOrder] = useState<any>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [reschedulePayMethod, setReschedulePayMethod] = useState<'BALANCE' | 'WECHAT' | 'ALIPAY'>('BALANCE')

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

  const { data: refundRulesData } = useQuery({
    queryKey: ['refundRules'],
    queryFn: () => getRefundRules(),
    enabled: isLoggedIn,
    staleTime: 1000 * 60 * 5,
  })

  const { data: lifecycleData } = useQuery({
    queryKey: ['bookingLifecycle'],
    queryFn: () => getBookingLifecycle(),
    enabled: isLoggedIn,
    staleTime: 1000 * 60 * 5,
  })

  const { data: benefitData } = useQuery({
    queryKey: ['user-benefits'],
    queryFn: async () => {
      const res = await apiClient.get('/user-benefits')
      return res.data.data as {
        freeReschedule?: {
          totalQuota: number
          usedQuota: number
          remaining: number
        }
      }
    },
    enabled: isLoggedIn,
    staleTime: 1000 * 30,
  })

  const lateBufferMinutes = lifecycleData?.lateBufferMinutes ?? 10

  const refundTiers = refundRulesData?.tiers ?? [
    { hours: 24, rate: 100, label: '开场24小时前' },
    { hours: 2, rate: 50, label: '开场2-24小时' },
  ]
  const cancelHours = refundRulesData?.cancelHours ?? 2

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['usable-coupons'] })
      queryClient.invalidateQueries({ queryKey: ['points-coupons'] })
      refreshUser()
      setCancelId(null)
      toastSuccess('订单已取消')
    },
    onError: (error: any) => {
      toastError('取消订单失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const rescheduleMutation = useMutation({
    mutationFn: async ({ bookingId, date, startTime, payMethod }: { bookingId: string; date: string; startTime: string; payMethod?: string }) => {
      const res = await apiClient.post(`/bookings/${bookingId}/reschedule`, { date, startTime, payMethod })
      return res.data
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['user-benefits'] })
      setRescheduleOpen(false)
      setRescheduleOrder(null)
      setRescheduleDate('')
      setRescheduleTime('')
      const fee = data.data?.feeAmount ?? 0
      const delta = data.data?.deltaAmount ?? 0
      const freeUsed = data.data?.freeRescheduleUsed
      let msg = '改签成功！'
      if (freeUsed) msg += '已使用本月免费改签权益，免手续费。'
      else if (fee > 0) msg += `手续费：¥${(fee / 100).toFixed(2)}。`
      if (delta > 0) msg += `需补差价：¥${(delta / 100).toFixed(2)}。`
      else if (delta < 0) msg += `退回差价：¥${(Math.abs(delta) / 100).toFixed(2)}。`
      toastSuccess(msg)
    },
    onError: (error: any) => {
      toastError('改签失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  // 查询场地信息（用于生成可改签时间段）
  const { data: venueDetail } = useQuery({
    queryKey: ['venue-detail', rescheduleOrder?.booking?.venueId],
    queryFn: () => apiClient.get(`/venues/${rescheduleOrder.booking.venueId}`).then((r) => r.data.data),
    enabled: !!rescheduleOrder?.booking?.venueId,
  })

  // 查询目标日期的 bookings（用于冲突检测）
  const { data: dayBookingsData } = useQuery({
    queryKey: ['bookings-day', rescheduleOrder?.booking?.venueId, rescheduleDate],
    queryFn: () => apiClient.get(`/bookings?venueId=${rescheduleOrder.booking.venueId}&date=${rescheduleDate}`).then((r) => r.data.data),
    enabled: !!rescheduleOrder?.booking?.venueId && !!rescheduleDate,
  })

  // 计算所有时间段（含状态：available / joinable / full / occupied_by_other_game）
  const slotOptions = useMemo(() => {
    if (!venueDetail || !rescheduleOrder?.booking?.startTime || !rescheduleOrder?.booking?.endTime) return []
    const gameDuration = rescheduleOrder.booking.game?.duration
      || (timeToMinutes(rescheduleOrder.booking.endTime) - timeToMinutes(rescheduleOrder.booking.startTime))
    const openMinutes = venueDetail.openTime ? timeToMinutes(venueDetail.openTime) : 9 * 60
    const closeMinutes = venueDetail.closeTime ? timeToMinutes(venueDetail.closeTime) : 21 * 60
    const deviceCount = venueDetail.deviceCount || 1
    const bookings = dayBookingsData || []
    const selfBookingId = rescheduleOrder.booking.id
    const myGameId = rescheduleOrder.booking.gameId
    const myPersonCount = rescheduleOrder.booking.personCount || 1

    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const isToday = rescheduleDate === todayStr
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const originalDateStr = rescheduleOrder.booking.date?.slice(0, 10)
    const originalEndMinutes = timeToMinutes(rescheduleOrder.booking.endTime)

    const slots: { time: string; end: string; status: string; currentCount: number; remainingCount: number }[] = []
    for (let m = openMinutes; m + gameDuration <= closeMinutes; m += gameDuration) {
      // 今天且已过当前时间 → 不显示
      if (isToday && m <= currentMinutes) continue

      // 与原订单同一天且在原订单结束时间之前 → 不显示
      if (rescheduleDate === originalDateStr && m < originalEndMinutes) continue

      const timeStr = minutesToTime(m)
      const endStr = minutesToTime(m + gameDuration)

      const overlapping = bookings.filter((b: any) => {
        if (b.status === 'CANCELLED') return false
        if (b.id === selfBookingId) return false
        const bs = timeToMinutes(b.startTime)
        const be = timeToMinutes(b.endTime)
        return m < be && (m + gameDuration) > bs
      })

      if (overlapping.length === 0) {
        slots.push({ time: timeStr, end: endStr, status: 'available', currentCount: 0, remainingCount: deviceCount })
      } else {
        // 检查是否有其他游戏占用
        const otherGameBooking = overlapping.some((b: any) => b.gameId && b.gameId !== myGameId)
        if (otherGameBooking) {
          slots.push({ time: timeStr, end: endStr, status: 'occupied_by_other_game', currentCount: 0, remainingCount: 0 })
        } else {
          const sameGameBookings = overlapping.filter((b: any) => b.gameId === myGameId)
          const currentCount = sameGameBookings.reduce((sum: number, b: any) => sum + (b.personCount || 1), 0)
          if (currentCount + myPersonCount > deviceCount) {
            slots.push({ time: timeStr, end: endStr, status: 'full', currentCount, remainingCount: 0 })
          } else {
            slots.push({ time: timeStr, end: endStr, status: 'joinable', currentCount, remainingCount: deviceCount - currentCount })
          }
        }
      }
    }
    return slots
  }, [venueDetail, dayBookingsData, rescheduleDate, rescheduleOrder])

  const allOrders = data?.data || []
  const orders = activeTab === 'all'
    ? allOrders
    : activeTab === 'PAID'
      ? allOrders.filter((o: any) => ['PAID', 'READY_TO_VERIFY', 'PLAYING'].includes(o.status))
      : activeTab === 'CANCELLED'
        ? allOrders.filter((o: any) => ['CANCELLED', 'NO_SHOW', 'REFUNDED'].includes(o.status))
        : allOrders.filter((o: any) => o.status === activeTab)

  const lastExpiredSyncKey = useRef('')
  const expiredPendingKey = useMemo(() => {
    return allOrders
      .filter((o: any) => o.status === 'PENDING' && o.expireAt && new Date(o.expireAt).getTime() <= Date.now())
      .map((o: any) => o.id)
      .sort()
      .join(',')
  }, [allOrders, tick])

  useEffect(() => {
    if (!expiredPendingKey || expiredPendingKey === lastExpiredSyncKey.current) return
    lastExpiredSyncKey.current = expiredPendingKey
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }, [expiredPendingKey, queryClient])

  useEffect(() => {
    const nextTab = searchParams.get('tab') || 'all'
    if (tabs.some((t) => t.key === nextTab) && nextTab !== activeTab) {
      setActiveTab(nextTab)
    }
  }, [searchParams, activeTab])

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[var(--border-subtle)]">
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
              onClick={() => {
                setActiveTab(t.key)
                setSearchParams(t.key === 'all' ? {} : { tab: t.key })
              }}
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
                const sec = Math.floor((diff % 60000) / 1000)
                countdownText = `${m}分${sec.toString().padStart(2, '0')}秒后过期`
              }
            } else if (o.booking?.date && o.booking?.startTime && ['PAID', 'READY_TO_VERIFY'].includes(o.status)) {
              const startDate = new Date(o.booking.date)
              const [h, m] = o.booking.startTime.split(':')
              startDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
              const diff = startDate.getTime() - Date.now()
              if (diff > 0) {
                const hours = Math.floor(diff / 3600000)
                const mins = Math.floor((diff % 3600000) / 60000)
                countdownText = hours > 0 ? `${hours}小时${mins}分后开场` : `${mins}分钟后开场`
              } else {
                countdownText = '场次已开始'
              }
            }
            const orderGameId = o.booking?.game?.id || o.booking?.gameId || o.booking?.game?.gameId
            return (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden cursor-pointer hover:border-[var(--accent-primary)]/40 transition-colors"
                onClick={() => { setTicketOrder(o); setTicketOpen(true) }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">{o.orderNo}</p>
                  <div className="flex items-center gap-2">
                    {countdownText && (
                      <span className={cn('text-[10px] font-medium flex items-center gap-0.5', isExpired ? 'text-[var(--error)]' : 'text-[var(--warning)]')}>
                        <Timer className="w-3 h-3" />
                        {countdownText}
                      </span>
                    )}
                    <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--bg-active)] inline-flex items-center gap-1', s.color)}>
                      <Clock className="w-3 h-3" />
                      {s.label}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex gap-3">
                    <div className="w-20 h-20 rounded-xl bg-[var(--bg-elevated)] overflow-hidden shrink-0">
                      <img
                        src={getImageUrl(o.booking?.game?.coverImage || o.booking?.venue?.image || null)}
                        alt={o.booking?.game?.title || 'VR体验'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black text-[var(--text-primary)] truncate">{o.booking?.game?.title || 'VR体验'}</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{o.venueName}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />{o.bookingTime}
                        <span className="mx-1">·</span>{o.booking?.personCount || 1}人
                      </p>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-sm text-[var(--text-secondary)]">共</span>
                        <span className="text-base font-black text-[var(--accent-primary)]">¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {o.couponDiscount > 0 && (
                          <span className="text-xs text-[var(--success)]">优惠 ¥{(o.couponDiscount / 100).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                    {o.status === 'PENDING' && !isExpired && (
                      <button
                        onClick={() => navigate('/pay/' + o.id)}
                        className="px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-accent shadow-glow-sm"
                      >
                        去支付
                      </button>
                    )}
                    {(o.status === 'PENDING' || o.status === 'PAID' || o.status === 'READY_TO_VERIFY') && (
                      <button
                        onClick={() => setCancelId(o.id)}
                        disabled={cancelMutation.isPending}
                        className="px-4 py-2 rounded-full text-xs font-bold text-[var(--error)] border border-[var(--error)]/25 hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {cancelMutation.isPending && cancelId === o.id ? (
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {o.status === 'PENDING' ? '取消订单' : '取消预约'}
                      </button>
                    )}
                    {['PAID', 'READY_TO_VERIFY', 'PLAYING'].includes(o.status) && (
                      <button
                        onClick={() => { setTicketOrder(o); setTicketOpen(true) }}
                        className="px-4 py-2 rounded-full text-xs font-bold text-[var(--accent-primary)] border border-[var(--accent-primary)]/25 hover:bg-[var(--accent-primary)]/10 transition-colors inline-flex items-center gap-1"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        查看凭证
                      </button>
                    )}
                    {o.status === 'COMPLETED' && (
                      <>
                        <button
                          onClick={() => {
                            if (orderGameId) navigate(getBookingTargetPath(orderGameId))
                            else navigate('/venues')
                          }}
                          className="px-4 py-2 rounded-full text-xs font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                          再次预约
                        </button>
                        <button
                          onClick={() => toastSuccess('评价功能即将开放')}
                          className="px-4 py-2 rounded-full text-xs font-bold text-amber-600 border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors inline-flex items-center gap-1"
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                          评价
                        </button>
                      </>
                    )}
                    {canReschedule(o, lifecycleData) && (
                      <button
                        onClick={() => {
                          setRescheduleOrder(o)
                          setRescheduleDate(o.booking?.date ? o.booking.date.slice(0, 10) : '')
                          setRescheduleTime(o.booking?.startTime || '')
                          setReschedulePayMethod('BALANCE')
                          setRescheduleOpen(true)
                        }}
                        className="px-4 py-2 rounded-full text-xs font-bold text-[var(--accent-primary)] border border-[var(--accent-primary)]/25 hover:bg-[var(--accent-primary)]/10 transition-colors"
                      >
                        改签
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
                const info = getRefundInfo(o, refundTiers, cancelHours)
                const isPaid = ['PAID', 'READY_TO_VERIFY'].includes(o.status)
                return (
                  <div className="p-5 space-y-4">
                    {/* 标题 */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">确认取消订单？</h3>
                      <button onClick={() => setCancelId(null)} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors">
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>

                    {/* 订单信息 */}
                    <div className="bg-[var(--bg-elevated)] rounded-xl p-3 space-y-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{o.venueName}</p>
                      <p className="text-xs text-[var(--text-muted)]">{o.bookingTime}</p>
                      <p className="text-xs text-[var(--text-muted)]">{o.booking?.game?.title || 'VR体验'} · {o.booking?.personCount || 1}人</p>
                      <p className="text-sm font-bold text-[var(--error)] mt-1">¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>

                    {/* 退费说明 */}
                    {isPaid && (
                      <div className="space-y-2">
                        {info.isExpired ? (
                          <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20">
                            <p className="text-sm font-medium text-red-400">已过最迟取消时间</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">该订单已开场或超出取消时限，不可取消</p>
                          </div>
                        ) : info.rate === 0 ? (
                          <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20">
                            <p className="text-sm font-medium text-red-400">开场前{cancelHours}小时内不可退款</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">确认取消后订单将关闭，款项不予退回</p>
                          </div>
                        ) : (
                          <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-sm font-medium text-emerald-400">预计退回 {info.refundText}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">{info.activeTier?.label || `按当前退费规则退${info.rate * 100}%`}</p>
                          </div>
                        )}
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
                          if (!cancelId) return
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
                    ticketOrder.status === 'PAID' || ticketOrder.status === 'READY_TO_VERIFY' ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' :
                    ticketOrder.status === 'PLAYING' ? 'bg-emerald-500/10 text-emerald-400 animate-pulse' :
                    ticketOrder.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                  )}>
                    {ticketOrder.status === 'PENDING' ? '待支付' :
                     ticketOrder.status === 'PAID' ? '已付款' :
                     ticketOrder.status === 'READY_TO_VERIFY' ? '待核销' :
                     ticketOrder.status === 'PLAYING' ? '游戏中' :
                     ticketOrder.status === 'COMPLETED' ? '已完成' :
                     ticketOrder.status === 'NO_SHOW' ? '已作废' :
                     ticketOrder.status === 'CANCELLED' ? '已取消' :
                     ticketOrder.status === 'REFUNDED' ? '已退款' : ticketOrder.status}
                  </span>
                </div>

                {/* 开场倒计时 + 最迟入场（仅待核销状态） */}
                {['PAID', 'READY_TO_VERIFY'].includes(ticketOrder.status) && ticketOrder.booking?.date && ticketOrder.booking?.startTime && (() => {
                  const startDate = new Date(ticketOrder.booking.date)
                  const [h, m] = ticketOrder.booking.startTime.split(':')
                  startDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
                  const diff = startDate.getTime() - Date.now()
                  const lateEntry = new Date(startDate.getTime() + lateBufferMinutes * 60 * 1000)
                  const lateEntryStr = `${String(lateEntry.getHours()).padStart(2, '0')}:${String(lateEntry.getMinutes()).padStart(2, '0')}`
                  if (diff > 0) {
                    const hours = Math.floor(diff / 3600000)
                    const mins = Math.floor((diff % 3600000) / 60000)
                    const secs = Math.floor((diff % 60000) / 1000)
                    const countdown = hours > 0
                      ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
                      : `${mins}:${String(secs).padStart(2, '0')}`
                    return (
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-blue-400 font-medium">距离开场</span>
                          <span className="text-sm font-mono font-bold text-blue-400">{countdown}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--text-muted)]">最迟入场</span>
                          <span className="text-xs text-[var(--text-primary)]">{ticketOrder.booking.startTime} ~ {lateEntryStr}</span>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          请提前 {lifecycleData?.verifyAdvanceMinutes ?? 15} 分钟到场进行佩戴教学
                        </p>
                      </div>
                    )
                  }
                  return (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-orange-400 font-medium">场次进行中</span>
                        <span className="text-xs text-[var(--text-muted)]">最迟入场 {lateEntryStr}</span>
                      </div>
                    </div>
                  )
                })()}

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
                {['PAID', 'READY_TO_VERIFY', 'COMPLETED'].includes(ticketOrder.status) ? (
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
                      {ticketOrder.status === 'PLAYING' ? '游戏进行中，已签到入场' :
                       ticketOrder.status === 'NO_SHOW' ? '订单已作废，二维码已失效' :
                       ticketOrder.status === 'CANCELLED' ? '订单已取消，二维码已失效' :
                       ticketOrder.status === 'REFUNDED' ? '订单已退款，二维码已失效' :
                       '二维码未生成'}
                    </p>
                  </div>
                )}

                {/* 操作按钮 */}
                {['PAID', 'READY_TO_VERIFY'].includes(ticketOrder.status) && (
                  <div className="flex items-center gap-2 pt-2">
                    {canReschedule(ticketOrder, lifecycleData) && (
                      <button
                        onClick={() => {
                          setRescheduleOrder(ticketOrder)
                          setRescheduleDate(ticketOrder.booking?.date ? ticketOrder.booking.date.slice(0, 10) : '')
                          setRescheduleTime(ticketOrder.booking?.startTime || '')
                          setReschedulePayMethod('BALANCE')
                          setRescheduleOpen(true)
                          setTicketOpen(false)
                        }}
                        className="flex-1 h-10 rounded-lg text-sm font-medium text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 hover:bg-[var(--accent-primary)]/10 transition-colors"
                      >
                        改签
                      </button>
                    )}
                    <button
                      onClick={() => { setCancelId(ticketOrder.id); setTicketOpen(false) }}
                      className="flex-1 h-10 rounded-lg text-sm font-medium text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10 transition-colors"
                    >
                      取消订单
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      {toast.visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            'fixed top-20 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-xl text-sm text-white shadow-lg max-w-[80%] text-center',
            toast.type === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
          )}
        >
          {toast.message}
        </motion.div>
      )}

      {/* 改签弹窗 */}
      <AnimatePresence>
        {rescheduleOpen && rescheduleOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0"
            onClick={() => setRescheduleOpen(false)}
          >
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl max-w-sm w-full border border-[var(--border-subtle)] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* 弹窗头部 */}
              <div className="p-5 pb-3 shrink-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">预约改签</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">订单：{rescheduleOrder.orderNo}</p>
              </div>

              {/* 可滚动内容区 */}
              <div className="px-5 pb-5 overflow-y-auto space-y-4">
                {/* 原订单信息卡片 */}
                <div className="bg-[var(--bg-elevated)] rounded-xl p-3 space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">原订单信息</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-primary)]">{rescheduleOrder.venueName}</span>
                    <span className="text-xs text-[var(--text-muted)]">{rescheduleOrder.booking?.game?.title || 'VR体验'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {rescheduleOrder.booking?.date?.slice(0, 10)} {rescheduleOrder.booking?.startTime} ~ {rescheduleOrder.booking?.endTime}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{rescheduleOrder.booking?.personCount || 1}人</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
                    <span className="text-xs text-[var(--text-muted)]">实付金额</span>
                    <span className="text-sm font-bold text-[var(--error)]">¥{((rescheduleOrder.amount || 0) / 100).toFixed(2)}</span>
                  </div>
                </div>

                {/* 日期选择 */}
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-2">选择新日期</label>
                  <div className="flex gap-2 mb-2">
                    {(() => {
                      const today = new Date()
                      const dates: { date: string; label: string }[] = []
                      for (let i = 0; i < 5; i++) {
                        const d = new Date(today)
                        d.setDate(today.getDate() + i)
                        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                        const labels = ['今天', '明天', '后天']
                        dates.push({ date: ds, label: labels[i] || `${d.getMonth() + 1}/${d.getDate()}` })
                      }
                      return dates.map((d) => (
                        <button
                          key={d.date}
                          onClick={() => { setRescheduleDate(d.date); setRescheduleTime('') }}
                          className={cn(
                            'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                            rescheduleDate === d.date
                              ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50'
                          )}
                        >
                          {d.label}
                        </button>
                      ))
                    })()}
                  </div>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleTime('') }}
                    className="w-full h-9 px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                {/* 场次选择 */}
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-2">选择场次</label>
                  {!rescheduleDate ? (
                    <p className="text-xs text-[var(--text-muted)] py-3 text-center bg-[var(--bg-elevated)] rounded-lg">请先选择日期</p>
                  ) : !venueDetail ? (
                    <div className="py-3 text-center bg-[var(--bg-elevated)] rounded-lg">
                      <div className="w-4 h-4 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-1" />
                      <p className="text-xs text-[var(--text-muted)]">加载场次中...</p>
                    </div>
                  ) : slotOptions.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] py-3 text-center bg-[var(--bg-elevated)] rounded-lg">该日期暂无可选场次，请尝试其他日期</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {slotOptions.map((slot) => {
                        const disabled = slot.status === 'full' || slot.status === 'occupied_by_other_game'
                        return (
                          <button
                            key={slot.time}
                            onClick={() => {
                              if (!disabled) setRescheduleTime(slot.time)
                            }}
                            disabled={disabled}
                            className={cn(
                              'py-2 rounded-lg text-xs font-medium border transition-colors flex flex-col items-center justify-center leading-tight',
                              disabled
                                ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)] cursor-not-allowed opacity-60'
                                : rescheduleTime === slot.time
                                  ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50'
                            )}
                          >
                            <span className={cn(disabled && 'line-through opacity-70')}>{slot.time}</span>
                            {slot.status === 'full' && <span className="text-[9px] text-red-400 mt-0.5">已满</span>}
                            {slot.status === 'occupied_by_other_game' && <span className="text-[9px] text-orange-400 mt-0.5">占用</span>}
                            {slot.status === 'joinable' && <span className="text-[9px] text-emerald-400 mt-0.5">余{slot.remainingCount}人</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {rescheduleTime && (
                    <p className="text-xs text-[var(--accent-primary)] mt-2 text-center">
                      已选择：{rescheduleTime} ~ {slotOptions.find((s) => s.time === rescheduleTime)?.end}
                    </p>
                  )}
                </div>

                {/* 改签规则与费用预估 */}
                {rescheduleTime && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-medium text-amber-400">改签说明</p>
                    {(() => {
                      const feeRate = lifecycleData?.rescheduleFeeRate ?? 10
                      const originalAmount = rescheduleOrder.amount || 0
                      const feeAmount = Math.floor(originalAmount * feeRate / 100)
                      const level = user?.level
                      const freeUsage = benefitData?.freeReschedule
                      const freeQuota = freeUsage?.totalQuota ?? (level === 'VIP_PLUS' ? 4 : level === 'VIP' ? 2 : level === 'MEMBER' ? 1 : 0)
                      const usedQuota = freeUsage?.usedQuota ?? 0
                      return (
                        <>
                          <p className="text-xs text-[var(--text-secondary)]">
                            手续费：按原订单金额 {feeRate}% 收取（¥{(feeAmount / 100).toFixed(2)}）
                          </p>
                          {freeQuota > 0 ? (
                            <p className="text-xs text-emerald-400">
                              {level === 'VIP_PLUS' ? 'VIP+' : level === 'VIP' ? 'VIP' : '会员'}每月可免费改签 {freeQuota} 次，已使用 {usedQuota} 次
                            </p>
                          ) : (
                            <p className="text-xs text-[var(--text-muted)]">当前等级无免费改签权益</p>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* 支付方式选择 */}
                {rescheduleTime && (
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-2">支付方式</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'BALANCE', label: '余额支付' },
                        { key: 'WECHAT', label: '微信支付' },
                        { key: 'ALIPAY', label: '支付宝' },
                      ].map((m) => (
                        <button
                          key={m.key}
                          onClick={() => setReschedulePayMethod(m.key as any)}
                          className={cn(
                            'py-2 rounded-lg text-xs font-medium border transition-colors',
                            reschedulePayMethod === m.key
                              ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50'
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="p-5 pt-0 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRescheduleOpen(false)}
                    className="flex-1 h-10 rounded-lg text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      if (!rescheduleDate || !rescheduleTime) {
                        toastError('请选择新日期和场次')
                        return
                      }
                      if (!rescheduleOrder.booking?.id) {
                        toastError('订单未关联预约')
                        return
                      }
                      rescheduleMutation.mutate({
                        bookingId: rescheduleOrder.booking.id,
                        date: rescheduleDate,
                        startTime: rescheduleTime,
                        payMethod: reschedulePayMethod,
                      })
                    }}
                    disabled={rescheduleMutation.isPending || !rescheduleTime}
                    className="flex-1 h-10 rounded-lg text-sm font-medium text-white bg-gradient-accent disabled:opacity-50"
                  >
                    {rescheduleMutation.isPending ? '处理中...' : '确认改签'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
