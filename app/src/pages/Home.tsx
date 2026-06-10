import { useState, useMemo } from 'react'
import { subDays, format } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Eye,
  Users,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import Layout from '@/components/Layout'
import { getDashboard, getRevenue } from '@/api/analytics'
import { getVenues } from '@/api/venues'
import type { Venue } from '@/api/venues'
import { getBookings } from '@/api/bookings'
import type { Booking } from '@/api/bookings'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/lib/imageUrl'

/* ─── Animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as [number, number, number, number] },
  },
}

/* ─── Status badge component ─── */
function StatusBadge({ status, text }: { status: string; text: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    free: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
    'in-use': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
    maintenance: { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
    disabled: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted' },
    pending: { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
    paid: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
    completed: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
    cancelled: { bg: 'bg-vrerror/15', text: 'text-vrerror' },
    no_show: { bg: 'bg-gray-500/15', text: 'text-gray-500' },
  }
  const c = config[status] || config.disabled
  return (
    <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-vr-caption font-medium', c.bg, c.text)}>
      {text}
    </span>
  )
}

/* ─── Stat Card ─── */
function StatCard({ stat, index }: { stat: any; index: number }) {
  return (
    <motion.div
      variants={itemVariants}
      className="group relative bg-vrbg-card rounded-xl p-5 border border-vrborder-subtle hover:border-vrborder-hover hover:shadow-vr-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
    >
      {/* Bottom gradient border */}
      <div className={cn('absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-gradient-to-r opacity-60', stat.gradient)} />

      <p className="text-vr-caption text-vrtext-tertiary mb-2">{stat.label}</p>
      <div className="flex items-end justify-between">
        <div>
          <motion.p
            className="text-vr-data-lg text-vrtext-primary"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
          >
            {stat.prefix}{stat.value}{stat.suffix}
          </motion.p>
          {stat.trendLabel && (
            <div className="flex items-center gap-1 mt-1.5">
              {stat.trend != null && (
                stat.trend >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-vrsuccess" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-vrerror" />
                )
              )}
              <span className={cn('text-vr-caption', stat.trend != null ? (stat.trend >= 0 ? 'text-vrsuccess' : 'text-vrerror') : 'text-vrtext-muted')}>
                {stat.trendLabel}
              </span>
            </div>
          )}
        </div>

        {/* Mini ring chart for occupancy */}
        {stat.suffix === '%' && (
          <div className="relative w-12 h-12">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" className="text-vrborder-subtle" strokeWidth="4" />
              <motion.circle
                cx="24" cy="24" r="20" fill="none"
                stroke="url(#ringGrad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - stat.numericValue / 100) }}
                transition={{ duration: 1, delay: 0.4, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
              />
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#EF4444" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-vr-caption text-vrtext-primary font-semibold">
              {stat.value}%
            </span>
          </div>
        )}
        {stat.label === '今日到场人次' && (
          <div className="w-12 h-12 rounded-full bg-vrsuccess/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-vrsuccess" />
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Vertical Status Tag ─── */
function VerticalStatusTag({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    open: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess', label: '营业中' },
    maintenance: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', label: '维护中' },
    closed: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted', label: '暂停营业' },
  }
  const c = config[status] || config.open
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-full px-1.5 py-2 gap-0.5', c.bg)}>
      {c.label.split('').map((char, i) => (
        <span key={i} className={cn('text-xs font-medium leading-tight', c.text)}>{char}</span>
      ))}
    </div>
  )
}

/* ─── Venue Card ─── */
function VenueCard({ venue, index }: { venue: any; index: number }) {
  const isUnavailable = venue.status === 'maintenance' || venue.status === 'closed'

  const availabilityText = isUnavailable
    ? '不可预约'
    : venue.status === 'in-use'
      ? venue.currentSlot || '使用中'
      : '可预约'

  return (
    <motion.div
      variants={itemVariants}
      custom={index}
      className={cn(
        'bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden group hover:border-vrborder-hover hover:shadow-vr-md transition-all duration-200 cursor-pointer',
        isUnavailable && 'opacity-70'
      )}
    >
      <div className="p-4">
        {/* Top: image + vertical status */}
        <div className="flex items-start gap-3">
          <div className="w-[60px] h-[60px] rounded-lg overflow-hidden shrink-0">
            <img
              src={getImageUrl(venue.image)}
              alt={venue.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-vr-body text-vrtext-primary font-medium truncate">{venue.name}</h4>
          </div>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.2 + index * 0.08 }}
          >
            <VerticalStatusTag status={venue.status} />
          </motion.div>
        </div>

        {/* Availability */}
        <div className="mt-3">
          <p className={cn(
            'text-vr-body-sm font-medium',
            isUnavailable ? 'text-vrerror' : venue.status === 'in-use' ? 'text-vrwarning' : 'text-vrsuccess'
          )}>
            {availabilityText}
          </p>
        </div>

        {/* Bottom */}
        <div className="mt-2 pt-2 border-t border-vrborder-subtle">
          <p className="text-vr-caption text-vrtext-muted">今日排场 {venue.todayBookings} 场</p>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Schedule Timeline ─── */
function ScheduleTimeline({ venues, bookings }: { venues: Venue[]; bookings: Booking[] }) {
  const slotHeight = 72
  const { startHour, endHour, totalHours, timeSlots } = useMemo(() => {
    const allOpen = venues.map((v) => v.openTime ? parseInt(v.openTime.split(':')[0]) : 9)
    const allClose = venues.map((v) => v.closeTime ? parseInt(v.closeTime.split(':')[0]) : 22)
    const startH = allOpen.length > 0 ? Math.min(...allOpen) : 9
    const endH = allClose.length > 0 ? Math.max(...allClose) : 22
    const hours = endH - startH + 1
    const slots = Array.from({ length: hours }, (_, i) => {
      const h = startH + i
      return String(h).padStart(2, '0') + ':00'
    })
    return { startHour: startH, endHour: endH, totalHours: hours, timeSlots: slots }
  }, [venues])

  const getEventStyle = (booking: Booking) => {
    if (booking.status === 'NO_SHOW') {
      return 'bg-gray-500/20 border border-gray-400/40 border-dashed'
    }
    switch (booking.type) {
      case 'TEAM': return 'bg-gradient-to-r from-vraccent-primary to-vraccent-secondary'
      case 'INDIVIDUAL': return 'bg-gradient-to-r from-vrpurple to-vrindigo'
      case 'CORPORATE': return 'bg-vrwarning'
      case 'MAINTENANCE': return 'bg-vrtext-muted'
      default: return 'bg-vrtext-muted'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'TEAM': return '团队预约'
      case 'INDIVIDUAL': return '散客预约'
      case 'CORPORATE': return '企业活动'
      case 'MAINTENANCE': return '维护中'
      default: return '预约'
    }
  }

  // 计算 booking 在甘特图中的位置(px)和高度(px)
  const getBookingPos = (booking: Booking) => {
    const [sh, sm] = booking.startTime.split(':').map(Number)
    const [eh, em] = booking.endTime.split(':').map(Number)
    const startMin = (sh - startHour) * 60 + sm
    const endMin = (eh - startHour) * 60 + em
    const durationMin = endMin - startMin
    return {
      top: (startMin / 60) * slotHeight + 2,
      height: Math.max((durationMin / 60) * slotHeight - 4, 28),
    }
  }

  // 判断两个 booking 是否重叠
  const isOverlap = (a: Booking, b: Booking) => {
    const aStart = parseInt(a.startTime.replace(':', ''))
    const aEnd = parseInt(a.endTime.replace(':', ''))
    const bStart = parseInt(b.startTime.replace(':', ''))
    const bEnd = parseInt(b.endTime.replace(':', ''))
    return aStart < bEnd && bStart < aEnd
  }

  // 为每个 venue 的 bookings 分组（重叠的放在一起）
  const getBookingGroups = (venueBookings: Booking[]) => {
    const sorted = [...venueBookings].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const groups: Booking[][] = []
    for (const b of sorted) {
      let placed = false
      for (const group of groups) {
        if (group.some((g) => isOverlap(g, b))) {
          group.push(b)
          placed = true
          break
        }
      }
      if (!placed) groups.push([b])
    }
    return groups
  }

  return (
    <motion.div
      variants={itemVariants}
      className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5"
    >
      <h3 className="text-vr-h3 text-vrtext-primary mb-4">今日排场</h3>

      {bookings.length === 0 ? (
        <div className="text-center py-16 text-vr-caption text-vrtext-muted">
          今日暂无排场
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Header row */}
            <div className="grid gap-0 border-b border-vrborder-subtle pb-2 mb-0"
              style={{ gridTemplateColumns: `64px repeat(${venues.length}, 1fr)` }}
            >
              <div />
              {venues.map((v) => (
                <div key={v.id} className="text-center text-sm text-vrtext-secondary py-1 font-medium">{v.name}</div>
              ))}
            </div>

            {/* Scrollable timeline body */}
            <div className="relative overflow-y-auto" style={{ height: 6 * slotHeight }}>
              <div className="relative" style={{ height: totalHours * slotHeight }}>
                {/* Hour grid lines + labels */}
                {timeSlots.map((time, i) => (
                  <div
                    key={time}
                    className="absolute left-0 right-0 flex"
                    style={{ top: i * slotHeight, height: slotHeight }}
                  >
                    <div className="w-[64px] text-sm text-vrtext-muted flex items-start pt-1 pr-3 justify-end shrink-0">
                      {time}
                    </div>
                    <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${venues.length}, 1fr)` }}>
                      {venues.map((v) => (
                        <div key={v.id} className="border-l border-vrborder-subtle/40" />
                      ))}
                    </div>
                    <div className="absolute left-[64px] right-0 top-0 border-t border-dashed border-vrborder-subtle/50 pointer-events-none" />
                  </div>
                ))}

                {/* Booking blocks */}
                {venues.map((venue, vIdx) => {
                  const venueBookings = bookings.filter((b) => b.venueId === venue.id)
                  const groups = getBookingGroups(venueBookings)
                  return groups.map((group, gIdx) =>
                    group.map((booking, bIdx) => {
                      const pos = getBookingPos(booking)
                      const count = group.length
                      const gap = 4
                      const totalGap = (count - 1) * gap
                      const colWidth = 100 / venues.length
                      const baseLeft = 64
                      const colPx = `calc((100% - ${baseLeft}px) * ${colWidth} / 100)`
                      const itemW = `calc((${colPx} - 8px - ${totalGap}px) / ${count})`
                      const leftPos = `calc(${baseLeft}px + ${vIdx * colWidth}% + 4px + ${bIdx} * (${itemW} + ${gap}px))`
                      return (
                        <motion.div
                          key={booking.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: 0.2 + gIdx * 0.06 + bIdx * 0.04 }}
                          className={cn(
                            'absolute rounded-xl px-3 text-white text-sm font-medium cursor-pointer hover:brightness-110 transition-all shadow-lg flex items-center',
                            getEventStyle(booking)
                          )}
                          style={{
                            left: leftPos,
                            width: itemW,
                            top: pos.top + 2,
                            height: pos.height - 4,
                            zIndex: 10,
                          }}
                          title={`${booking.title}`}
                        >
                          <span className="truncate">
                            {getTypeLabel(booking.type)} {booking.startTime}-{booking.endTime}
                          </span>
                        </motion.div>
                      )
                    })
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Order Chart ─── */
function OrderChart({ chartData, period, onPeriodChange }: { chartData: any[]; period: '7d' | '30d'; onPeriodChange: (p: '7d' | '30d') => void }) {
  const data = chartData.length > 0 ? chartData : []

  return (
    <motion.div
      variants={itemVariants}
      className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5 h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-vr-h3 text-vrtext-primary">线上 vs 线下</h3>
        <div className="flex items-center gap-1 bg-vrbg-surface rounded-full p-0.5">
          {(['7d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={cn(
                'px-3 py-1 rounded-full text-vr-caption font-medium transition-all duration-150',
                period === p
                  ? 'bg-vraccent-primary text-white'
                  : 'text-vrtext-secondary hover:bg-vrbg-elevated'
              )}
            >
              {p === '7d' ? '近7天' : '近30天'}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#3B82F6]" />
          <span className="text-vr-caption text-vrtext-secondary">线上预约</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#10B981]" />
          <span className="text-vr-caption text-vrtext-secondary">线下排场</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="areaOnline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="areaOffline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vr-border-subtle)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--vr-text-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--vr-border-subtle)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--vr-text-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--vr-bg-card)',
                border: '1px solid var(--vr-border-hover)',
                borderRadius: '8px',
                fontSize: 12,
                color: 'var(--vr-text-primary)',
              }}
              formatter={(value: number, name: string) => {
                const label = name === 'onlineCount' ? '线上预约' : '线下排场'
                return [`${value}单`, label]
              }}
            />
            <Area
              type="monotone"
              dataKey="onlineCount"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#areaOnline)"
              animationDuration={1200}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="offlineCount"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#areaOffline)"
              animationDuration={1200}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

/* ─── Latest Orders ─── */
function LatestOrders({ orders }: { orders: any[] }) {
  const displayOrders = orders
  const navigate = useNavigate()

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  const statusTextMap: Record<string, string> = {
    PENDING: '待支付',
    PAID: '已支付',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    REFUNDING: '退款中',
    REFUNDED: '已退款',
    NO_SHOW: '未到场',
  }

  const total = displayOrders.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedOrders = displayOrders.slice((safePage - 1) * pageSize, safePage * pageSize)

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
  // 最多显示5个页码，当前页居中
  let startPage = Math.max(1, safePage - 2)
  let endPage = Math.min(totalPages, startPage + 4)
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4)
  }
  const visiblePages = pageNumbers.slice(startPage - 1, endPage)

  return (
    <motion.div
      variants={itemVariants}
      className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5 mt-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-vr-h3 text-vrtext-primary">最新订单</h3>
        <Link
          to="/orders"
          className="flex items-center gap-1 text-vr-body-sm text-vraccent-primary hover:underline transition-colors"
        >
          查看全部 <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="bg-vrbg-elevated rounded-lg">
              <th className="text-left text-vr-caption text-vrtext-secondary font-medium px-4 py-3 rounded-l-lg">订单号</th>
              <th className="text-left text-vr-caption text-vrtext-secondary font-medium px-4 py-3">场地</th>
              <th className="text-left text-vr-caption text-vrtext-secondary font-medium px-4 py-3">金额</th>
              <th className="text-left text-vr-caption text-vrtext-secondary font-medium px-4 py-3">状态</th>
              <th className="text-left text-vr-caption text-vrtext-secondary font-medium px-4 py-3 rounded-r-lg">操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order: any, idx: number) => (
              <motion.tr
                key={order.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.5 + idx * 0.06 }}
                className="border-b border-vrborder-subtle/50 hover:bg-vrbg-elevated/40 transition-colors"
              >
                <td className="px-4 py-3.5 text-vr-body-sm text-vrtext-primary font-mono">{order.orderNo}</td>
                <td className="px-4 py-3.5 text-vr-body-sm text-vrtext-secondary">{order.venueName || order.venue}</td>
                <td className="px-4 py-3.5 text-vr-body-sm text-vrtext-primary font-medium">¥{(order.amount / 100).toLocaleString()}</td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={order.status.toLowerCase()} text={statusTextMap[order.status] || order.status} />
                </td>
                <td className="px-4 py-3.5">
                  {order.status === 'PENDING' && (
                    <button className="px-3 py-1 bg-vrwarning text-vrbg-base rounded-md text-vr-caption font-medium hover:bg-vrwarning/90 transition-colors">
                      催付
                    </button>
                  )}
                  {(order.status === 'PAID' || order.status === 'COMPLETED') && (
                    <button
                      onClick={() => navigate('/orders')}
                      className="flex items-center gap-1 text-vr-caption text-vraccent-primary hover:underline transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> 详情
                    </button>
                  )}
                  {order.status === 'CANCELLED' && (
                    <span className="text-vr-caption text-vrtext-muted">—</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Eye className="w-10 h-10 text-vrtext-muted mb-3" />
          <p className="text-vr-body text-vrtext-secondary">暂无订单数据</p>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          {visiblePages.map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-vr-caption font-medium transition-colors',
                page === safePage
                  ? 'bg-vraccent-primary text-white'
                  : 'text-vrtext-secondary hover:bg-vrbg-elevated'
              )}
            >
              {page}
            </button>
          ))}
          {endPage < totalPages && <span className="text-vrtext-muted px-1">...</span>}
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
            className="ml-2 h-7 px-2 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-caption text-vrtext-secondary focus:outline-none focus:border-vraccent-primary"
          >
            <option value={5}>5条/页</option>
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
          </select>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Home Page ─── */
export default function Home() {
  const [dashRange, setDashRange] = useState<'today' | '7days' | '30days' | '90days'>('today')

  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard', dashRange],
    queryFn: () => getDashboard(dashRange),
  })

  const [revenuePeriod, setRevenuePeriod] = useState<'7d' | '30d'>('7d')
  const { data: revenueData } = useQuery({
    queryKey: ['revenue', revenuePeriod],
    queryFn: () => getRevenue(revenuePeriod === '7d' ? '7days' : '30days'),
  })

  const { data: venueData } = useQuery({
    queryKey: ['venues', 'home'],
    queryFn: () => getVenues(),
  })

  const stats = dashboardData?.stats
  const latestOrders = dashboardData?.latestOrders || []

  // 今日日期
  const today = new Date().toISOString().split('T')[0]

  // 获取今日预约
  const { data: bookingData } = useQuery({
    queryKey: ['bookings', 'today', today],
    queryFn: () => getBookings({ date: today, pageSize: 100 }),
  })
  const todayBookings = (bookingData?.data || []).filter((b: Booking) => b.status !== 'CANCELLED')

  // 构建 venue 数据（补充 todayBookings、statusText、currentSlot）
  const rawVenues = venueData?.data || []
  const venues = rawVenues.map((v: any) => {
    const venueBookings = todayBookings.filter((b: any) => b.venueId === v.id)
    const activeBookings = venueBookings.filter((b: any) => b.status !== 'NO_SHOW')
    const now = new Date()
    const currentHour = now.getHours()
    const currentBooking = activeBookings.find((b: any) => {
      const startHour = parseInt(b.startTime?.split(':')[0] || '0')
      const endHour = parseInt(b.endTime?.split(':')[0] || '0')
      return currentHour >= startHour && currentHour < endHour
    })

    const statusMap: Record<string, string> = {
      FREE: 'open',
      IN_USE: 'open',
      MAINTENANCE: 'maintenance',
      DISABLED: 'closed',
    }
    const statusTextMap: Record<string, string> = {
      FREE: '营业中',
      IN_USE: '营业中',
      MAINTENANCE: '维护中',
      DISABLED: '暂停营业',
    }

    return {
      ...v,
      status: statusMap[v.status] || v.status?.toLowerCase() || 'free',
      statusText: statusTextMap[v.status] || v.status,
      todayBookings: activeBookings.length,
      currentSlot: currentBooking
        ? `${currentBooking.startTime}-${currentBooking.endTime}`
        : activeBookings.length > 0
          ? `${activeBookings[0].startTime}-${activeBookings[0].endTime}`
          : null,
    }
  })

  // 构建 Stats 数据
  const prefix = dashRange === 'today' ? '今日' : '总'
  const compareLabel = dashRange === 'today' ? '较昨日' : '较上期'
  const statCards = stats ? [
    { label: `${prefix}预约场次`, value: String(stats.todayBookings), numericValue: stats.todayBookings, trend: stats.bookingTrend, trendLabel: stats.bookingTrend != null ? `${compareLabel} ${stats.bookingTrend >= 0 ? '+' : ''}${stats.bookingTrend}%` : `${compareLabel} —`, gradient: 'from-vraccent-primary to-vraccent-secondary' },
    { label: `${prefix}核销场次`, value: String(stats.todayUsed), numericValue: stats.todayUsed, trend: stats.usedTrend ?? null, trendLabel: stats.usedTrend != null ? `${compareLabel} ${stats.usedTrend >= 0 ? '+' : ''}${stats.usedTrend}%` : '', gradient: 'from-vraccent-secondary to-vrsuccess' },
    { label: `${prefix}营业额`, value: String((stats.todayRevenue / 100).toFixed(2)), numericValue: stats.todayRevenue / 100, prefix: '¥', trend: stats.revenueTrend, trendLabel: stats.revenueTrend != null ? `${compareLabel} ${stats.revenueTrend >= 0 ? '+' : ''}${stats.revenueTrend}%` : `${compareLabel} —`, gradient: 'from-vrpurple to-vrindigo' },
    { label: `${prefix}到场人次`, value: String(stats.todayPlayers), numericValue: stats.todayPlayers, suffix: '', trend: stats.playersTrend ?? null, trendLabel: stats.playersTrend != null ? `${compareLabel} ${stats.playersTrend >= 0 ? '+' : ''}${stats.playersTrend}%` : `${compareLabel} —`, gradient: 'from-vrsuccess to-vraccent-secondary' },
  ] : []

  return (
    <Layout breadcrumb={['首页', '概览']}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Section 2: Stats cards */}
        <div className="flex items-center justify-between">
          <p className="text-vr-body-sm text-vrtext-secondary font-medium">核心指标</p>
          <div className="flex items-center gap-1 bg-vrbg-card border border-vrborder-subtle rounded-lg p-0.5">
            {([
              { key: 'today', label: '今日' },
              { key: '7days', label: '近7天' },
              { key: '30days', label: '近30天' },
              { key: '90days', label: '近90天' },
            ] as const).map((r) => (
              <button
                key={r.key}
                onClick={() => setDashRange(r.key)}
                className={`px-3 py-1 rounded-md text-vr-caption transition-colors ${
                  dashRange === r.key
                    ? 'bg-vraccent-primary text-white'
                    : 'text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrborder-hover/50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {statCards.map((stat, idx) => (
            <StatCard key={stat.label} stat={stat as any} index={idx} />
          ))}
        </div>
        <p className="text-vr-caption text-vrtext-muted text-center">
          营业额按付款时间统计 · 预约/核销按到场日期统计
        </p>

        {/* Section 3: Venue cards + Order chart */}
        <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4 content-start">
            {venues.map((venue: any, idx: number) => (
              <VenueCard key={venue.id} venue={venue} index={idx} />
            ))}
          </div>
          <OrderChart chartData={revenueData || []} period={revenuePeriod} onPeriodChange={setRevenuePeriod} />
        </div>

        {/* Section 4: Schedule timeline */}
        <ScheduleTimeline venues={venues} bookings={todayBookings} />

        {/* Section 4: Latest orders */}
        <LatestOrders orders={latestOrders} />
      </motion.div>
    </Layout>
  )
}
