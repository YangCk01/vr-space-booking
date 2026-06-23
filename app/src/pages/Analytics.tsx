import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  CalendarCheck,
  Gauge,
  Receipt,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Calendar,
  ChevronDown,
  Repeat,
  Gamepad2,
  CreditCard,
  PieChart,
  Clock,
  Users,
  MapPin,
  ShoppingCart,
  Ticket,
  Maximize,
  Minimize,
  RefreshCw,
  Headset,
  ArrowLeft,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart as RePieChart,
  Pie,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import {
  getDashboard,
  getRevenue,
  getVenueRevenueRanking,
  getTimeDistribution,
  getUserGrowth,
  getPaymentMethodDistribution,
  getOrderStatusDistribution,
  getRepurchaseRate,
  getGamePopularity,
} from '@/api/analytics'
import { format, subDays } from 'date-fns'
import { getImageUrl } from '@/lib/imageUrl'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type DateRange = 'today' | '7days' | '30days' | '90days' | 'custom'

/* ------------------------------------------------------------------ */
/*  Static config                                                      */
/* ------------------------------------------------------------------ */
const dateRangeMap: Record<DateRange, string> = {
  today: '当天',
  '7days': '近7天',
  '30days': '近30天',
  '90days': '近90天',
  custom: '自定义',
}

const STATUS_COLORS: Record<string, string> = {
  '待支付': '#F59E0B',
  '已支付': '#3B82F6',
  '待核销': '#60A5FA',
  '游戏中': '#10B981',
  '已完成': '#059669',
  '已取消': '#64748B',
  '退款中': '#EF4444',
  '已退款': '#8B5CF6',
  '已作废': '#475569',
}

const PAYMENT_COLORS: Record<string, string> = {
  '微信支付': '#10B981',
  '支付宝': '#3B82F6',
  '余额支付': '#F59E0B',
  '现金': '#64748B',
  '刷卡': '#8B5CF6',
}

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function formatTime(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDate(d: Date) {
  const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return days[d.getDay()]
}

/* ------------------------------------------------------------------ */
/*  Animated Counter                                                   */
/* ------------------------------------------------------------------ */
const AnimatedCounter = memo(function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const duration = 800
    const start = display
    const diff = value - start
    if (diff === 0) return
    const startTime = performance.now()
    let raf: number
    const step = (t: number) => {
      const elapsed = t - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + diff * eased))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <span className={className}>
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  )
})

/* ------------------------------------------------------------------ */
/*  CountUp hook                                                       */
/* ------------------------------------------------------------------ */
function useCountUp(target: number, duration: number = 800, delay: number = 0, decimals: number = 0) {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      const step = (ts: number) => {
        if (startRef.current === null) startRef.current = ts
        const progress = Math.min((ts - startRef.current) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        const factor = Math.pow(10, decimals)
        setValue(Math.round(eased * target * factor) / factor)
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step)
        }
      }
      rafRef.current = requestAnimationFrame(step)
    }, delay)

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay, decimals])

  return value
}

/* ------------------------------------------------------------------ */
/*  Panel Card (big-screen style)                                      */
/* ------------------------------------------------------------------ */
function PanelCard({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease }}
      className={cn(
        'relative rounded-lg border p-5 overflow-hidden',
        'bg-[var(--vr-bg-card)] dark:bg-[rgba(15,23,42,0.6)]',
        'border-[var(--vr-border-subtle)] dark:border-[rgba(59,130,246,0.15)]',
        'shadow-sm dark:shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]',
        className
      )}
    >
      <div
        className="absolute top-0 left-3 right-3 h-[1px] opacity-60 dark:opacity-100 bg-gradient-to-r from-transparent via-[var(--vr-accent-primary)] to-transparent"
      />
      {children}
    </motion.div>
  )
}

function PanelTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon && <span className="text-vraccent-primary">{icon}</span>}
      <div className="w-[3px] h-4 bg-vraccent-primary rounded-full" />
      <h3 className="text-vr-body text-vrtext-primary font-medium">{children}</h3>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI Card (big-screen style)                                        */
