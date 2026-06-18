import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ClipboardList, LogIn, XCircle, MapPin, Clock, Calendar, Users, Ticket, QrCode, Timer, Star, ArrowRight } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrders, cancelOrder, payOrder } from '@/api/orders'
import { apiClient } from '@/api/client'
import { getRefundRules, getBookingLifecycle } from '@/api/settings'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { SimpleQRCode } from '@/components/SimpleQRCode'
import { useToast } from '@/hooks/useToast'
import { getImageUrl } from '@/lib/imageUrl'
import { getRefundInfo, canReschedule, formatAmount, timeToMinutes } from '@/lib/refund'
import { getBookingTargetPath } from '@/lib/selectedVenue'

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'PAID', label: '待核销' },
  { key: 'GROUP_BUY', label: '团购订单' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
]

const groupBuySubTabs = [
  { key: 'all', label: '全部' },
  { key: 'pending_use', label: '待使用' },
  { key: 'used', label: '已使用' },
]

function payMethodLabel(method?: string | null) {
  if (!method) return '-'
  const map: Record<string, string> = {
    BALANCE: '余额支付',
    WECHAT: '微信支付',
    ALIPAY: '支付宝',
    CASH: '现金',
    SCANBOX: '扫码盒',
  }
  return map[method] || method
}

