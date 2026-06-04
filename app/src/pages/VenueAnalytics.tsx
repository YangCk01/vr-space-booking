import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  MapPin,
  Calendar,
  Users,
  Clock,
  BarChart3,
  Gamepad2,
  Gauge,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { format, subDays } from 'date-fns'
import { getVenueOccupancy, getGamePerformance } from '@/api/venueAnalytics'
import { getVenues } from '@/api/venues'

type DateRange = 'today' | '7days' | '30days' | 'custom'

const dateRangeOptions: { value: DateRange; label: string }[] = [
  { value: 'today', label: '当天' },
  { value: '7days', label: '近7天' },
  { value: '30days', label: '近30天' },
  { value: 'custom', label: '自定义' },
]



function getOccupancyColor(rate: number): string {
  if (rate <= 0) return 'rgba(255,255,255,0.04)'
  if (rate <= 20) return 'rgba(16,185,129,0.15)'
  if (rate <= 40) return 'rgba(16,185,129,0.30)'
  if (rate <= 60) return 'rgba(16,185,129,0.50)'
  if (rate <= 80) return 'rgba(16,185,129,0.70)'
  return 'rgba(16,185,129,0.90)'
}

function getOccupancyTextColor(rate: number): string {
  if (rate >= 60) return '#ffffff'
  return '#94A3B8'
}

