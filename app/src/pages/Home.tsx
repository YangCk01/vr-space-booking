import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Eye,
  Users,
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Wallet,
  User,
  Wrench,
} from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import Layout from '@/components/Layout'
import { getDashboard, getRevenue } from '@/api/analytics'
import ProgressMetricCard from '@/components/ui/progress-metric-card'
import { getVenues } from '@/api/venues'
import type { Venue } from '@/api/venues'
import { getBookings } from '@/api/bookings'
import type { Booking } from '@/api/bookings'
import { getSettings } from '@/api/settings'
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

function readSetting<T>(settings: Record<string, any> | undefined, key: string, fallback: T): T {
  const raw = settings?.[key]
  const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw
  return (value ?? fallback) as T
}

function yuanFromCents(value: number | null | undefined, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  }).format((value || 0) / 100)
}

function datePart(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? format(value, 'yyyy-MM-dd') : String(value).slice(0, 10)
}

function maintenanceBoundary(dateValue: string | Date | null | undefined, timeValue: string | null | undefined): Date | null {
  const day = datePart(dateValue)
  if (!day || !timeValue) return null
  const time = timeValue.length === 5 ? `${timeValue}:00` : timeValue
  const parsed = new Date(`${day}T${time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getEffectiveVenueStatus(venue: Venue): 'open' | 'maintenance' | 'closed' {
  if (venue.status === 'DISABLED') return 'closed'
  if (venue.status !== 'MAINTENANCE') return 'open'

  const start = maintenanceBoundary(venue.maintenanceStartDate, venue.maintenanceStartTime)
  const end = maintenanceBoundary(venue.maintenanceEndDate, venue.maintenanceEndTime)
  if (!start || !end) return 'maintenance'

  const now = new Date()
  return now >= start && now <= end ? 'maintenance' : 'open'
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
  const Icon = stat.icon
  return (
    <motion.div
      variants={itemVariants}
      className="soft-panel group relative min-h-[116px] p-5 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex h-full items-center gap-5">
        <span className={cn('soft-icon h-14 w-14 shrink-0 bg-gradient-to-br shadow-[0_18px_35px_rgba(59,130,246,0.16)]', stat.iconTone)}>
          {Icon && <Icon className={cn('h-7 w-7', stat.iconColor)} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-vr-body-sm text-vrtext-secondary">{stat.label}</p>
          <div className="mt-1 flex items-center gap-3">
            <motion.p
              className="text-vr-data-md text-vrtext-primary"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.08 }}
            >
              {stat.prefix}{stat.value}{stat.suffix}
            </motion.p>
          </div>
          <div className="mt-1 flex items-center gap-2 text-vr-caption">
            <span className="text-vrtext-tertiary">{stat.helper}</span>
            {stat.trend != null && (
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                stat.trend >= 0 ? 'bg-vrsuccess/15 text-vrsuccess' : 'bg-vrerror/12 text-vrerror'
              )}>
                {stat.trend >= 0 ? '+' : ''}{stat.trend}%
              </span>
            )}
          </div>
        </div>
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
    <div className={cn('flex items-center justify-center rounded-full px-2 py-1.5', c.bg)}>
      <span className={cn('text-xs font-medium leading-tight', c.text)}>{c.label}</span>
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
function ScheduleTimeline({
  venues,
  bookings,
  title = '今日排场',
  selectedVenueId,
  onVenueChange,
}: {
  venues: any[]
  bookings: Booking[]
  title?: string
  selectedVenueId: string
  onVenueChange: (value: string) => void
}) {
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + (m || 0)
  }

  const groupOverlappingBookings = (bookings: Booking[]) => {
    const sorted = [...bookings].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    const clusters: Booking[][] = []

    for (const booking of sorted) {
      const bStart = timeToMinutes(booking.startTime)
      const bEnd = timeToMinutes(booking.endTime)
      let placed = false
      for (const cluster of clusters) {
        const overlaps = cluster.some((b) => {
          const start = timeToMinutes(b.startTime)
          const end = timeToMinutes(b.endTime)
          return bStart < end && bEnd > start
        })
        if (overlaps) {
          cluster.push(booking)
          placed = true
          break
        }
      }
      if (!placed) {
        clusters.push([booking])
      }
    }

    return clusters
  }

  const [activeClusterId, setActiveClusterId] = useState<string | null>(null)
  const visibleVenues = selectedVenueId === 'all'
    ? venues
    : venues.filter((venue) => venue.id === selectedVenueId)

  const venueClustersMap = useMemo(() => {
    const map = new Map<string, Booking[][]>()
    for (const venue of visibleVenues) {
      const venueBookings = bookings.filter((b) => b.venueId === venue.id)
      map.set(venue.id, groupOverlappingBookings(venueBookings))
    }
    return map
  }, [visibleVenues, bookings])

  const allClusters = useMemo(() => {
    const clusters: Booking[][] = []
    venueClustersMap.forEach((value) => clusters.push(...value))
    return clusters
  }, [venueClustersMap])

  const activeCluster = useMemo(() => {
    if (allClusters.length === 0) return null
    return allClusters.find((c) => c.map((b) => b.id).join('-') === activeClusterId) || allClusters[0]
  }, [activeClusterId, allClusters])

  const activeBooking = activeCluster?.[0] || null
  const activeVenue = activeBooking
    ? venues.find((venue) => venue.id === activeBooking.venueId)
    : null

  const { startHour, endHour, timeSlots, totalMinutes } = useMemo(() => {
    const openingHours = visibleVenues
      .map((venue) => Number(venue.openTime?.split(':')[0]))
      .filter((value) => Number.isFinite(value))
    const closingHours = visibleVenues
      .map((venue) => Number(venue.closeTime?.split(':')[0]))
      .filter((value) => Number.isFinite(value))
    const startH = Math.min(10, ...(openingHours.length ? openingHours : [10]))
    const endH = Math.max(22, ...(closingHours.length ? closingHours : [22]))
    const slots = Array.from({ length: Math.floor((endH - startH) / 2) + 1 }, (_, i) => startH + i * 2)
    return {
      startHour: startH,
      endHour: endH,
      timeSlots: slots,
      totalMinutes: Math.max((endH - startH) * 60, 60),
    }
  }, [visibleVenues])

  const getTypeLabel = (booking: Booking) => {
    if (booking.game?.title) return booking.game.title
    if (booking.title) return booking.title
    switch (booking.type) {
      case 'TEAM': return '团队预约'
      case 'INDIVIDUAL': return '散客预约'
      case 'CORPORATE': return '企业活动'
      case 'MAINTENANCE': return '维护'
      default: return '预约'
    }
  }

  const getEventTone = (booking: Booking) => {
    if (booking.type === 'MAINTENANCE' || booking.status === 'NO_SHOW') {
      return 'border-slate-300 bg-slate-50 text-slate-500 dark:bg-slate-500/12 dark:text-slate-300'
    }
    if (booking.type === 'TEAM') {
      return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300'
    }
    if (booking.type === 'CORPORATE') {
      return 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-500/12 dark:text-amber-300'
    }
    return 'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-500/12 dark:text-blue-300'
  }

  const getBookingMetrics = (booking: Booking) => {
    const [startH, startM] = booking.startTime.split(':').map(Number)
    const [endHValue, endM] = booking.endTime.split(':').map(Number)
    const start = Math.max(0, (startH - startHour) * 60 + (startM || 0))
    const end = Math.min(totalMinutes, (endHValue - startHour) * 60 + (endM || 0))
    const width = Math.max(((end - start) / totalMinutes) * 100, 4)
    return {
      left: `${(start / totalMinutes) * 100}%`,
      width: `${Math.min(width, 100 - (start / totalMinutes) * 100)}%`,
    }
  }

  const getClusterMetrics = (cluster: Booking[]) => {
    const starts = cluster.map((b) => timeToMinutes(b.startTime))
    const ends = cluster.map((b) => timeToMinutes(b.endTime))
    const start = Math.max(0, Math.min(...starts) - startHour * 60)
    const end = Math.min(totalMinutes, Math.max(...ends) - startHour * 60)
    const width = Math.max(((end - start) / totalMinutes) * 100, 4)
    return {
      left: `${(start / totalMinutes) * 100}%`,
      width: `${Math.min(width, 100 - (start / totalMinutes) * 100)}%`,
    }
  }

  const getBookingIcon = (booking: Booking) => {
    if (booking.type === 'TEAM') return Users
    if (booking.type === 'CORPORATE') return Building2
    if (booking.type === 'MAINTENANCE') return Wrench
    return User
  }

  const currentTimeLeft = useMemo(() => {
    const now = new Date()
    const currentMinutes =
      (now.getHours() - startHour) * 60 +
      now.getMinutes() +
      now.getSeconds() / 60 +
      now.getMilliseconds() / 60000
    if (currentMinutes < 0) return '0%'
    if (currentMinutes > totalMinutes) return '100%'
    return `${(currentMinutes / totalMinutes) * 100}%`
  }, [startHour, totalMinutes])

  return (
    <motion.div variants={itemVariants} className="soft-panel p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-vr-h3 text-vrtext-primary">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedVenueId}
            onChange={(event) => onVenueChange(event.target.value)}
            className="soft-input h-9 px-3 text-vr-body-sm"
          >
            <option value="all">全部场地</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>{venue.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[170px_minmax(680px,1fr)] border-b border-vrborder-subtle pb-3 text-vr-caption text-vrtext-secondary">
            <span>时间</span>
            <div className="relative h-5">
              {timeSlots.map((hour) => (
                <span
                  key={hour}
                  className={cn(
                    'absolute top-0 whitespace-nowrap',
                    hour === startHour ? 'translate-x-0' : hour === endHour ? '-translate-x-full' : '-translate-x-1/2'
                  )}
                  style={{ left: `${((hour - startHour) * 60 / totalMinutes) * 100}%` }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            <div className="relative col-start-2 h-1.5">
              {currentTimeLeft && (
                <div
                  className={cn(
                    'absolute top-0 z-10 flex flex-col items-center',
                    currentTimeLeft === '0%' && 'translate-x-0',
                    currentTimeLeft === '100%' && '-translate-x-full',
                    currentTimeLeft !== '0%' && currentTimeLeft !== '100%' && '-translate-x-1/2'
                  )}
                  style={{ left: currentTimeLeft }}
                >
                  <span className="mb-0.5 whitespace-nowrap rounded bg-vrerror px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    现在
                  </span>
                  <div className="h-1.5 w-0.5 rounded-full bg-vrerror" />
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            {visibleVenues.map((venue, rowIndex) => {
              const venueClusters = venueClustersMap.get(venue.id) || []
              return (
                <div
                  key={venue.id}
                  className="grid min-h-[44px] grid-cols-[170px_minmax(680px,1fr)] border-b border-vrborder-subtle last:border-b-0"
                >
                  <div className="flex items-center gap-3 py-4 pr-4">
                    <img src={getImageUrl(venue.image)} alt={venue.name} className="h-12 w-14 rounded-lg object-cover shadow-sm" />
                    <div className="min-w-0">
                      <p className="text-vr-body-sm font-semibold text-vrtext-primary">{venue.name}</p>
                      <p className="text-vr-caption text-vrtext-tertiary">
                        {venue.area}m² <span className="mx-1">·</span> {venue.capacity}人
                      </p>
                    </div>
                  </div>
                  <div className="relative h-full py-4">
                    <div className="absolute inset-y-0 left-0 right-0 grid" style={{ gridTemplateColumns: `repeat(${timeSlots.length - 1}, minmax(0, 1fr))` }}>
                      {timeSlots.slice(0, -1).map((hour) => (
                        <div key={hour} className="border-l border-dashed border-vrborder-subtle first:border-l" />
                      ))}
                    </div>
                    {venue.status === 'maintenance' && venueClusters.length === 0 && (
                      <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 flex items-center justify-center">
                        <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400">
                          <Wrench className="h-3.5 w-3.5" />
                          <span>
                            维护中
                            {venue.maintenanceStartTime && venue.maintenanceEndTime && (
                              <span className="ml-1 opacity-90">
                                {venue.maintenanceStartTime}-{venue.maintenanceEndTime}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    {venueClusters.map((cluster, clusterIndex) => {
                      const isSingle = cluster.length === 1
                      const firstBooking = cluster[0]
                      const metrics = getClusterMetrics(cluster)
                      const BookingIcon = getBookingIcon(firstBooking)
                      const tone = getEventTone(firstBooking)
                      const clusterKey = cluster.map((b) => b.id).join('-')
                      return (
                        <motion.div
                          key={clusterKey}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.25, delay: rowIndex * 0.06 + clusterIndex * 0.04 }}
                          className="absolute top-1/2 z-10 -translate-y-1/2"
                          style={{ left: metrics.left }}
                          onMouseEnter={() => setActiveClusterId(clusterKey)}
                          onFocus={() => setActiveClusterId(clusterKey)}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveClusterId(clusterKey)}
                            className="relative flex h-7 w-7 items-center justify-center focus:outline-none"
                            title={cluster
                              .map((b) => `${getTypeLabel(b)} ${b.startTime}-${b.endTime} ${b.personCount || 1}人`)
                              .join('\n')}
                          >
                            <span
                              className={cn(
                                'relative z-10 flex h-7 w-7 items-center justify-center rounded-xl border shadow-sm transition-all hover:scale-110 hover:shadow-md focus:ring-2 focus:ring-vraccent-primary/25',
                                tone,
                                activeCluster?.map((b) => b.id).join('-') === clusterKey && 'scale-110 shadow-md ring-2 ring-vraccent-primary/20'
                              )}
                            >
                              <BookingIcon className="h-3.5 w-3.5" />
                            </span>
                            {!isSingle && (
                              <span className="absolute -right-1 -top-1 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-vrerror px-1 text-[10px] font-bold text-white shadow-sm">
                                {cluster.length}
                              </span>
                            )}
                          </button>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {visibleVenues.length === 0 && (
              <div className="py-16 text-center text-vr-caption text-vrtext-muted">暂无场地数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-vrborder-subtle bg-vrbg-surface px-4 py-3">
        {activeCluster ? (
          activeCluster.length === 1 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-vr-body-sm font-semibold text-vrtext-primary">
                  {getTypeLabel(activeBooking!)}
                </p>
                <p className="mt-1 text-vr-caption text-vrtext-tertiary">
                  {activeVenue?.name || activeBooking!.venue?.name || '未知场地'}
                  {activeBooking!.personName ? ` · ${activeBooking!.personName}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-vr-caption text-vrtext-secondary">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-vrbg-card px-3 py-1.5">
                  <Clock3 className="h-3.5 w-3.5" />
                  {activeBooking!.startTime}-{activeBooking!.endTime}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-vrbg-card px-3 py-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {activeBooking!.personCount || 1}人
                </span>
                {activeBooking!.personPhone && (
                  <span className="inline-flex items-center rounded-full bg-vrbg-card px-3 py-1.5">
                    {activeBooking!.personPhone}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="truncate text-vr-body-sm font-semibold text-vrtext-primary">
                  {getTypeLabel(activeBooking!)} 等 {activeCluster.length} 笔预约
                </p>
                <p className="text-vr-caption text-vrtext-tertiary">
                  {activeVenue?.name || activeBooking!.venue?.name || '未知场地'}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {activeCluster.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-vrborder-subtle bg-vrbg-card px-3 py-2 text-vr-caption text-vrtext-secondary"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {booking.startTime}-{booking.endTime}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {booking.personCount || 1}人
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                      {booking.personName && <span>{booking.personName}</span>}
                      {booking.personPhone && <span>{booking.personPhone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          <p className="text-center text-vr-caption text-vrtext-muted">
            悬停或点击排场图标查看完整预约信息
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-center">
        <div className="flex flex-wrap items-center gap-5 rounded-full border border-vrborder-subtle bg-vrbg-card px-5 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
          <span className="flex items-center gap-2 text-vr-caption text-vrtext-secondary"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" />已预约</span>
          <span className="flex items-center gap-2 text-vr-caption text-vrtext-secondary"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />即将开始</span>
          <span className="flex items-center gap-2 text-vr-caption text-vrtext-secondary"><i className="h-2.5 w-2.5 rounded-full bg-slate-300" />维护/不可用</span>
          <span className="flex items-center gap-2 text-vr-caption text-vrtext-secondary"><i className="h-2.5 w-2.5 rounded-full bg-slate-200" />空闲</span>
        </div>
      </div>
    </motion.div>
  )
}

function VenueStatusPanel({ venues }: { venues: any[] }) {
  return (
    <motion.div variants={itemVariants} className="soft-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-vr-h3 text-vrtext-primary">场地状态</h3>
        <span className="text-vr-caption text-vrtext-tertiary">{venues.length} 个场地</span>
      </div>
      <div className="space-y-3">
        {venues.slice(0, 5).map((venue) => (
          <div key={venue.id} className="flex items-center gap-3 rounded-xl border border-vrborder-subtle bg-vrbg-card p-3 shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
            <img src={getImageUrl(venue.image)} alt={venue.name} className="h-12 w-16 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-vr-body-sm font-medium text-vrtext-primary truncate">{venue.name}</p>
              <p className="text-vr-caption text-vrtext-tertiary">
                {venue.area}m² <span className="mx-1">·</span> {venue.deviceCount || 0}台设备 <span className="mx-1">·</span> {venue.capacity}人
              </p>
              <p className="text-vr-caption text-vrtext-tertiary">{venue.openTime || '10:00'} - {venue.closeTime || '22:00'}</p>
            </div>
            <VerticalStatusTag status={venue.status} />
          </div>
        ))}
        {venues.length === 0 && (
          <div className="py-8 text-center text-vr-caption text-vrtext-muted">暂无场地数据</div>
        )}
      </div>
    </motion.div>
  )
}

function TodoPanel({ pendingVerify, reconAlerts, refundAlerts }: { pendingVerify: number; reconAlerts: number; refundAlerts: number }) {
  const todos = [
    { label: '退款处置异常', value: refundAlerts, icon: AlertTriangle, tone: 'text-vrerror bg-vrerror/10', badge: 'bg-vrerror/12 text-vrerror' },
    { label: '今日待核销', value: pendingVerify, icon: CheckCircle2, tone: 'text-vrwarning bg-vrwarning/10', badge: 'bg-vrwarning/15 text-vrwarning' },
    { label: '对账提醒', value: reconAlerts, icon: ClipboardList, tone: 'text-vraccent-primary bg-vraccent-primary/10', badge: 'bg-vraccent-primary/12 text-vraccent-primary' },
  ]
  return (
    <motion.div variants={itemVariants} className="soft-panel p-5">
      <h3 className="text-vr-h3 text-vrtext-primary mb-4">待处理事项</h3>
      <div className="space-y-3">
        {todos.map((todo) => (
          <button key={todo.label} className="flex w-full items-center gap-3 rounded-xl border border-vrborder-subtle bg-vrbg-card p-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.035)] transition-colors hover:bg-vrbg-hover">
            <span className={cn('soft-icon h-10 w-10', todo.tone)}>
              <todo.icon className="w-4 h-4" />
            </span>
            <span className="flex-1 text-vr-body-sm text-vrtext-secondary">{todo.label}</span>
            <span className={cn('min-w-6 rounded-full px-2 py-0.5 text-center text-vr-caption font-semibold', todo.badge)}>{todo.value}</span>
            <ChevronRight className="h-4 w-4 text-vrtext-muted" />
          </button>
        ))}
      </div>
    </motion.div>
  )
}

function OrderCompositionPanel({ orders }: { orders: any[] }) {
  const paid = orders.filter((o) => ['PAID', 'READY_TO_VERIFY', 'PLAYING'].includes(o.status)).length
  const completed = orders.filter((o) => o.status === 'COMPLETED').length
  const pending = orders.filter((o) => o.status === 'PENDING').length
  const closed = Math.max(0, orders.length - paid - completed - pending)
  const data = [
    { name: '待核销', value: paid, color: '#3B82F6' },
    { name: '已完成', value: completed, color: '#10B981' },
    { name: '待支付', value: pending, color: '#F59E0B' },
    { name: '已关闭', value: closed, color: '#94A3B8' },
  ].filter((item) => item.value > 0)

  return (
    <motion.div variants={itemVariants} className="soft-panel p-5">
      <h3 className="text-vr-h3 text-vrtext-primary mb-4">订单构成</h3>
      <div className="grid min-h-[220px] grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_150px]">
        <div className="relative h-[210px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} innerRadius={62} outerRadius={88} paddingAngle={3} dataKey="value">
                {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.96)',
                  border: '1px solid var(--vr-border-subtle)',
                  borderRadius: 12,
                  boxShadow: '0 16px 35px rgba(15,23,42,0.08)',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-vr-caption text-vrtext-muted">暂无订单数据</div>
        )}
          {data.length > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-vr-data-md text-vrtext-primary">{orders.length}</p>
              <p className="text-vr-caption text-vrtext-secondary">总订单</p>
            </div>
          )}
        </div>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-vr-caption text-vrtext-secondary">
            <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </span>
            <span>{orders.length ? Math.round((item.value / orders.length) * 1000) / 10 : 0}% ({item.value})</span>
          </div>
        ))}
      </div>
      </div>
    </motion.div>
  )
}