function isRescheduledOrder(o: any) {
  return !o.groupBuyPackageId && (o.rescheduleCount || 0) > 0 && o.metadata?.originalStartTime
}

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
function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export default function Orders() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isLoggedIn, refreshUser, user } = useAuth()
  const queryClient = useQueryClient()
  const { toast, success: toastSuccess, error: toastError } = useToast()
  const initialTab = searchParams.get('tab') || 'all'
  const [activeTab, setActiveTab] = useState(tabs.some((t) => t.key === initialTab) ? initialTab : 'all')
  const initialSubTab = searchParams.get('subTab') || 'all'
  const [groupBuySubTab, setGroupBuySubTab] = useState(
    groupBuySubTabs.some((t) => t.key === initialSubTab) ? initialSubTab : 'all'
  )
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketOrder, setTicketOrder] = useState<any>(null)

  // 改签弹窗状态
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleOrder, setRescheduleOrder] = useState<any>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')

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
    mutationFn: (id: string) => cancelOrder(id),
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
    mutationFn: async ({ bookingId, date, startTime }: { bookingId: string; date: string; startTime: string }) => {
      const res = await apiClient.post(`/bookings/${bookingId}/reschedule`, { date, startTime, payMethod: 'BALANCE' })
      return res.data
    },
    onSuccess: async (data: any) => {
      const result = data.data
      queryClient.invalidateQueries({ queryKey: ['user-benefits'] })

      // 收费改签：跳转到统一支付页支付改签费
      if (result?.requirePayment && result?.feeOrder) {
        navigate(`/pay/${result.feeOrder.id}`)
        return
      }

      // 免费改签成功
      setRescheduleOpen(false)
      setRescheduleOrder(null)
      setRescheduleDate('')
      setRescheduleTime('')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      const fee = result?.feeAmount ?? 0
      const delta = result?.deltaAmount ?? 0
      const freeUsed = result?.freeRescheduleUsed
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

  // 计算所有时间段（含状态：available / joinable / full / occupied_by_other_game / maintenance）
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

    const slots: { time: string; end: string; status: string; currentCount: number; remainingCount: number }[] = []
    for (let m = openMinutes; m + gameDuration <= closeMinutes; m += gameDuration) {
      // 今天且已过当前时间 → 不显示
      if (isToday && m <= currentMinutes) continue

      const timeStr = minutesToTime(m)
      const endStr = minutesToTime(m + gameDuration)

      const inMaintenance =
        venueDetail.status === 'MAINTENANCE' &&
        venueDetail.maintenanceStartDate &&
        venueDetail.maintenanceEndDate &&
        venueDetail.maintenanceStartTime &&
        venueDetail.maintenanceEndTime &&
        rescheduleDate >= venueDetail.maintenanceStartDate.slice(0, 10) &&
        rescheduleDate <= venueDetail.maintenanceEndDate.slice(0, 10) &&
        (() => {
          const ms = timeToMinutes(venueDetail.maintenanceStartTime)
          const me = timeToMinutes(venueDetail.maintenanceEndTime)
          return m < me && (m + gameDuration) > ms
        })()

      if (inMaintenance) {
        slots.push({ time: timeStr, end: endStr, status: 'maintenance', currentCount: 0, remainingCount: 0 })
        continue
      }

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
  const orders = useMemo(() => {
    if (activeTab === 'all') return allOrders
    if (activeTab === 'PAID') {
      return allOrders.filter((o: any) => ['PAID', 'READY_TO_VERIFY', 'PLAYING'].includes(o.status) && o.orderKind !== 'FEE')
    }
    if (activeTab === 'CANCELLED') {
      return allOrders.filter((o: any) => ['CANCELLED', 'NO_SHOW', 'REFUNDED'].includes(o.status))
    }
    if (activeTab === 'GROUP_BUY') {
      const list = allOrders.filter((o: any) => !!o.groupBuyPackage && o.status !== 'CANCELLED')
      if (groupBuySubTab === 'pending_use') {
        // 待使用：仅未预约的团购券
        return list.filter((o: any) => o.status === 'PAID' && !o.booking)
      }
      if (groupBuySubTab === 'used') {
        // 已使用：已预约（有 booking）或已完成/作废/退款
        return list.filter((o: any) => o.booking || ['COMPLETED', 'NO_SHOW', 'REFUNDED'].includes(o.status))
      }
      return list
    }
    return allOrders.filter((o: any) => o.status === activeTab)
  }, [allOrders, activeTab, groupBuySubTab])

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
    const nextSubTab = searchParams.get('subTab') || 'all'
    if (groupBuySubTabs.some((t) => t.key === nextSubTab) && nextSubTab !== groupBuySubTab) {
      setGroupBuySubTab(nextSubTab)
    }
  }, [searchParams, activeTab, groupBuySubTab])

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
          <button onClick={() => navigate('/', { replace: true })} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
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
                setGroupBuySubTab('all')
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

        {/* 团购订单二级筛选 */}
        {activeTab === 'GROUP_BUY' && (
          <div className="max-w-lg mx-auto px-4 pt-1 pb-2">
            <div className="flex gap-2">
              {groupBuySubTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setGroupBuySubTab(t.key)
                    const params: Record<string, string> = { tab: activeTab }
                    if (t.key !== 'all') params.subTab = t.key
                    setSearchParams(params)
                  }}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                    groupBuySubTab === t.key
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
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
            // 改签费订单单独渲染
            if (o.orderKind === 'FEE') {
              return (
                <motion.div
                  key={o.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">{o.orderNo}</p>
                    <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 inline-flex items-center gap-1')}>
                      改签费
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--text-secondary)]">{o.feeReason || '改签手续费'}</span>
                        <span className="text-base font-black text-[var(--accent-primary)]">
                          ¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {o.parentOrder && (
                        <p className="text-xs text-[var(--text-muted)]">
                          关联订单：{o.parentOrder.orderNo}
                        </p>
                      )}
                      {o.refundAmount && o.refundAmount > 0 && (
                        <p className="text-xs text-[var(--error)]">
                          已退款 ¥{((o.refundAmount || 0) / 100).toFixed(2)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-4">
                      {o.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => cancelMutation.mutate(o.id)}
                            disabled={cancelMutation.isPending}
                            className="px-4 py-2 rounded-full text-xs font-bold text-[var(--error)] border border-[var(--error)]/25 hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => navigate('/pay/' + o.id)}
                            className="px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-accent shadow-glow-sm"
                          >
                            去支付
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => navigate(`/order/${o.id}`)}
                        className="px-4 py-2 rounded-full text-xs font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        查看详情
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            }

            const isGroupBuy = !!o.groupBuyPackage
            const groupBuyStatusMap: Record<string, { label: string; color: string }> = {
              PENDING: { label: '待支付', color: 'text-[var(--warning)]' },
              PAID: { label: '待使用', color: 'text-[var(--accent-primary)]' },
              READY_TO_VERIFY: { label: '待核销', color: 'text-blue-400' },
              PLAYING: { label: '使用中', color: 'text-emerald-400' },
              COMPLETED: { label: '已使用', color: 'text-[var(--success)]' },
              NO_SHOW: { label: '已作废', color: 'text-[var(--text-muted)]' },
              CANCELLED: { label: '已取消', color: 'text-[var(--text-muted)]' },
              REFUNDED: { label: '已退款', color: 'text-[var(--text-muted)]' },
            }
            const s = isGroupBuy
              ? (groupBuyStatusMap[o.status] || { label: o.status, color: 'text-[var(--text-muted)]' })
              : (statusMap[o.status] || { label: o.status, color: 'text-[var(--text-muted)]' })
            const isMaintenanceAffected = o.disruptionStatus === 'VENUE_MAINTENANCE'
            const displayStatus = isMaintenanceAffected
              ? { label: '场地维护', color: 'text-orange-500' }
              : s
            // 倒计时计算
            let countdownText = ''
            let isExpired = false
            if (o.status === 'PENDING' && o.expireAt) {
              const diff = new Date(o.expireAt).getTime() - Date.now()
              if (diff <= 0) {
                countdownText = '已过期'
                isExpired = true
              } else {
                const totalSec = Math.floor(diff / 1000)
                const d = Math.floor(totalSec / 86400)
                const h = Math.floor((totalSec % 86400) / 3600)
                const m = Math.floor((totalSec % 3600) / 60)
                const sec = totalSec % 60
                if (d > 0) {
                  countdownText = `${d}天${h}小时${m}分后过期`
                } else if (h > 0) {
                  countdownText = `${h}小时${m}分${sec.toString().padStart(2, '0')}秒后过期`
                } else {
                  countdownText = `${m}分${sec.toString().padStart(2, '0')}秒后过期`
                }
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
                key={o._displayTotal ? `${o.id}-${o._displayIndex}` : o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden cursor-pointer hover:border-[var(--accent-primary)]/40 transition-colors"
                onClick={() => {
                  if (isGroupBuy) {
                    navigate(`/order/${o.id}`)
                  } else {
                    setTicketOrder(o)
                    setTicketOpen(true)
                  }
                }}
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
                    <span className={cn(
                      'px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1',
                      isMaintenanceAffected ? 'bg-orange-50 border border-orange-200' : 'bg-[var(--bg-active)]',
                      displayStatus.color
                    )}>
                      <Clock className="w-3 h-3" />
                      {displayStatus.label}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex gap-3">
                    <div className="w-20 h-20 rounded-xl bg-[var(--bg-elevated)] overflow-hidden shrink-0">
                      <img
                        src={getImageUrl(o.groupBuyPackage?.coverImage || o.booking?.game?.coverImage || o.booking?.venue?.image || null)}
                        alt={o.groupBuyPackage?.title || o.booking?.game?.title || 'VR体验'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black text-[var(--text-primary)] truncate">{o.groupBuyPackage ? `【${o.groupBuyPackage.label}】${o.groupBuyPackage.title}` : (o.booking?.game?.title || 'VR体验')}</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{o.groupBuyPackage ? `${o.groupBuyPackage.venues?.length || 0}店通用` : o.venueName}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                        {o.groupBuyPackage ? (
                          <>{o.quantity || 1}份 · {o.groupBuyPackage.maxPeople * (o.quantity || 1)}人</>
                        ) : (
                          <><Clock className="w-3.5 h-3.5" />{o.bookingTime}<span className="mx-1">·</span>{o.booking?.personCount || 1}人</>
                        )}
                      </p>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-sm text-[var(--text-secondary)]">共</span>
                        <span className="text-base font-black text-[var(--accent-primary)]">¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {o.couponDiscount > 0 && (
                          <span className="text-xs text-[var(--success)]">优惠 ¥{(o.couponDiscount / 100).toFixed(2)}</span>
                        )}
                        {o.refundAmount && o.refundAmount > 0 && (
                          <span className="text-xs text-[var(--error)]">已退 ¥{((o.refundAmount || 0) / 100).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isMaintenanceAffected && (
                    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                      <p className="text-xs font-bold text-orange-600">该场次因场地维护受影响</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-orange-500">
                        可免费改签到其他可用场次，或申请全额退款。
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                    {o.status === 'PENDING' && !isExpired && (
                      <button
                        onClick={() => navigate('/pay/' + o.id)}
                        className="px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-accent shadow-glow-sm"
                      >
                        去支付
                      </button>
                    )}
                    {isGroupBuy && o.status === 'PENDING' && (
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
                        取消订单
                      </button>
                    )}
                    {isGroupBuy && ['PAID', 'READY_TO_VERIFY'].includes(o.status) && !o.booking && (
                      <>
                        <button
                          onClick={() => navigate(`/order/${o.id}`)}
                          className="px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-accent shadow-glow-sm"
                        >
                          去使用
                        </button>
                        <button
                          onClick={() => navigate(`/refund/${o.id}`)}
                          className="px-4 py-2 rounded-full text-xs font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                          退款
                        </button>
                      </>
                    )}
                    {(!isGroupBuy || o.booking) && (o.status === 'PENDING' || o.status === 'PAID' || o.status === 'READY_TO_VERIFY') && (
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
                        {o.status === 'PENDING' ? '取消订单' : isMaintenanceAffected ? '全额退款' : '取消预约'}
                      </button>
                    )}
                    {(!isGroupBuy || o.booking) && ['PAID', 'READY_TO_VERIFY', 'PLAYING'].includes(o.status) && (
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
                            if (isGroupBuy && o.groupBuyPackage?.id) {
                              navigate(`/group-buy/${o.groupBuyPackage.id}`)
                            } else if (orderGameId) {
                              navigate(getBookingTargetPath(orderGameId))
                            } else {
                              navigate('/venues')
                            }
                          }}
                          className="px-4 py-2 rounded-full text-xs font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                          {isGroupBuy ? '再来一单' : '再次预约'}
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
                          setRescheduleTime('')
                          setRescheduleOpen(true)
                        }}
                        className="px-4 py-2 rounded-full text-xs font-bold text-[var(--accent-primary)] border border-[var(--accent-primary)]/25 hover:bg-[var(--accent-primary)]/10 transition-colors"
                      >
                        {isMaintenanceAffected ? '免费改签' : '改签'}
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
                const isGroupBuy = !!o.groupBuyPackage
                const isMaintenanceAffected = o.disruptionStatus === 'VENUE_MAINTENANCE'
                const info = getRefundInfo(o, refundTiers, cancelHours)
                const isPaid = ['PAID', 'READY_TO_VERIFY'].includes(o.status)
                const refundText = (isGroupBuy || isMaintenanceAffected) ? `¥${((o.amount || 0) / 100).toFixed(2)}` : info.refundText
                const canCancel = isGroupBuy || isMaintenanceAffected ? true : info.canCancel
                return (
                  <div className="p-5 space-y-4">
                    {/* 标题 */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">{isMaintenanceAffected ? '确认全额退款？' : '确认取消订单？'}</h3>
                      <button onClick={() => setCancelId(null)} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors">
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>

                    {/* 订单信息 */}
                    <div className="bg-[var(--bg-elevated)] rounded-xl p-3 space-y-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{isGroupBuy ? o.groupBuyPackage.title : o.venueName}</p>
                      <p className="text-xs text-[var(--text-muted)]">{isGroupBuy ? `${o.groupBuyPackage.venues?.length || 0}店通用` : o.bookingTime}</p>
                      <p className="text-xs text-[var(--text-muted)]">{isGroupBuy ? `${o.quantity || 1}份 · 每份${o.groupBuyPackage.maxPeople}人` : `${o.booking?.game?.title || 'VR体验'} · ${o.booking?.personCount || 1}人`}</p>
                      <p className="text-sm font-bold text-[var(--error)] mt-1">¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>

                    {/* 退费说明 */}
                    {isPaid && (
                      <div className="space-y-2">
                        {isMaintenanceAffected ? (
                          <div className="rounded-xl p-3 bg-orange-500/10 border border-orange-500/20">
                            <p className="text-sm font-medium text-orange-500">场地维护影响，可全额退款 {refundText}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">确认后订单将取消，款项按原支付方式退回。</p>
                          </div>
                        ) : isGroupBuy ? (
                          <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-sm font-medium text-emerald-400">预计退回 {refundText}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">未核销前可全额退款</p>
                          </div>
                        ) : info.isExpired ? (
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
                            <p className="text-sm font-medium text-emerald-400">预计退回 {refundText}</p>
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
                          if (isPaid && !canCancel) return
                          cancelMutation.mutate(cancelId)
                        }}
                        disabled={cancelMutation.isPending || (isPaid && !canCancel)}
                        className={cn(
                          'flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50',
                          isPaid && !canCancel
                            ? 'bg-[var(--text-muted)] cursor-not-allowed'
                            : 'bg-[var(--error)] hover:bg-red-600'
                        )}
                      >
                        {cancelMutation.isPending ? '处理中...' : isPaid && !canCancel ? '不可取消' : isMaintenanceAffected ? '确认退款' : '确认取消'}
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
              className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-2xl w-full max-w-[365px] max-h-[92dvh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="px-5 pt-4 pb-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-[var(--accent-primary)]" />
                    <h3 className="text-base font-bold text-[var(--text-primary)]">入场券</h3>
                  </div>
                  <button
                    onClick={() => setTicketOpen(false)}
                    className="p-0.5 rounded-full text-slate-400 hover:text-[var(--text-primary)] hover:bg-slate-100 transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-[var(--text-secondary)]">订单号：{ticketOrder.orderNo}</p>
                  <span className="text-xs font-bold text-[var(--accent-primary)]">
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
              </div>

              {/* Content */}
              <div className="px-5 pb-5 space-y-3 overflow-y-auto">
                {/* 状态 */}
                <div className="hidden">
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

                {/* 改签时间（改签后的普通订单） */}
                {isRescheduledOrder(ticketOrder) && (
                  <div className="bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--accent-primary)]">改签时间</span>
                      <span className="text-xs text-[var(--text-secondary)]">请按改签后的时间到店核销</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">改签前</p>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{ticketOrder.metadata.originalBookingDate || '-'}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {ticketOrder.metadata.originalStartTime}{ticketOrder.metadata.originalEndTime ? `-${ticketOrder.metadata.originalEndTime}` : ''}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                      <div className="flex-1 bg-[var(--accent-primary)] rounded-xl p-2.5 text-center text-white">
                        <p className="text-[10px] text-white/80 mb-1">改签后</p>
                        <p className="text-xs font-bold">{(ticketOrder.booking?.date || '').slice(0, 10)}</p>
                        <p className="text-xs mt-0.5">
                          {ticketOrder.booking?.startTime}{ticketOrder.booking?.endTime ? `-${ticketOrder.booking?.endTime}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 开场倒计时 + 最迟入场（仅待核销状态） */}
                {['PAID', 'READY_TO_VERIFY'].includes(ticketOrder.status) && !ticketOrder.groupBuyPackageId && ticketOrder.booking?.date && ticketOrder.booking?.startTime && (() => {
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
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-blue-500 font-bold">距离开场</span>
                          <span className="text-sm font-mono font-bold text-[var(--accent-primary)]">{countdown}</span>
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
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-orange-500 font-medium">场次进行中</span>
                        <span className="text-xs text-[var(--text-muted)]">最迟入场 {lateEntryStr}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* 订单信息 */}
                {ticketOrder.groupBuyPackage ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">适用门店</p>
                        <p className="text-sm text-[var(--text-primary)]">{ticketOrder.groupBuyPackage.venues?.length > 0 ? ticketOrder.groupBuyPackage.venues.map((v: any) => v.name).join('、') : ticketOrder.venueName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">团购套餐</p>
                        <p className="text-sm text-[var(--text-primary)]">{ticketOrder.groupBuyPackage.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">份数 / 人数</p>
                        <p className="text-sm text-[var(--text-primary)]">{ticketOrder.quantity || 1}份 · 每份{ticketOrder.groupBuyPackage.maxPeople}人</p>
                      </div>
                    </div>
                    {ticketOrder.verifyCode && (
                      <div className="flex items-center gap-3">
                        <Ticket className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        <div>
                          <p className="text-xs text-[var(--text-muted)]">券码</p>
                          <p className="text-sm font-mono text-[var(--text-primary)]">{ticketOrder.verifyCode}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">场地</p>
                        <p className="text-sm text-[var(--text-primary)]">{ticketOrder.venueName}</p>
                      </div>
                    </div>
                    {!isRescheduledOrder(ticketOrder) && (
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        <div>
                          <p className="text-xs text-[var(--text-muted)]">时间</p>
                          <p className="text-sm text-[var(--text-primary)]">{ticketOrder.bookingTime}</p>
                        </div>
                      </div>
                    )}
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
                )}

                {ticketOrder.disruptionStatus === 'VENUE_MAINTENANCE' && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                    <p className="text-xs font-bold text-orange-600">该场次因场地维护受影响</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-orange-500">
                      可免费改签到其他可用场次，或申请全额退款。
                    </p>
                  </div>
                )}

                {/* 费用与支付 */}
                {isRescheduledOrder(ticketOrder) ? (
                  <div className="bg-white rounded-xl border border-[var(--border-subtle)] p-3 space-y-2">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">费用与支付</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--text-muted)]">原票实付金额</span>
                      <span className="text-sm font-bold text-[var(--error)]">
                        ¥{((ticketOrder.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {ticketOrder.payMethod && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-muted)]">原票支付方式</span>
                        <span className="text-xs text-[var(--text-primary)]">{payMethodLabel(ticketOrder.payMethod)}</span>
                      </div>
                    )}
                    {ticketOrder.refundAmount && ticketOrder.refundAmount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-muted)]">已退款</span>
                        <span className="text-sm font-bold text-red-400">
                          -¥{((ticketOrder.refundAmount || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {ticketOrder.feeOrders?.filter((feeOrder: any) => (feeOrder.amount || 0) > 0).map((feeOrder: any) => (
                      <div key={feeOrder.id}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--text-muted)]">关联改签费</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[var(--accent-primary)]">
                              ¥{((feeOrder.amount || 0) / 100).toFixed(2)}
                            </span>
                            {feeOrder.status === 'PENDING' && (
                              <button
                                onClick={() => navigate('/pay/' + feeOrder.id)}
                                className="px-2 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-accent"
                              >
                                去支付
                              </button>
                            )}
                          </div>
                        </div>
                        {feeOrder.payMethod && (
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-[var(--text-muted)]">改签费支付方式</span>
                            <span className="text-xs text-[var(--text-primary)]">{payMethodLabel(feeOrder.payMethod)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="border-t border-[var(--border-subtle)] pt-3 flex items-center justify-between">
                      <span className="text-xs text-[var(--text-muted)]">实付金额</span>
                      <span className="text-lg font-bold text-[var(--error)]">
                        ¥{((ticketOrder.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* 退款信息 */}
                    {ticketOrder.refundAmount && ticketOrder.refundAmount > 0 && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-[var(--text-muted)]">已退款</span>
                        <span className="text-sm font-bold text-red-400">
                          -¥{((ticketOrder.refundAmount || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* 关联改签费订单 */}
                    {ticketOrder.feeOrders && ticketOrder.feeOrders.length > 0 && (
                      <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
                        <span className="text-xs text-[var(--text-muted)]">关联改签费</span>
                        {ticketOrder.feeOrders.map((feeOrder: any) => (
                          <div key={feeOrder.id} className="flex items-center justify-between">
                            <span className="text-xs text-[var(--text-secondary)] font-mono">{feeOrder.orderNo}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[var(--accent-primary)]">
                                ¥{((feeOrder.amount || 0) / 100).toFixed(2)}
                              </span>
                              {feeOrder.status === 'PENDING' && (
                                <button
                                  onClick={() => navigate('/pay/' + feeOrder.id)}
                                  className="px-2 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-accent"
                                >
                                  去支付
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 支付方式 */}
                    {ticketOrder.payMethod && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-[var(--text-muted)]">支付方式</span>
                        <span className="text-xs text-[var(--text-primary)]">{payMethodLabel(ticketOrder.payMethod)}</span>
                      </div>
                    )}
                  </>
                )}

                {/* QR Code */}
                {['PAID', 'READY_TO_VERIFY', 'COMPLETED'].includes(ticketOrder.status) ? (
                  <div className="flex flex-col items-center pt-2">
                    <div className="bg-white rounded-xl p-3 shadow-sm">
                      <SimpleQRCode value={ticketOrder.verifyCode || ticketOrder.orderNo || ticketOrder.id} size={160} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">{ticketOrder.verifyCode ? '出示券码二维码到店核销' : '出示二维码签到入场'}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-mono">{ticketOrder.verifyCode || ticketOrder.orderNo || ticketOrder.id.slice(0, 12)}</p>
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
                          setRescheduleTime('')
                          setRescheduleOpen(true)
                          setTicketOpen(false)
                        }}
                        className="flex-1 h-10 rounded-lg text-sm font-medium text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 hover:bg-[var(--accent-primary)]/10 transition-colors"
                      >
                        {ticketOrder.disruptionStatus === 'VENUE_MAINTENANCE' ? '免费改签' : '改签'}
                      </button>
                    )}
                    <button
                      onClick={() => { setCancelId(ticketOrder.id); setTicketOpen(false) }}
                      className="flex-1 h-10 rounded-lg text-sm font-medium text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10 transition-colors"
                    >
                      {ticketOrder.disruptionStatus === 'VENUE_MAINTENANCE' ? '全额退款' : '取消订单'}
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
                    <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                      {slotOptions.map((slot) => {
                        const selected = rescheduleTime === slot.time
                        const isCurrentSlot = rescheduleDate === rescheduleOrder.booking?.date?.slice(0, 10) && slot.time === rescheduleOrder.booking?.startTime
                        const disabled = slot.status === 'full' || slot.status === 'occupied_by_other_game' || slot.status === 'maintenance' || isCurrentSlot
                        const visual =
                          slot.status === 'joinable'
                            ? {
                              card: 'border-emerald-200 bg-emerald-50/80 text-emerald-950',
                              sub: 'text-emerald-600',
                              badge: 'bg-emerald-100 text-emerald-600 border-emerald-200',
                              label: `余${slot.remainingCount}人`,
                              desc: `已约${slot.currentCount}人`,
                            }
                            : slot.status === 'full'
                            ? {
                              card: 'border-rose-200 bg-rose-50/80 text-rose-950',
                              sub: 'text-rose-500',
                              badge: 'bg-rose-100 text-rose-500 border-rose-200',
                              label: '已约满',
                              desc: '不可改签',
                            }
                            : slot.status === 'maintenance'
                            ? {
                              card: 'border-orange-200 bg-orange-50/80 text-orange-950',
                              sub: 'text-orange-500',
                              badge: 'bg-orange-100 text-orange-600 border-orange-200',
                              label: '维护中',
                              desc: '场地维护',
                            }
                            : slot.status === 'occupied_by_other_game'
                            ? {
                              card: 'border-sky-200 bg-sky-50/80 text-sky-950',
                              sub: 'text-sky-500',
                              badge: 'bg-sky-100 text-sky-600 border-sky-200',
                              label: '占用',
                              desc: '其他游戏',
                            }
                            : {
                              card: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]',
                              sub: 'text-[var(--text-muted)]',
                              badge: 'bg-indigo-50 text-[var(--accent-primary)] border-indigo-100',
                              label: '可改签',
                              desc: slot.remainingCount > 0 ? `余${slot.remainingCount}人` : '可预约',
                            }
                        const slotLabel = isCurrentSlot ? '当前' : visual.label
                        const slotDesc = isCurrentSlot ? '当前预约时间' : visual.desc
                        return (
                          <button
                            key={slot.time}
                            onClick={() => {
                              if (!disabled) setRescheduleTime(slot.time)
                            }}
                            disabled={disabled}
                            className={cn(
                              'min-h-[54px] rounded-xl border px-2.5 py-2 text-left transition-all',
                              selected
                                ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)] shadow-[0_8px_18px_rgba(79,70,229,0.22)]'
                                : disabled
                                ? cn(visual.card, 'cursor-not-allowed opacity-85')
                                : cn(visual.card, 'hover:border-[var(--accent-primary)]/50 active:scale-[0.98]')
                            )}
                          >
                            <span className="flex items-start justify-between gap-1">
                              <span className={cn('text-xs font-bold leading-tight', disabled && 'line-through decoration-current/60')}>
                                {slot.time}-{slot.end}
                              </span>
                              <span className={cn(
                                'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none',
                                selected ? 'border-white/35 bg-white/20 text-white' : visual.badge
                              )}>
                                {slotLabel}
                              </span>
                            </span>
                            <span className={cn(
                              'mt-1 block text-[10px] font-medium leading-none',
                              selected ? 'text-white/80' : visual.sub
                            )}>
                              {slotDesc}
                            </span>
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