/* ------------------------------------------------------------------ */
function KPICard({
  icon,
  iconBg,
  label,
  value,
  trend,
  trendUp,
  subLabel,
  delay,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  trend: string
  trendUp: boolean
  subLabel: string
  delay: number
}) {
  const numericMatch = value.replace(/[^0-9.]/g, '')
  const prefix = value.startsWith('¥') ? '¥' : ''
  const suffix = value.endsWith('%') ? '%' : ''
  const decimals = (numericMatch.split('.')[1] || '').length
  const numericTarget = numericMatch ? parseFloat(numericMatch) : 0
  const countUpVal = useCountUp(numericTarget, 800, delay + 200, decimals)

  const displayValue = prefix
    ? `${prefix}${countUpVal.toLocaleString(undefined, decimals > 0 ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {})}`
    : `${countUpVal.toLocaleString()}${suffix}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay / 1000 }}
      className={cn(
        'relative rounded-lg border p-5 overflow-hidden',
        'bg-[var(--vr-bg-card)] dark:bg-[rgba(15,23,42,0.6)]',
        'border-[var(--vr-border-subtle)] dark:border-[rgba(59,130,246,0.15)]',
        'shadow-sm dark:shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]'
      )}
    >
      <div
        className="absolute top-0 left-3 right-3 h-[1px] opacity-60 dark:opacity-100 bg-gradient-to-r from-transparent via-[var(--vr-accent-primary)] to-transparent"
      />
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-vr-caption text-vrtext-tertiary">{label}</p>
          <p className="text-vr-data-lg text-vrtext-primary mt-1">{displayValue}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {trend && (
              <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: (delay + 600) / 1000 }}
                className={`text-vr-caption inline-flex items-center gap-0.5 ${
                  trendUp ? 'text-vrsuccess' : 'text-vrerror'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                {trend}
              </motion.span>
            )}
            <span className="text-vr-caption text-vrtext-secondary">{subLabel}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}



/* ------------------------------------------------------------------ */
/*  Tooltip wrapper                                                    */
/* ------------------------------------------------------------------ */
function TooltipCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-2 shadow-lg',
        'bg-[var(--vr-bg-elevated)] border-[var(--vr-border-subtle)] text-[var(--vr-text-primary)]',
        className
      )}
    >
      {children}
    </div>
  )
}

function TooltipLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium mb-1 text-[var(--vr-text-primary)]">{children}</p>
}

function TooltipItem({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--vr-text-secondary)]">{children}</p>
}

/* ------------------------------------------------------------------ */
/*  Revenue Tooltip                                                    */
/* ------------------------------------------------------------------ */
function RevenueTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <TooltipCard>
      <TooltipLabel>{label}</TooltipLabel>
      {payload.map((p, i) => {
        const isAmount = p.dataKey?.includes('Amount') || p.dataKey === 'otherIncome'
        const labelText =
          p.dataKey === 'onlineAmount' ? '线上营收' :
          p.dataKey === 'offlineAmount' ? '线下营收' :
          p.dataKey === 'otherIncome' ? '营业外收入' :
          p.dataKey === 'onlineCount' ? '线上订单' :
          p.dataKey === 'offlineCount' ? '线下订单' : p.dataKey
        return (
          <TooltipItem key={i}>
            {labelText}: &nbsp;
            <span style={{ color: p.color || 'var(--vr-accent-primary)' }} className="font-semibold">
              {isAmount ? `¥${((p.value || 0) / 100).toLocaleString()}` : `${p.value}单`}
            </span>
          </TooltipItem>
        )
      })}
    </TooltipCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Booking Tooltip                                                    */
/* ------------------------------------------------------------------ */
function BookingTooltip({ active, payload, label, total }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  total?: number
}) {
  if (!active || !payload?.length || !total) return null
  const pct = ((payload[0].value / total) * 100).toFixed(1)
  return (
    <TooltipCard>
      <TooltipLabel>{label}</TooltipLabel>
      <TooltipItem>
        预约场次: &nbsp;
        <span className="font-semibold text-[var(--vr-accent-primary)]">{payload[0].value}场</span>
      </TooltipItem>
      <TooltipItem>占比: {pct}%</TooltipItem>
    </TooltipCard>
  )
}

/* ------------------------------------------------------------------ */
/*  User Growth Tooltip                                                */
/* ------------------------------------------------------------------ */
function UserTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <TooltipCard>
      <TooltipLabel>{label}</TooltipLabel>
      <TooltipItem>
        新增用户: &nbsp;
        <span className="font-semibold text-[var(--vr-accent-secondary)]">{payload[0].value}人</span>
      </TooltipItem>
    </TooltipCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Payment Tooltip                                                    */