/* ─── Latest Orders ─── */
function LatestOrders({ orders, title = '最新订单' }: { orders: any[]; title?: string }) {
  const displayOrders = orders
  const navigate = useNavigate()

  const statusTextMap: Record<string, string> = {
    PENDING: '待支付',
    PAID: '已支付',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    REFUNDING: '退款中',
    REFUNDED: '已退款',
    NO_SHOW: '未到场',
  }

  const statusTone: Record<string, string> = {
    PENDING: 'bg-vrwarning/15 text-vrwarning',
    PAID: 'bg-vraccent-primary/12 text-vraccent-primary',
    READY_TO_VERIFY: 'bg-vrwarning/15 text-vrwarning',
    PLAYING: 'bg-vraccent-primary/12 text-vraccent-primary',
    COMPLETED: 'bg-vrsuccess/15 text-vrsuccess',
    CANCELLED: 'bg-vrtext-muted/15 text-vrtext-tertiary',
    REFUNDING: 'bg-vrwarning/15 text-vrwarning',
    REFUNDED: 'bg-vrerror/12 text-vrerror',
  }

  const compactOrders = displayOrders.slice(0, 3)

  return (
    <motion.div
      variants={itemVariants}
      className="soft-panel p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-vr-h3 text-vrtext-primary">{title}</h3>
        <Link
          to="/orders"
          className="flex items-center gap-1 text-vr-body-sm text-vraccent-primary hover:underline transition-colors"
        >
          查看全部 <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px]">
          <thead>
            <tr className="bg-vrbg-elevated">
              <th className="rounded-l-lg px-3 py-3 text-left text-vr-caption font-medium text-vrtext-secondary">订单号</th>
              <th className="px-3 py-3 text-left text-vr-caption font-medium text-vrtext-secondary">用户</th>
              <th className="px-3 py-3 text-left text-vr-caption font-medium text-vrtext-secondary">金额</th>
              <th className="rounded-r-lg px-3 py-3 text-left text-vr-caption font-medium text-vrtext-secondary">状态</th>
            </tr>
          </thead>
          <tbody>
            {compactOrders.map((order: any, idx: number) => (
              <motion.tr
                key={order.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.5 + idx * 0.06 }}
                className="border-b border-vrborder-subtle/50 hover:bg-vrbg-elevated/40 transition-colors"
                onClick={() => navigate('/orders')}
              >
                <td className="px-3 py-3 text-vr-caption font-mono text-vrtext-secondary">{order.orderNo}</td>
                <td className="px-3 py-3">
                  <p className="text-vr-caption font-medium text-vrtext-primary">{order.userName || order.customerName || order.personName || '-'}</p>
                  <p className="text-[11px] text-vrtext-tertiary">{order.userPhone || order.personPhone || ''}</p>
                </td>
                <td className="px-3 py-3 text-vr-caption font-semibold text-vrerror">¥{(order.amount / 100).toFixed(2)}</td>
                <td className="px-3 py-3">
                  <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold', statusTone[order.status] || 'bg-vraccent-primary/12 text-vraccent-primary')}>
                    {statusTextMap[order.status] || order.status}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {displayOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Eye className="w-10 h-10 text-vrtext-muted mb-3" />
          <p className="text-vr-body text-vrtext-secondary">暂无订单数据</p>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Home Page ─── */
export default function Home() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedVenueId, setSelectedVenueId] = useState('all')

  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => getDashboard('today'),
  })

  const { data: pageSettings } = useQuery({
    queryKey: ['settings', 'home-page'],
    queryFn: () => getSettings('page'),
    staleTime: 60000,
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
  const bHomeScheduleTitle = readSetting(pageSettings, 'b_home_schedule_title', '今日排场')
  const bHomeOrdersTitle = readSetting(pageSettings, 'b_home_orders_title', '最新订单')

  // 获取排场预约
  const { data: bookingData } = useQuery({
    queryKey: ['bookings', 'home-schedule', today, selectedVenueId],
    queryFn: () => getBookings({
      date: today,
      venueId: selectedVenueId === 'all' ? undefined : selectedVenueId,
      pageSize: 100,
    }),
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

    const effectiveStatus = getEffectiveVenueStatus(v)
    const statusTextMap: Record<typeof effectiveStatus, string> = {
      open: '营业中',
      maintenance: '维护中',
      closed: '暂停营业',
    }

    return {
      ...v,
      status: effectiveStatus,
      statusText: statusTextMap[effectiveStatus],
      todayBookings: activeBookings.length,
      currentSlot: currentBooking
        ? `${currentBooking.startTime}-${currentBooking.endTime}`
        : activeBookings.length > 0
          ? `${activeBookings[0].startTime}-${activeBookings[0].endTime}`
          : null,
    }
  })

  const pendingVerifyCount = todayBookings.filter((b: any) => ['PAID', 'READY_TO_VERIFY', 'PLAYING'].includes(b.status)).length
  const refundAlertCount = stats?.refundedOrders || 0
  const reconAlertCount = (stats?.noShowCount || 0) + (stats?.cancelledOrders || 0)

  const statCards = stats ? [
    {
      label: '今日营收',
      value: yuanFromCents(stats.todayRevenue, 2),
      numericValue: stats.todayRevenue / 100,
      prefix: '¥',
      trend: stats.revenueTrend,
      helper: stats.revenueTrend != null ? (stats.revenueTrend > 0 ? '较昨日增长' : stats.revenueTrend < 0 ? '较昨日下降' : '较昨日持平') : '较昨日 —',
      iconTone: 'from-blue-50 to-blue-100 dark:from-blue-500/20 dark:to-blue-500/10',
      iconColor: 'text-vraccent-primary',
      icon: Wallet,
    },
    {
      label: '今日订单',
      value: String(stats.todayBookings || todayBookings.length || 0),
      numericValue: stats.todayBookings,
      prefix: '',
      suffix: '',
      trend: stats.bookingTrend,
      helper: stats.bookingTrend != null ? (stats.bookingTrend > 0 ? '较昨日增长' : stats.bookingTrend < 0 ? '较昨日下降' : '较昨日持平') : '较昨日 —',
      iconTone: 'from-emerald-50 to-emerald-100 dark:from-emerald-500/20 dark:to-emerald-500/10',
      iconColor: 'text-vrsuccess',
      icon: ClipboardList,
    },
    {
      label: '待核销',
      value: String(pendingVerifyCount || stats.pendingOrders || 0),
      numericValue: pendingVerifyCount,
      prefix: '',
      suffix: '',
      trend: null,
      helper: '待核销订单',
      iconTone: 'from-amber-50 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/10',
      iconColor: 'text-vrwarning',
      icon: CalendarDays,
    },
    {
      label: '场地在线',
      value: `${venues.filter((venue) => venue.status === 'open').length || 0} / ${venues.length || 0}`,
      numericValue: venues.filter((venue) => venue.status === 'open').length || 0,
      prefix: '',
      suffix: '',
      trend: null,
      helper: '在线场地 / 总场地',
      iconTone: 'from-red-50 to-rose-100 dark:from-red-500/20 dark:to-rose-500/10',
      iconColor: 'text-vrerror',
      icon: Building2,
    },
  ] : []

  return (
    <Layout breadcrumb={['首页', '概览']}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-5"
      >
        <motion.header variants={itemVariants} className="pt-1">
          <h1 className="text-vr-h1 text-vrtext-primary font-semibold">首页概览</h1>
          <p className="mt-1 text-vr-body-sm text-vrtext-secondary">今日经营、排场、场地状态与待办提醒</p>
        </motion.header>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {statCards.map((stat, idx) => (
            <StatCard key={stat.label} stat={stat as any} index={idx} />
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_420px] gap-5">
          <div className="space-y-5">
            <ScheduleTimeline
              venues={venues}
              bookings={todayBookings}
              title={bHomeScheduleTitle}
              selectedVenueId={selectedVenueId}
              onVenueChange={setSelectedVenueId}
            />
            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.35fr)_380px] gap-5">
              <ProgressMetricCard
                title={`近${revenuePeriod === '7d' ? '7' : '30'}天营收趋势`}
                series={[
                  {
                    name: '线上收入',
                    data: (revenueData || []).map((d: any) => ({ value: (d.onlineAmount || 0) / 100, date: d.label })),
                    accent: 'blue',
                  },
                  {
                    name: '线下收入',
                    data: (revenueData || []).map((d: any) => ({ value: (d.offlineAmount || 0) / 100, date: d.label })),
                    accent: 'emerald',
                  },
                  {
                    name: '营业外',
                    data: (revenueData || []).map((d: any) => ({ value: (d.otherIncome || 0) / 100, date: d.label })),
                    accent: 'amber',
                  },
                ]}
                period={revenuePeriod === '7d' ? '近7天' : '近30天'}
                periodOptions={[
                  { label: '近7天', points: 7 },
                  { label: '近30天', points: 30 },
                ]}
                onPeriodChange={(option) => setRevenuePeriod(option.label === '近7天' ? '7d' : '30d')}
                valueFormatter={(v) => `¥${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`}
                size="md"
                className="h-full"
              />
              <OrderCompositionPanel orders={latestOrders} />
            </div>
          </div>
          <div className="space-y-5">
            <VenueStatusPanel venues={venues} />
            <TodoPanel pendingVerify={pendingVerifyCount || stats?.pendingOrders || 0} reconAlerts={reconAlertCount} refundAlerts={refundAlertCount} />
            <LatestOrders orders={latestOrders} title={bHomeOrdersTitle} />
          </div>
        </div>
      </motion.div>
    </Layout>
  )
}