export default function VenueAnalytics() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const sevenDaysAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const thirtyDaysAgo = format(subDays(new Date(), 29), 'yyyy-MM-dd')

  const [venueId, setVenueId] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('7days')
  const [customStart, setCustomStart] = useState(sevenDaysAgo)
  const [customEnd, setCustomEnd] = useState(today)

  const startDate = useMemo(() => {
    switch (dateRange) {
      case 'today': return today
      case '7days': return sevenDaysAgo
      case '30days': return thirtyDaysAgo
      case 'custom': return customStart
    }
  }, [dateRange, today, sevenDaysAgo, thirtyDaysAgo, customStart])

  const endDate = useMemo(() => {
    switch (dateRange) {
      case 'today': return today
      case '7days': return today
      case '30days': return today
      case 'custom': return customEnd
    }
  }, [dateRange, today, customEnd])

  const { data: venuesData } = useQuery({
    queryKey: ['venues', 'all'],
    queryFn: () => getVenues({ pageSize: 100 }),
  })
  const venues = venuesData?.data || []

  const { data: occupancyData } = useQuery({
    queryKey: ['venueAnalytics', 'occupancy', venueId, startDate, endDate],
    queryFn: () =>
      getVenueOccupancy({
        venueId: venueId || undefined,
        startDate,
        endDate,
      }),
    enabled: venues.length > 0,
  })

  const { data: gamePerformanceData } = useQuery({
    queryKey: ['venueAnalytics', 'games', venueId, startDate, endDate],
    queryFn: () =>
      getGamePerformance({
        startDate,
        endDate,
        venueId: venueId || undefined,
      }),
    enabled: !!startDate && !!endDate,
  })

  const occupancy = occupancyData || []
  const games = gamePerformanceData || []

  // 从数据中动态提取所有出现过的时段
  const hoursFromData = useMemo(() => {
    const set = new Set<number>()
    occupancy.forEach((o) => set.add(o.hour))
    return Array.from(set).sort((a, b) => a - b)
  }, [occupancy])

  const HOURS = hoursFromData.length > 0 ? hoursFromData : [10, 12, 14, 16, 18, 20]
  const HOUR_LABELS = HOURS.map((h) => `${String(h).padStart(2, '0')}:00`)

  const dates = useMemo(() => {
    const d: string[] = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      d.push(format(cur, 'yyyy-MM-dd'))
    }
    return d
  }, [startDate, endDate])

  const occupancyMap = useMemo(() => {
    const map = new Map<string, OccupancyData[]>()
    occupancy.forEach((o) => {
      const list = map.get(o.date) || []
      list.push(o)
      map.set(o.date, list)
    })
    return map
  }, [occupancy])

  const stats = useMemo(() => {
    if (!occupancy.length) return { avgRate: 0, totalBookings: 0, avgPlayers: 0 }
    const avgRate = occupancy.reduce((s, o) => s + o.occupancyRate, 0) / occupancy.length
    const totalBookings = occupancy.reduce((s, o) => s + o.bookings, 0)
    const totalPlayers = occupancy.reduce((s, o) => s + o.totalPlayers, 0)
    const avgPlayers = totalBookings > 0 ? totalPlayers / totalBookings : 0
    return { avgRate, totalBookings, avgPlayers }
  }, [occupancy])

  const kpiCards = [
    {
      icon: <Gauge className="w-6 h-6 text-vraccent-primary" />,
      iconBg: 'rgba(59,130,246,0.1)',
      label: '日均上座率',
      value: `${stats.avgRate.toFixed(1)}%`,
    },
    {
      icon: <Clock className="w-6 h-6 text-vrsuccess" />,
      iconBg: 'rgba(16,185,129,0.1)',
      label: '总场次',
      value: stats.totalBookings.toLocaleString(),
    },
    {
      icon: <Users className="w-6 h-6 text-vrwarning" />,
      iconBg: 'rgba(245,158,11,0.1)',
      label: '平均单场人数',
      value: stats.avgPlayers.toFixed(1),
    },
  ]

  return (
    <Layout breadcrumb={['数据报表', '场地运营']}>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">场地运营分析</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">场地 occupancy 与游戏表现追踪</p>
          </div>
          <MapPin className="w-8 h-8 text-vraccent-primary" />
        </motion.div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-vrtext-muted" />
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
            >
              <option value="">全部场地</option>
              {venues.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h-5 w-[1px] bg-vrborder-subtle" />

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-vrtext-muted" />
            {dateRangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-vr-body-sm transition-colors',
                  dateRange === opt.value
                    ? 'bg-vrbg-active text-vraccent-primary'
                    : 'text-vrtext-secondary hover:bg-vrbg-elevated'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
              />
              <span className="text-vr-caption text-vrtext-tertiary">至</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
              />
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {kpiCards.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-5"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: kpi.iconBg }}
                >
                  {kpi.icon}
                </div>
                <div>
                  <p className="text-vr-caption text-vrtext-tertiary">{kpi.label}</p>
                  <p className="text-vr-data-lg text-vrtext-primary mt-1">{kpi.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Heatmap */}
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-vraccent-primary" />
            <h3 className="text-vr-body text-vrtext-primary font-medium">时段上座率热力图</h3>
          </div>

          {dates.length > 0 && (
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* X-axis labels */}
                <div className="grid gap-1" style={{ gridTemplateColumns: `60px repeat(${dates.length}, 1fr)` }}>
                  <div />
                  {dates.map((d) => (
                    <div key={d} className="text-center text-vr-caption text-vrtext-secondary py-1">
                      {d.slice(5)}
                    </div>
                  ))}
                </div>

                {/* Grid */}
                {HOURS.map((hour, rowIdx) => (
                  <div
                    key={hour}
                    className="grid gap-1 mt-1"
                    style={{ gridTemplateColumns: `60px repeat(${dates.length}, 1fr)` }}
                  >
                    <div className="flex items-center justify-end pr-2 text-vr-caption text-vrtext-secondary">
                      {HOUR_LABELS[rowIdx]}
                    </div>
                    {dates.map((date) => {
                      const dayData = occupancyMap.get(date) || []
                      const cell = dayData.find((o) => o.hour === hour)
                      const rate = cell?.occupancyRate || 0
                      const bookings = cell?.bookings || 0
                      const players = cell?.totalPlayers || 0
                      return (
                        <div
                          key={`${date}-${hour}`}
                          className="relative group rounded-md h-10 flex items-center justify-center transition-all cursor-default"
                          style={{
                            backgroundColor: getOccupancyColor(rate),
                          }}
                          title={`${date} ${hour}:00-${hour + 2}:00\n上座率: ${rate.toFixed(1)}%\n场次: ${bookings}\n人数: ${players}`}
                        >
                          <span
                            className="text-vr-caption font-medium"
                            style={{ color: getOccupancyTextColor(rate) }}
                          >
                            {rate > 0 ? `${rate.toFixed(0)}%` : '-'}
                          </span>

                          {/* Hover tooltip */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 pointer-events-none">
                            <div className="bg-vrbg-elevated border border-vrborder-hover rounded-lg shadow-lg px-3 py-2 whitespace-nowrap">
                              <p className="text-vr-caption text-vrtext-primary font-medium">
                                {date} {hour}:00-{hour + 2}:00
                              </p>
                              <p className="text-vr-caption text-vrtext-secondary mt-0.5">
                                上座率: <span className="text-vraccent-primary font-semibold">{rate.toFixed(1)}%</span>
                              </p>
                              <p className="text-vr-caption text-vrtext-secondary">
                                场次: <span className="text-vrtext-primary font-semibold">{bookings}</span>
                              </p>
                              <p className="text-vr-caption text-vrtext-secondary">
                                人数: <span className="text-vrtext-primary font-semibold">{players}</span>
                              </p>
                            </div>
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-vrborder-hover" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}

                {/* Legend */}
                <div className="flex items-center gap-3 mt-4 justify-end">
                  <span className="text-vr-caption text-vrtext-tertiary">上座率</span>
                  <div className="flex items-center gap-1">
                    {['0%', '20%', '40%', '60%', '80%', '100%'].map((label, i) => (
                      <div key={label} className="flex flex-col items-center gap-1">
                        <div
                          className="w-8 h-3 rounded-sm"
                          style={{
                            backgroundColor: getOccupancyColor(i * 20),
                            border: i === 0 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                          }}
                        />
                        <span className="text-vr-caption text-vrtext-muted">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {dates.length === 0 && (
            <div className="text-center py-12 text-vrtext-tertiary text-vr-body-sm">暂无数据</div>
          )}
        </div>

        {/* Game Performance Table */}
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5 pb-2">
            <Gamepad2 className="w-4 h-4 text-vraccent-primary" />
            <h3 className="text-vr-body text-vrtext-primary font-medium">游戏维度表现</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-vrbg-elevated">
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">游戏名称</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">总场次</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">平均上座率</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">复购率</th>
                </tr>
              </thead>
              <tbody>
                {games.map((item, idx) => (
                  <motion.tr
                    key={item.gameName}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.03 }}
                    className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                  >
                    <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary font-medium">
                      {item.gameName}
                    </td>
                    <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                      {item.bookingCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-vrbg-elevated rounded-full overflow-hidden">
                          <div
                            className="h-full bg-vrsuccess rounded-full"
                            style={{ width: `${Math.min(item.avgOccupancyRate, 100)}%` }}
                          />
                        </div>
                        <span>{item.avgOccupancyRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                      {item.repurchaseRate.toFixed(1)}%
                    </td>
                  </motion.tr>
                ))}
                {games.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-vrtext-tertiary text-vr-body-sm">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