/* ------------------------------------------------------------------ */
function PaymentTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ value: number; payload?: { method?: string } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <TooltipCard>
      <TooltipLabel>{p.payload?.method}</TooltipLabel>
      <TooltipItem>
        金额: &nbsp;
        <span className="font-semibold text-[var(--vr-accent-primary)]">¥{((p.value || 0) / 100).toLocaleString()}</span>
      </TooltipItem>
    </TooltipCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Order Status Tooltip                                               */
/* ------------------------------------------------------------------ */
function OrderStatusTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ value: number; name?: string }>
}) {
  if (!active || !payload?.length) return null
  return (
    <TooltipCard>
      {payload.map((p, i) => (
        <TooltipItem key={i}>
          {p.name}: &nbsp;
          <span className="font-semibold text-[var(--vr-text-primary)]">{p.value}单</span>
        </TooltipItem>
      ))}
    </TooltipCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Analytics Page (Big Screen Style)                             */
/* ------------------------------------------------------------------ */
export default function Analytics() {
  const navigate = useNavigate()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const now = useNow()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  /* fullscreen toggle */
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {
      setIsFullscreen((p) => !p)
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  /* auto refresh */
  useEffect(() => {
    const t = setInterval(() => setRefreshKey((k) => k + 1), 30000)
    return () => clearInterval(t)
  }, [])

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 'r' || e.key === 'R') setRefreshKey((k) => k + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  /* ─── Global date range ─── */
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [showDropdown, setShowDropdown] = useState(false)
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const dropdownRef = useRef<HTMLDivElement>(null)

  /* ─── All cards share the global date range ─── */

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ─── Helper: build API params ─── */
  const globalParams = () => {
    if (dateRange === 'custom') {
      return { range: dateRange, startDate: customStart, endDate: customEnd }
    }
    return { range: dateRange, startDate: undefined, endDate: undefined }
  }

  /* ─── Data queries ─── */
  const { data: dashboardData, isPending: dashboardPending } = useQuery({
    queryKey: ['analytics', 'dashboard', dateRange, customStart, customEnd, refreshKey],
    queryFn: () => {
      const p = globalParams()
      return getDashboard(p.range, p.startDate, p.endDate)
    },
  })

  const { data: revenueApiData, isPending: revenuePending } = useQuery({
    queryKey: ['analytics', 'revenue', dateRange, refreshKey],
    queryFn: () => getRevenue(dateRange),
  })

  const { data: venueRevenueData, isPending: venueRevenuePending } = useQuery({
    queryKey: ['analytics', 'venue-revenue-ranking', dateRange, customStart, customEnd, refreshKey],
    queryFn: () => {
      const p = globalParams()
      return getVenueRevenueRanking(p.range, p.startDate, p.endDate)
    },
  })

  const { data: timeDistributionData, isPending: timeDistributionPending } = useQuery({
    queryKey: ['analytics', 'time-distribution', dateRange, customStart, customEnd, refreshKey],
    queryFn: () => {
      const p = globalParams()
      return getTimeDistribution(p.range, p.startDate, p.endDate)
    },
  })

  const { data: userGrowthApiData, isPending: userGrowthPending } = useQuery({
    queryKey: ['analytics', 'user-growth', dateRange, refreshKey],
    queryFn: () => getUserGrowth(dateRange),
  })

  const { data: paymentMethods, isPending: paymentPending } = useQuery({
    queryKey: ['analytics', 'payment-methods', dateRange, customStart, customEnd, refreshKey],
    queryFn: () => {
      const p = globalParams()
      return getPaymentMethodDistribution(p.range, p.startDate, p.endDate)
    },
  })

  const { data: orderStatusData, isPending: orderStatusPending } = useQuery({
    queryKey: ['analytics', 'order-status', dateRange, customStart, customEnd, refreshKey],
    queryFn: () => {
      const p = globalParams()
      return getOrderStatusDistribution(p.range, p.startDate, p.endDate)
    },
  })

  const { data: repurchaseData, isPending: repurchasePending } = useQuery({
    queryKey: ['analytics', 'repurchase-rate', dateRange, customStart, customEnd, refreshKey],
    queryFn: () => {
      const p = globalParams()
      return getRepurchaseRate(p.range, p.startDate, p.endDate)
    },
  })

  const { data: gamePopularityData, isPending: gamePopularityPending } = useQuery({
    queryKey: ['analytics', 'game-popularity', dateRange, customStart, customEnd, refreshKey],
    queryFn: () => {
      const p = globalParams()
      return getGamePopularity(p.range, p.startDate, p.endDate)
    },
  })


  const stats = dashboardData?.stats

  const revenueData = revenueApiData || []
  const userGrowthData = userGrowthApiData || []
  const venueRevenue = venueRevenueData || []
  const bookingTimeData = timeDistributionData || []
  const bookingTotal = bookingTimeData.reduce((s: number, d: any) => s + (d.count || 0), 0)
  const paymentData = paymentMethods || []
  const orderStatus = orderStatusData || []
  const repurchase = repurchaseData || { totalCustomers: 0, repeatCustomers: 0, rate: 0 }
  const gamePopularity = gamePopularityData || []

  const isLoadingAny =
    dashboardPending ||
    revenuePending ||
    venueRevenuePending ||
    timeDistributionPending ||
    userGrowthPending ||
    paymentPending ||
    orderStatusPending ||
    repurchasePending ||
    gamePopularityPending

  /* ─── Chart colors driven by theme ─── */
  const chartGrid = isDark ? '#1E293B' : '#E2E8F0'
  const chartTick = isDark ? '#64748B' : '#94A3B8'
  const chartAxis = isDark ? '#1E293B' : '#E2E8F0'
  const chartDotStroke = isDark ? '#151D2E' : '#FFFFFF'

  /* ─── KPI cards data ─── */
  const isToday = dateRange === 'today'
  const trendLabel = isToday ? '较昨日' : '环比'
  const subLabelPrefix = isToday ? '今日' : '周期内'

  const kpis = stats
    ? [
        {
          icon: <TrendingUp className="w-6 h-6 text-vraccent-primary" />,
          iconBg: 'rgba(59,130,246,0.1)',
          label: '总收入',
          value: `¥${((stats.todayRevenue || 0) / 100).toLocaleString()}`,
          trend: `${trendLabel} ${stats.revenueTrend >= 0 ? '+' : ''}${stats.revenueTrend}%`,
          trendUp: stats.revenueTrend >= 0,
          subLabel: `营业额¥${((stats.todayOperatingRevenue || 0) / 100).toLocaleString()} · 营业外¥${((stats.todayOtherIncome || 0) / 100).toLocaleString()}`,
        },
        {
          icon: <CalendarCheck className="w-6 h-6 text-vrsuccess" />,
          iconBg: 'rgba(16,185,129,0.1)',
          label: '预约场次',
          value: String(stats.todayBookings),
          trend: `${trendLabel} ${stats.bookingTrend >= 0 ? '+' : ''}${stats.bookingTrend}%`,
          trendUp: stats.bookingTrend >= 0,
          subLabel: `${subLabelPrefix}到场 ${stats.todayPlayers || 0} 人次`,
        },
        {
          icon: <Users className="w-6 h-6 text-vrsuccess" />,
          iconBg: 'rgba(16,185,129,0.1)',
          label: '总到场人次',
          value: String(stats.todayPlayers || 0),
          trend: `${trendLabel} ${stats.playersTrend >= 0 ? '+' : ''}${stats.playersTrend}%`,
          trendUp: stats.playersTrend >= 0,
          subLabel: `${subLabelPrefix}人均 ${stats.todayBookings > 0 ? Math.round((stats.todayPlayers || 0) / stats.todayBookings) : 0} 人/场`,
        },
      ]
    : []

  return (
    <div
      className="relative w-screen min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-[var(--vr-bg-base)] text-[var(--vr-text-primary)]"
    >
      {/* Grid overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          animation: 'gridPulse 4s ease-in-out infinite',
        }}
      />

      {/* Glow overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle at 50% 0%, rgba(59,130,246,0.06), transparent 60%)',
        }}
      />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 flex flex-col min-h-[100dvh] p-4 gap-4"
      >
        {/* Loading overlay */}
        {isLoadingAny && (
          <div
            className="absolute inset-0 z-50 backdrop-blur-sm flex items-center justify-center rounded-lg"
            style={{ backgroundColor: 'color-mix(in srgb, var(--vr-bg-base), transparent 20%)' }}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-vraccent-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-vr-body-sm text-vrtext-secondary">数据加载中...</span>
            </div>
          </div>
        )}

        {/* ====== TOP BAR ====== */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="flex items-center justify-between h-[60px] shrink-0"
        >
          {/* Left: title */}
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="p-2 rounded-lg bg-vrbg-elevated/60 border border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary transition-colors"
              title="返回首页"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
            <Headset className="w-7 h-7 text-vraccent-primary" />
            <div>
              <h1 className="text-[22px] font-bold text-vrtext-primary leading-tight">VR大空间</h1>
            </div>
            <span className="text-vr-body text-vraccent-secondary ml-2">数据统计大屏</span>
          </div>

          {/* Center: decorative line */}
          <div className="hidden lg:flex items-center gap-2 flex-1 justify-center mx-8">
            <div className="h-[1px] flex-1 max-w-[120px] bg-gradient-to-r from-[var(--vr-accent-primary)] to-transparent opacity-60 dark:opacity-100" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="w-2 h-2 bg-vraccent-primary rotate-45"
            />
            <div className="h-[1px] flex-1 max-w-[120px] bg-gradient-to-r from-transparent to-[var(--vr-accent-primary)] opacity-60 dark:opacity-100" />
          </div>

          {/* Right: date picker + time + controls */}
          <div className="flex items-center gap-4">
            {/* Date range picker */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 bg-vrbg-elevated/60 hover:bg-vrbg-elevated border border-vrborder-subtle hover:border-vrborder-hover rounded-lg px-3.5 py-2 text-vr-body-sm text-vrtext-primary transition-colors"
              >
                <Calendar className="w-4 h-4 text-vrtext-secondary" />
                <span>{dateRangeMap[dateRange]}</span>
                <ChevronDown className="w-4 h-4 text-vrtext-muted" />
              </button>

              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-36 bg-vrbg-elevated border border-vrborder-hover rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-50 overflow-hidden"
                >
                  {(['today', '7days', '30days', '90days', 'custom'] as DateRange[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setDateRange(r)
                        setShowDropdown(false)
                      }}
                      className={`w-full text-left px-4 py-2 text-vr-body-sm transition-colors ${
                        dateRange === r
                          ? 'bg-vrbg-active text-vraccent-primary'
                          : 'text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary'
                      }`}
                    >
                      {dateRangeMap[r]}
                    </button>
                  ))}
                </motion.div>
              )}

              {dateRange === 'custom' && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 top-full mt-1 flex items-center gap-2 bg-vrbg-elevated border border-vrborder-hover rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-50 p-2"
                >
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="bg-vrbg-surface border border-vrborder-subtle rounded px-2 py-1 text-vr-caption text-vrtext-primary outline-none focus:border-vraccent-primary"
                  />
                  <span className="text-vrtext-muted text-vr-caption">-</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="bg-vrbg-surface border border-vrborder-subtle rounded px-2 py-1 text-vr-caption text-vrtext-primary outline-none focus:border-vraccent-primary"
                  />
                </motion.div>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2 rounded-lg bg-vrbg-elevated/60 border border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary transition-colors"
              title="刷新数据 (R)"
            >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
            <div className="text-right">
              <p className="text-vr-body text-vrtext-primary font-mono">{formatTime(now)}</p>
              <p className="text-vr-caption text-vrtext-tertiary">{formatDate(now)}</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-vrbg-elevated/60 border border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary transition-colors"
              title="全屏 (F)"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </motion.button>
          </div>
        </motion.header>

        {/* ====== KPI ROW ====== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
          {kpis.map((kpi, i) => (
            <KPICard key={kpi.label} {...kpi} delay={i * 100} />
          ))}
          {/* 取消订单 & 退款数量 */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className={cn(
                'relative rounded-lg border p-5 overflow-hidden',
                'bg-[var(--vr-bg-card)] dark:bg-[rgba(15,23,42,0.6)]',
                'border-[var(--vr-border-subtle)] dark:border-[rgba(59,130,246,0.15)]',
                'shadow-sm dark:shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]'
              )}
            >
              <div
                className="absolute top-0 left-3 right-3 h-[1px] opacity-60 dark:opacity-100 bg-gradient-to-r from-transparent via-[var(--vr-accent-primary)] to-transparent"
              />
              <div className="flex items-center gap-4 h-full">
                {/* 取消订单 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
                    >
                      <XCircle className="w-4 h-4 text-vrerror" />
                    </div>
                    <p className="text-vr-caption text-vrtext-tertiary">取消订单</p>
                  </div>
                  <p className="text-vr-data-lg text-vrtext-primary">
                    {(stats.cancelledOrders || 0).toLocaleString()}
                    <span className="text-vr-body text-vrtext-secondary ml-1">单</span>
                  </p>
                </div>
                {/* 分隔线 */}
                <div className="w-[1px] self-stretch bg-vrborder-subtle/50" />
                {/* 退款数量 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}
                    >
                      <RotateCcw className="w-4 h-4 text-vrwarning" />
                    </div>
                    <p className="text-vr-caption text-vrtext-tertiary">退款数量</p>
                  </div>
                  <p className="text-vr-data-lg text-vrtext-primary">
                    {(stats.refundedOrders || 0).toLocaleString()}
                    <span className="text-vr-body text-vrtext-secondary ml-1">单</span>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ====== MAIN AREA ====== */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-4 min-h-0">
          {/* ---- LEFT COLUMN ---- */}
          <div className="xl:col-span-2 flex flex-col gap-4">
            {/* Revenue trend */}
            <PanelCard delay={0.3}>
              <div className="flex items-center justify-between mb-4">
                <PanelTitle icon={<TrendingUp className="w-4 h-4" />}>营收趋势</PanelTitle>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-vr-caption text-vrtext-secondary">
                    <span className="w-3 h-0.5 bg-[#3B82F6] rounded-full" />
                    线上营收
                  </span>
                  <span className="flex items-center gap-1.5 text-vr-caption text-vrtext-secondary">
                    <span className="w-3 h-0.5 bg-[#10B981] rounded-full" />
                    线下营收
                  </span>
                  <span className="flex items-center gap-1.5 text-vr-caption text-vrtext-secondary">
                    <span className="w-3 h-0.5 bg-[#8B5CF6] rounded-full" />
                    营业外收入
                  </span>
                </div>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="onlineAmountGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="offlineAmountGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="otherIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: chartTick, fontSize: 12 }} axisLine={{ stroke: chartAxis }} tickLine={false} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: chartTick, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `¥${(v / 100).toLocaleString()}`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: chartTick, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}单`}
                    />
                    <Tooltip content={<RevenueTooltip />} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="onlineAmount"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="url(#onlineAmountGrad)"
                      dot={{ fill: '#3B82F6', r: 3, strokeWidth: 0 }}
                      activeDot={{ fill: '#3B82F6', r: 5, strokeWidth: 2, stroke: chartDotStroke }}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="offlineAmount"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#offlineAmountGrad)"
                      dot={{ fill: '#10B981', r: 3, strokeWidth: 0 }}
                      activeDot={{ fill: '#10B981', r: 5, strokeWidth: 2, stroke: chartDotStroke }}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="otherIncome"
                      stroke="#8B5CF6"
                      strokeWidth={2}
                      fill="url(#otherIncomeGrad)"
                      dot={{ fill: '#8B5CF6', r: 3, strokeWidth: 0 }}
                      activeDot={{ fill: '#8B5CF6', r: 5, strokeWidth: 2, stroke: chartDotStroke }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            {/* Venue revenue + Payment methods */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PanelCard delay={0.5}>
                <div className="flex items-center justify-between mb-4">
                  <PanelTitle icon={<MapPin className="w-4 h-4" />}>场地营收排行</PanelTitle>

                </div>
                <div className="space-y-3">
                  {venueRevenue.map((v: any, i: number) => (
                    <motion.div
                      key={v.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.5 + i * 0.08 }}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--vr-bg-hover)] dark:hover:bg-[rgba(30,41,59,0.5)] transition-colors"
                    >
                      <span className={`text-vr-caption font-mono w-6 text-center font-bold ${
                        i === 0 ? 'text-vrwarning' : i === 1 ? 'text-vraccent-secondary' : i === 2 ? 'text-vrsuccess' : 'text-vrtext-tertiary'
                      }`}>
                        {v.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-vr-body-sm text-vrtext-primary font-medium">{v.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-vr-body text-vrtext-primary font-semibold">
                              ¥{(v.revenue / 100).toLocaleString()}
                            </span>
                            <span className="text-vr-caption text-vrtext-tertiary ml-2">{v.orderCount + (v.otherIncomeCount || 0)}笔</span>
                            {(v.otherIncome || 0) > 0 && (
                              <div className="text-vr-caption text-vrtext-tertiary">
                                营业额 ¥{((v.operatingRevenue || 0) / 100).toLocaleString()} · 营业外 ¥{((v.otherIncome || 0) / 100).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 bg-vrbg-elevated rounded-full overflow-hidden">
                          <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.8, delay: 0.7 + i * 0.08, ease: 'easeOut' }}
                            className="h-full origin-left rounded-full"
                            style={{
                              width: `${venueRevenue.length > 0 && venueRevenue[0].revenue > 0 ? Math.round((v.revenue / venueRevenue[0].revenue) * 100) : 0}%`,
                              background:
                                i === 0
                                  ? 'linear-gradient(90deg, #3B82F6, #06B6D4)'
                                  : i === 1
                                  ? 'linear-gradient(90deg, #06B6D4, #10B981)'
                                  : i === 2
                                  ? 'linear-gradient(90deg, #10B981, #F59E0B)'
                                  : 'linear-gradient(90deg, #64748B, #475569)',
                            }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {venueRevenue.length === 0 && (
                    <div className="text-center py-8 text-vrtext-tertiary text-vr-body-sm">暂无数据</div>
                  )}
                </div>
              </PanelCard>

              <PanelCard delay={0.55}>
                <div className="flex items-center justify-between mb-4">
                  <PanelTitle icon={<CreditCard className="w-4 h-4" />}>支付方式分布</PanelTitle>

                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={paymentData}
                      layout="vertical"
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: chartTick, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `¥${(v / 100).toLocaleString()}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="method"
                        tick={{ fill: chartTick, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={80}
                      />
                      <Tooltip
                        content={<PaymentTooltip />}
                        cursor={{ fill: 'rgba(59,130,246,0.03)' }}
                      />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={24}>
                        {paymentData.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PAYMENT_COLORS[entry.method] || '#64748B'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {paymentData.map((p: any) => (
                    <div key={p.method} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: PAYMENT_COLORS[p.method] || '#64748B' }}
                      />
                      <span className="text-vr-caption text-vrtext-secondary">{p.method}</span>
                      <span className="text-vr-caption text-vrtext-primary font-medium">{p.count}笔</span>
                    </div>
                  ))}
                </div>
              </PanelCard>
            </div>

            {/* Time distribution + User growth */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PanelCard delay={0.6}>
                <div className="flex items-center justify-between mb-4">
                  <PanelTitle icon={<Clock className="w-4 h-4" />}>预约时段分布</PanelTitle>

                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bookingTimeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bookingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" />
                          <stop offset="100%" stopColor="#1E40AF" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                      <XAxis dataKey="time" tick={{ fill: chartTick, fontSize: 11 }} axisLine={{ stroke: chartAxis }} tickLine={false} />
                      <YAxis tick={{ fill: chartTick, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}场`} />
                      <Tooltip content={<BookingTooltip total={bookingTotal} />} cursor={{ fill: 'rgba(59,130,246,0.03)' }} />
                      <Bar dataKey="count" fill="url(#bookingGrad)" radius={[4, 4, 0, 0]} barSize={32}>
                        {bookingTimeData.map((_: any, i: number) => (
                          <Cell key={i} fillOpacity={i === 1 ? 1 : 0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PanelCard>

              <PanelCard delay={0.65}>
                <PanelTitle icon={<Users className="w-4 h-4" />}>用户增长趋势</PanelTitle>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={userGrowthData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: chartTick, fontSize: 12 }} axisLine={{ stroke: chartAxis }} tickLine={false} />
                      <YAxis tick={{ fill: chartTick, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}人`} />
                      <Tooltip content={<UserTooltip />} />
                      <Area type="monotone" dataKey="users" stroke="#06B6D4" strokeWidth={2} fill="url(#userGrad)" dot={{ fill: '#06B6D4', r: 4, strokeWidth: 2, stroke: chartDotStroke }} activeDot={{ fill: '#06B6D4', r: 6, strokeWidth: 2, stroke: chartDotStroke }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PanelCard>
            </div>
          </div>

          {/* ---- RIGHT COLUMN ---- */}
          <div className="flex flex-col gap-4">
            {/* Order status */}
            <PanelCard delay={0.4}>
              <div className="flex items-center justify-between mb-4">
                <PanelTitle icon={<PieChart className="w-4 h-4" />}>订单状态分布</PanelTitle>

              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={orderStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="status"
                      stroke="none"
                    >
                      {orderStatus.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#64748B'} />
                      ))}
                    </Pie>
                    <Tooltip content={<OrderStatusTooltip />} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {orderStatus.slice(0, 6).map((s: any) => (
                  <div key={s.status} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[s.status] || '#64748B' }}
                    />
                    <span className="text-vr-caption text-vrtext-secondary truncate">{s.status}</span>
                    <span className="text-vr-caption text-vrtext-primary font-medium">{s.count}</span>
                  </div>
                ))}
              </div>
            </PanelCard>

            {/* No-Show 统计 */}
            <PanelCard delay={0.68}>
              <div className="flex items-center justify-between mb-1">
                <PanelTitle icon={<AlertTriangle className="w-4 h-4" />}>爽约率</PanelTitle>
              </div>
              <p className="text-vr-caption text-vrtext-tertiary mb-4">
                爽约订单占总预约的比例
              </p>
              <div className="flex items-center justify-center py-4">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke={chartAxis} strokeWidth="8" />
                    <motion.circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - (stats?.noShowRate || 0) / 100) }}
                      transition={{ duration: 1.2, delay: 0.8, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-vrtext-primary">{stats?.noShowRate || 0}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-around pt-3 border-t border-vrborder-subtle">
                <div className="text-center">
                  <p className="text-vr-data text-vrtext-primary font-semibold">{stats?.noShowCount || 0}</p>
                  <p className="text-vr-caption text-vrtext-tertiary">爽约订单</p>
                </div>
                <div className="text-center">
                  <p className="text-vr-data text-vrerror font-semibold">
                    ¥{((stats?.noShowLoss || 0) / 100).toLocaleString()}
                  </p>
                  <p className="text-vr-caption text-vrtext-tertiary">违约金损失</p>
                </div>
              </div>
            </PanelCard>

            {/* Repurchase rate */}
            <PanelCard delay={0.7}>
              <div className="flex items-center justify-between mb-1">
                <PanelTitle icon={<Repeat className="w-4 h-4" />}>复购率</PanelTitle>

              </div>
              <p className="text-vr-caption text-vrtext-tertiary mb-4">
                消费2次以上的顾客占比
              </p>
              <div className="flex items-center justify-center py-4">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke={chartAxis} strokeWidth="8" />
                    <motion.circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke="#3B82F6"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - (repurchase.rate || 0) / 100) }}
                      transition={{ duration: 1.2, delay: 0.8, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-vrtext-primary">{repurchase.rate}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-around pt-3 border-t border-vrborder-subtle">
                <div className="text-center">
                  <p className="text-vr-data text-vrtext-primary font-semibold">{repurchase.totalCustomers}</p>
                  <p className="text-vr-caption text-vrtext-tertiary">总顾客</p>
                </div>
                <div className="text-center">
                  <p className="text-vr-data text-vrsuccess font-semibold">{repurchase.repeatCustomers}</p>
                  <p className="text-vr-caption text-vrtext-tertiary">复购顾客</p>
                </div>
              </div>
            </PanelCard>

            {/* Game popularity */}
            <PanelCard delay={0.75} className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <PanelTitle icon={<Gamepad2 className="w-4 h-4" />}>游戏内容热度排行</PanelTitle>

              </div>
              <div className="space-y-3">
                {gamePopularity.map((g: any, i: number) => (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.75 + i * 0.06 }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--vr-bg-hover)] dark:hover:bg-[rgba(30,41,59,0.5)] transition-colors"
                  >
                    <span className={`text-vr-caption font-mono w-6 text-center font-bold ${
                      i === 0 ? 'text-vrwarning' : i === 1 ? 'text-vraccent-secondary' : i === 2 ? 'text-vrsuccess' : 'text-vrtext-tertiary'
                    }`}>
                      {g.rank}
                    </span>
                    {g.coverImage ? (
                      <img src={getImageUrl(g.coverImage)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-vrbg-elevated flex items-center justify-center shrink-0">
                        <Gamepad2 className="w-4 h-4 text-vrtext-tertiary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-vr-body-sm text-vrtext-primary font-medium">{g.title}</span>
                          <span className="text-vr-caption text-vrtext-tertiary ml-2">
                            ¥{(g.price / 100).toFixed(0)}/人
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Ticket className="w-3.5 h-3.5 text-vraccent-primary" />
                          <span className="text-vr-body-sm text-vrtext-primary font-semibold">
                            {g.bookingCount}场
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-vrbg-elevated rounded-full overflow-hidden mt-1.5">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.8, delay: 0.9 + i * 0.06, ease: 'easeOut' }}
                          className="h-full origin-left rounded-full"
                          style={{
                            width: `${gamePopularity.length > 0 && gamePopularity[0].bookingCount > 0 ? Math.round((g.bookingCount / gamePopularity[0].bookingCount) * 100) : 0}%`,
                            background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)',
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
                {gamePopularity.length === 0 && (
                  <div className="text-center py-8 text-vrtext-tertiary text-vr-body-sm">
                    暂无数据（需C端选择游戏后创建预约）
                  </div>
                )}
              </div>
            </PanelCard>
          </div>
        </div>

        {/* ====== BOTTOM: Recent Activity (removed - monitor API deleted) ====== */}
      </motion.div>

      {/* CSS Animations */}
      <style>{`
        @keyframes gridPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
