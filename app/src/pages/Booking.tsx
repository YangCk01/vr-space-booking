import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  User as UserIcon,
  Building2,
  Wrench,
  CalendarDays,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { getVenues } from '@/api/venues'
import type { Venue } from '@/api/venues'
import { getGames } from '@/api/games'
import type { Game } from '@/api/games'
import { getUsers } from '@/api/users'
import type { User } from '@/api/users'
import { getSystemConfigs } from '@/api/systemConfig'
import { getBookings, createBooking, checkConflict } from '@/api/bookings'
import type { Booking } from '@/api/bookings'
import { createOrder } from '@/api/orders'
import { buildMemberLevelsFromConfig } from '@/lib/memberLevels'
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  startOfMonth,
  endOfMonth,
  isToday,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'

/* ─── View type ─── */
type ViewType = 'day' | 'week' | 'month'

const easeOut = [0, 0, 0.2, 1] as [number, number, number, number]

/* ─── Helper: parse venue open/close hour ─── */
function parseVenueHours(venue?: Venue) {
  const openH = venue?.openTime ? parseInt(venue.openTime.split(':')[0]) : 9
  const closeH = venue?.closeTime ? parseInt(venue.closeTime.split(':')[0]) : 22
  return { openH, closeH }
}

function buildHourSlots(openH: number, closeH: number): string[] {
  const slots: string[] = []
  for (let h = openH; h <= closeH; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
  }
  return slots
}

/* ─── Helper: check if a time slot is in the past ─── */
function getCurrentTimeString(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
function isSlotPast(slot: string, dateStr: string): boolean {
  if (!isToday(new Date(dateStr))) return false
  const slotMinutes = timeToMinutes(slot)
  const nowMinutes = timeToMinutes(getCurrentTimeString())
  console.log('isSlotPast debug:', { slot, slotMinutes, now: getCurrentTimeString(), nowMinutes, result: slotMinutes <= nowMinutes })
  return slotMinutes <= nowMinutes
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const newH = Math.floor(total / 60)
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function getEventDateStr(dateValue: string | Date): string {
  if (typeof dateValue === 'string') {
    return dateValue.slice(0, 10)
  }
  return format(dateValue, 'yyyy-MM-dd')
}

/* ─── Event type config ─── */
const eventTypeConfig: Record<string, { bg: string; border: string; icon: typeof Users; label: string }> = {
  team: { bg: 'bg-[rgba(59,130,246,0.28)]', border: 'border-l-[#3B82F6]', icon: Users, label: '团队预约' },
  TEAM: { bg: 'bg-[rgba(59,130,246,0.28)]', border: 'border-l-[#3B82F6]', icon: Users, label: '团队预约' },
  individual: { bg: 'bg-[rgba(139,92,246,0.28)]', border: 'border-l-[#8B5CF6]', icon: UserIcon, label: '散客预约' },
  INDIVIDUAL: { bg: 'bg-[rgba(139,92,246,0.28)]', border: 'border-l-[#8B5CF6]', icon: UserIcon, label: '散客预约' },
  corporate: { bg: 'bg-[rgba(16,185,129,0.28)]', border: 'border-l-[#10B981]', icon: Building2, label: '企业活动' },
  CORPORATE: { bg: 'bg-[rgba(16,185,129,0.28)]', border: 'border-l-[#10B981]', icon: Building2, label: '企业活动' },
  maintenance: { bg: 'bg-[rgba(100,116,139,0.35)]', border: 'border-l-[#64748B]', icon: Wrench, label: '维护中' },
  MAINTENANCE: { bg: 'bg-[rgba(100,116,139,0.35)]', border: 'border-l-[#64748B]', icon: Wrench, label: '维护中' },
}

/* ─── Helpers ─── */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function eventHeightMinutes(start: string, end: string): number {
  const diff = timeToMinutes(end) - timeToMinutes(start)
  return Math.max(diff, 30)
}

function eventTopOffset(start: string, dayStartHour: number = 9): number {
  const startMinutes = timeToMinutes(start)
  const dayStartMinutes = dayStartHour * 60
  return startMinutes - dayStartMinutes
}

/* ─── Compute stacked top positions per hour slot ─── */
function computeStackTops(events: any[], slotHeight: number, headerOffset: number, dayStartHour: number = 9) {
  const sorted = [...events].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
  const hourMap = new Map<number, number>()
  const result = new Map<string, number>()
  for (const e of sorted) {
    const hour = parseInt(e.startTime.split(':')[0])
    const idx = hourMap.get(hour) || 0
    const hourTop = ((hour - dayStartHour) * slotHeight) + headerOffset
    result.set(e.id, hourTop + idx * 76) // 72px height + 4px gap
    hourMap.set(hour, idx + 1)
  }
  return result
}

/* ─── Compute side-by-side layout for overlapping events ─── */
function computeEventLayout(events: any[]) {
  if (events.length === 0) return new Map<string, { col: number; total: number }>()

  const sorted = [...events].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  )

  const n = sorted.length
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    const s1 = timeToMinutes(sorted[i].startTime)
    const e1 = timeToMinutes(sorted[i].endTime)
    for (let j = i + 1; j < n; j++) {
      const s2 = timeToMinutes(sorted[j].startTime)
      const e2 = timeToMinutes(sorted[j].endTime)
      if (s1 < e2 && e1 > s2) {
        adj[i].push(j)
        adj[j].push(i)
      }
    }
  }

  const visited = new Set<number>()
  const components: number[][] = []
  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue
    const comp: number[] = []
    const queue = [i]
    visited.add(i)
    while (queue.length) {
      const idx = queue.shift()!
      comp.push(idx)
      for (const neighbor of adj[idx]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    components.push(comp)
  }

  const result = new Map<string, { col: number; total: number }>()

  for (const comp of components) {
    const compEvents = comp.map((i) => sorted[i])

    let maxConcurrent = 1
    const checkPoints = new Set<number>()
    for (const e of compEvents) checkPoints.add(timeToMinutes(e.startTime))
    for (const t of checkPoints) {
      const count = compEvents.filter((e) => {
        const s = timeToMinutes(e.startTime)
        const e_ = timeToMinutes(e.endTime)
        return s <= t && e_ > t
      }).length
      maxConcurrent = Math.max(maxConcurrent, count)
    }

    const assigned: { end: number; col: number }[] = []
    for (const idx of comp.sort(
      (a, b) => timeToMinutes(sorted[a].startTime) - timeToMinutes(sorted[b].startTime)
    )) {
      const event = sorted[idx]
      const s = timeToMinutes(event.startTime)
      const e_ = timeToMinutes(event.endTime)
      const active = assigned.filter((a) => a.end > s)
      const used = new Set(active.map((a) => a.col))
      let col = 0
      while (used.has(col)) col++
      assigned.push({ end: e_, col })
      result.set(event.id, { col, total: maxConcurrent })
    }
  }

  return result
}

export default function Booking() {
  const [view, setView] = useState<ViewType>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedVenue, setSelectedVenue] = useState('all')

  /* ─── Fetch venues ─── */
  const { data: venueData } = useQuery({
    queryKey: ['venues', 'booking'],
    queryFn: () => getVenues(),
  })
  const venues = venueData?.data || []

  /* ─── Dynamic time axis based on venue business hours ─── */
  const { hourSlots, dayStartHour, dayEndHour, slotHeight, totalHeight } = useMemo(() => {
    let openH = 9
    let closeH = 22
    if (selectedVenue !== 'all') {
      const v = venues.find((v: Venue) => v.id === selectedVenue)
      if (v) {
        const parsed = parseVenueHours(v)
        openH = parsed.openH
        closeH = parsed.closeH
      }
    } else if (venues.length > 0) {
      const allOpen = venues.map((v: Venue) => parseVenueHours(v).openH)
      const allClose = venues.map((v: Venue) => parseVenueHours(v).closeH)
      openH = Math.min(...allOpen)
      closeH = Math.max(...allClose)
    }
    const slots = buildHourSlots(openH, closeH)
    const slotHeight = 80
    return { hourSlots: slots, dayStartHour: openH, dayEndHour: closeH, slotHeight, totalHeight: slots.length * slotHeight }
  }, [venues, selectedVenue])

  /* ─── Date range for bookings ─── */
  const dateRange = useMemo(() => {
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    if (view === 'day') {
      const d = format(currentDate, 'yyyy-MM-dd')
      return { startDate: d, endDate: d }
    }
    if (view === 'week') {
      return {
        startDate: fmt(startOfWeek(currentDate, { weekStartsOn: 1 })),
        endDate: fmt(endOfWeek(currentDate, { weekStartsOn: 1 })),
      }
    }
    return {
      startDate: fmt(startOfMonth(currentDate)),
      endDate: fmt(endOfMonth(currentDate)),
    }
  }, [view, currentDate])

  /* ─── Fetch bookings ─── */
  const { data: bookingData } = useQuery({
    queryKey: ['bookings', 'calendar', dateRange.startDate, dateRange.endDate],
    queryFn: () => getBookings({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      pageSize: 500,
    }),
  })
  const allEvents = (bookingData?.data || []).filter((b: Booking) => b.status !== 'CANCELLED')

  /* ─── Fetch games ─── */
  const { data: gamesData } = useQuery({
    queryKey: ['games', 'booking-modal'],
    queryFn: () => getGames({ status: 'ACTIVE' }),
  })
  const games = gamesData || []

  /* Modal states */
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [, setModalVenue] = useState('')
  const [modalTime, setModalTime] = useState('')
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [bookingForm, setBookingForm] = useState({
    type: 'team' as 'team' | 'individual' | 'corporate',
    venue: venues[0]?.id || '',
    gameId: '',
    person: '',
    phone: '',
    count: 1,
    note: '',
  })
  const [createError, setCreateError] = useState<string | null>(null)
  const [matchedUser, setMatchedUser] = useState<User | null>(null)
  const [useBalancePay, setUseBalancePay] = useState(false)
  const [isSearchingUser, setIsSearchingUser] = useState(false)
  const [slotStatus, setSlotStatus] = useState<{ status: string; currentCount: number; remainingCount: number; maxCount: number } | null>(null)

  /* ─── Member levels config (for discount) ─── */
  const { data: systemConfigs } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: () => getSystemConfigs(),
    staleTime: 60000,
  })
  const memberLevels = useMemo(() => buildMemberLevelsFromConfig(systemConfigs), [systemConfigs])

  /* ─── Real balance & discount ─── */
  const realBalance = useMemo(() => {
    if (!matchedUser) return 0
    return (matchedUser.principalBalance || 0) + (matchedUser.bonusBalance || 0)
  }, [matchedUser])

  const discountRate = useMemo(() => {
    if (!matchedUser || memberLevels.length === 0) return 100
    const level = memberLevels.find((l) => l.key === matchedUser.level || l.name === matchedUser.level)
    return level?.discount ?? 100
  }, [matchedUser, memberLevels])

  /* ─── Check slot conflict (拼场逻辑) ─── */
  useEffect(() => {
    if (!showModal || !bookingForm.venue || !bookingForm.gameId || !modalTime) {
      setSlotStatus(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await checkConflict({
          venueId: bookingForm.venue,
          date: bookingDate,
          startTime: modalTime,
          endTime: addMinutes(modalTime, selectedGame?.duration || 30),
          gameId: bookingForm.gameId,
        })
        setSlotStatus(res)
        // 自动调整人数不超过剩余可拼人数
        if (res.remainingCount > 0 && bookingForm.count > res.remainingCount) {
          setBookingForm((prev) => ({ ...prev, count: res.remainingCount }))
        }
      } catch {
        setSlotStatus(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [showModal, bookingForm.venue, bookingForm.gameId, bookingDate, modalTime])

  /* ─── Search member by phone ─── */
  useEffect(() => {
    const phone = bookingForm.phone.trim()
    if (!phone || phone.length < 7) {
      setMatchedUser(null)
      setUseBalancePay(false)
      return
    }
    const timer = setTimeout(async () => {
      setIsSearchingUser(true)
      try {
        const res = await getUsers({ search: phone, pageSize: 5 })
        const users = res.data || []
        // 精确匹配手机号
        const exactMatch = users.find((u: User) => u.phone === phone)
        setMatchedUser(exactMatch || null)
        if (!exactMatch) setUseBalancePay(false)
      } catch {
        setMatchedUser(null)
      } finally {
        setIsSearchingUser(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [bookingForm.phone])

  /* Ensure modalTime is valid when modal opens or date/venue changes */
  useEffect(() => {
    if (showModal) {
      const venue = venues.find((v: Venue) => v.id === bookingForm.venue)
      const vHours = parseVenueHours(venue)
      const vSlots = buildHourSlots(vHours.openH, vHours.closeH)
      const firstAvailable = vSlots.find((t) => !isSlotPast(t, bookingDate))
      const isInRange = modalTime ? vSlots.includes(modalTime) : false
      if (firstAvailable && (!modalTime || isSlotPast(modalTime, bookingDate) || !isInRange)) {
        setModalTime(firstAvailable)
      }
    }
  }, [showModal, bookingDate, bookingForm.venue, venues])

  const createMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['revenue'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['venues'], exact: false })
      setCreateError(null)
    },
  })

  /* ─── Date navigation ─── */
  const goToday = () => setCurrentDate(new Date())
  const goPrev = useCallback(() => {
    if (view === 'day') setCurrentDate((d) => addDays(d, -1))
    else if (view === 'week') setCurrentDate((d) => subWeeks(d, 1))
    else setCurrentDate((d) => subMonths(d, 1))
  }, [view])

  const goNext = useCallback(() => {
    if (view === 'day') setCurrentDate((d) => addDays(d, 1))
    else if (view === 'week') setCurrentDate((d) => addWeeks(d, 1))
    else setCurrentDate((d) => addMonths(d, 1))
  }, [view])

  /* ─── Date display ─── */
  const dateDisplay = useMemo(() => {
    if (view === 'day') {
      return format(currentDate, 'yyyy年M月d日', { locale: zhCN })
    }
    if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 })
      const end = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(start, 'yyyy年M月d日', { locale: zhCN })} - ${format(end, 'M月d日', { locale: zhCN })}`
    }
    return format(currentDate, 'yyyy年M月', { locale: zhCN })
  }, [currentDate, view])

  /* ─── Week days for week view ─── */
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [currentDate])

  /* ─── Month grid days ─── */
  const monthDays = useMemo(() => {
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)
    const startDay = startOfWeek(start, { weekStartsOn: 1 })
    const days: Date[] = []
    let day = startDay
    while (day <= endOfWeek(end, { weekStartsOn: 1 })) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentDate])

  /* ─── Filtered events ─── */
  const filteredEvents = useMemo(() => {
    if (selectedVenue === 'all') return allEvents
    return allEvents.filter((e) => e.venueId === selectedVenue)
  }, [selectedVenue, allEvents])

  /* ─── Check if a time is within venue maintenance window ─── */
  function isInMaintenanceWindow(venue: Venue | undefined, dateStr: string, timeStr: string, duration = 30): boolean {
    if (!venue || venue.status !== 'MAINTENANCE') return false
    if (!venue.maintenanceStartDate || !venue.maintenanceEndDate || !venue.maintenanceStartTime || !venue.maintenanceEndTime) return false
    const startDate = venue.maintenanceStartDate.slice(0, 10)
    const endDate = venue.maintenanceEndDate.slice(0, 10)
    if (dateStr < startDate || dateStr > endDate) return false
    const s1 = timeToMinutes(timeStr)
    const e1 = s1 + duration
    const ms1 = timeToMinutes(venue.maintenanceStartTime)
    const me1 = timeToMinutes(venue.maintenanceEndTime)
    return s1 < me1 && e1 > ms1
  }

  /* ─── Modal handlers ─── */
  const openNewBooking = (venueId?: string, time?: string) => {
    const defaultVenueId = venueId || venues[0]?.id || ''
    const venue = venues.find((v) => v.id === defaultVenueId)
    const status = (venue?.status || '').toLowerCase()

    if (status === 'disabled') {
      alert('该场地已暂停营业，暂不可预约')
      return
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const currentDateStr = format(currentDate, 'yyyy-MM-dd')
    if (currentDateStr < todayStr) {
      return
    }

    const targetTime = time || '09:00'
    if (isInMaintenanceWindow(venue, currentDateStr, targetTime)) {
      alert(`该场地 ${venue?.maintenanceStartTime} - ${venue?.maintenanceEndTime} 正在维护中，该时段不可预约`)
      return
    }

    setModalVenue(defaultVenueId)
    setCreateError(null)
    // pick first non-past slot for today based on venue business hours
    const nowStr = getCurrentTimeString()
    const vHours = parseVenueHours(venue)
    const vSlots = buildHourSlots(vHours.openH, vHours.closeH)
    const defaultTime = time || vSlots.find((s) => s > nowStr) || `${String(vHours.openH).padStart(2, '0')}:00`
    setModalTime(defaultTime)
    setBookingForm({
      type: 'team',
      venue: defaultVenueId,
      gameId: '',
      person: '',
      phone: '',
      count: 1,
      note: '',
    })
    setMatchedUser(null)
    setUseBalancePay(false)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setModalVenue('')
    setModalTime('')
    setCreateError(null)
    setMatchedUser(null)
    setUseBalancePay(false)
  }

  /* ─── Stats ─── */
  const selectedGame = useMemo(() => games.find((g: Game) => g.id === bookingForm.gameId), [games, bookingForm.gameId])
  const estimatedAmount = useMemo(() => {
    if (!selectedGame) return '0'
    const raw = Math.round(selectedGame.price * bookingForm.count * discountRate / 100)
    return (raw / 100).toLocaleString()
  }, [selectedGame, bookingForm.count, discountRate])

  const estimatedAmountRaw = useMemo(() => {
    if (!selectedGame) return 0
    return Math.round(selectedGame.price * bookingForm.count * discountRate / 100)
  }, [selectedGame, bookingForm.count, discountRate])

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const todayEvents = allEvents.filter((e) => getEventDateStr(e.date) === todayStr && e.status !== 'NO_SHOW')
    return {
      total: todayEvents.length,
      team: todayEvents.filter((e) => e.type === 'TEAM' || e.type === 'team').length,
      individual: todayEvents.filter((e) => e.type === 'INDIVIDUAL' || e.type === 'individual').length,
      corporate: todayEvents.filter((e) => e.type === 'CORPORATE' || e.type === 'corporate').length,
      maintenance: todayEvents.filter((e) => e.type === 'MAINTENANCE' || e.type === 'maintenance').length,
    }
  }, [allEvents])

  return (
    <Layout breadcrumb={['预约排场']}>
      {/* ═══ Top action bar ═══ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOut }}
        className="flex items-center justify-between mb-4"
      >
        {/* Title */}
        <div>
          <h1 className="text-vr-h1 text-vrtext-primary font-semibold">预约排场</h1>
          <p className="text-vr-body-sm text-vrtext-tertiary mt-0.5">
            实时预约、时段管理、冲突检测
          </p>
        </div>

        {/* View toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex items-center bg-vrbg-elevated rounded-lg p-[3px]"
        >
          {(['day', 'week', 'month'] as ViewType[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-5 py-1.5 rounded-md text-vr-caption font-medium transition-all duration-150',
                view === v
                  ? 'bg-vrbg-card text-vr-blue shadow-sm'
                  : 'text-vrtext-secondary hover:text-vrtext-primary'
              )}
            >
              {v === 'day' ? '日' : v === 'week' ? '周' : '月'}
            </button>
          ))}
        </motion.div>

        {/* New booking button */}
        {(() => {
          const todayStr = format(new Date(), 'yyyy-MM-dd')
          const currentDateStr = format(currentDate, 'yyyy-MM-dd')
          const isPastDate = currentDateStr < todayStr
          return (
            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15, ease: easeOut }}
              whileHover={isPastDate ? undefined : { y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
              whileTap={isPastDate ? undefined : { scale: 0.97 }}
              onClick={() => !isPastDate && openNewBooking()}
              disabled={isPastDate}
              className={cn(
                'flex items-center gap-2 h-10 px-5 text-white text-vr-body-sm font-medium rounded-lg transition-colors',
                isPastDate
                  ? 'bg-vrtext-muted/30 text-vrtext-muted cursor-not-allowed'
                  : 'bg-vraccent-primary hover:bg-vraccent-primary-hover'
              )}
            >
              <Plus className="w-4 h-4" />
              新建预约
            </motion.button>
          )
        })()}
      </motion.div>

      {/* ═══ Calendar navigation bar ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex items-center justify-between h-12 px-5 bg-vrbg-card rounded-t-xl border-b border-vrborder-DEFAULT"
      >
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-hover transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <AnimatePresence mode="wait">
            <motion.span
              key={dateDisplay}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="text-vr-body text-vrtext-primary font-medium min-w-[200px] text-center"
            >
              {dateDisplay}
            </motion.span>
          </AnimatePresence>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-hover transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Today + Venue filter */}
        <div className="flex items-center gap-3">
          <button
            onClick={goToday}
            className="h-8 px-3.5 border border-vrborder-DEFAULT rounded-md text-vr-caption text-vrtext-secondary hover:bg-vrbg-hover transition-colors"
          >
            今天
          </button>
          <select
            value={selectedVenue}
            onChange={(e) => setSelectedVenue(e.target.value)}
            className="h-8 px-3 bg-vrbg-elevated border border-vrborder-DEFAULT rounded-md text-vr-body-sm text-vrtext-primary focus:outline-none cursor-pointer"
          >
            <option value="all">全部场地</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* Maintenance notice */}
      {(() => {
        const dateStr = format(currentDate, 'yyyy-MM-dd')
        const targetVenues = selectedVenue === 'all'
          ? venues
          : venues.filter((v) => v.id === selectedVenue)
        const maintVenues = targetVenues.filter((v) => {
          if (v.status !== 'MAINTENANCE') return false
          if (!v.maintenanceStartDate || !v.maintenanceEndDate || !v.maintenanceStartTime || !v.maintenanceEndTime) return false
          const start = v.maintenanceStartDate.slice(0, 10)
          const end = v.maintenanceEndDate.slice(0, 10)
          if (dateStr < start || dateStr > end) return false
          // 过去的日期不显示维护提醒
          const todayStr = format(new Date(), 'yyyy-MM-dd')
          if (dateStr < todayStr) return false
          // 今天如果已过维护结束时间也不显示
          if (dateStr === todayStr) {
            const now = new Date()
            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
            if (timeToMinutes(currentTimeStr) >= timeToMinutes(v.maintenanceEndTime)) return false
          }
          return true
        })
        if (maintVenues.length === 0) return null
        return (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-5 mt-3 mb-1 px-4 py-2.5 bg-vrwarning/10 border border-vrwarning/20 rounded-lg flex items-center gap-2"
          >
            <Wrench className="w-4 h-4 text-vrwarning shrink-0" />
            <span className="text-vr-body-sm text-vrwarning">
              {maintVenues.map((v) => `${v.name} 维护中 ${v.maintenanceStartTime}-${v.maintenanceEndTime}`).join('、')}
            </span>
          </motion.div>
        )
      })()}

      {/* ═══ Day View ═══ */}
      <AnimatePresence mode="wait">
        {view === 'day' && (
          <motion.div
            key="day-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-vrbg-card rounded-b-xl border border-t-0 border-vrborder-DEFAULT overflow-hidden"
          >
            <div className="flex overflow-x-auto">
              {/* Time axis */}
              <div className="w-[60px] shrink-0 border-r border-vrborder-DEFAULT" style={{ height: totalHeight }}>
                {hourSlots.map((slot) => (
                  <div
                    key={slot}
                    className={cn(
                      'flex items-start justify-end pr-2 text-vr-caption',
                      slot.endsWith(':00') || slot.endsWith(':30')
                        ? 'text-vrtext-tertiary'
                        : 'text-vrtext-tertiary/30'
                    )}
                    style={{ height: slotHeight }}
                  >
                    {slot.endsWith(':00') || slot.endsWith(':30') ? slot : ''}
                  </div>
                ))}
              </div>

              {/* Venue columns */}
              {venues
                .filter((v) => selectedVenue === 'all' || v.id === selectedVenue)
                .map((venue) => (
                  <div
                    key={venue.id}
                    className="flex-1 min-w-[200px] border-r border-vrborder-DEFAULT relative"
                    style={{ height: totalHeight }}
                  >
                    {/* Column header */}
                    <div className="sticky top-0 z-10 bg-vrbg-card border-b border-vrborder-DEFAULT py-2 text-center">
                      <p className="text-vr-body-sm text-vrtext-primary font-medium">{venue.name}</p>
                    </div>

                    {/* Time grid lines with quarter-hour ticks */}
                    {hourSlots.map((slot) => (
                      <div key={slot} className="relative" style={{ height: slotHeight }}>
                        <div className={cn(
                          'absolute bottom-0 left-0 right-0',
                          slot.endsWith(':00') || slot.endsWith(':30')
                            ? 'border-b border-vrborder-DEFAULT/40'
                            : 'border-b border-vrborder-DEFAULT/15'
                        )} />
                      </div>
                    ))}

                    {/* Event blocks */}
                    {(() => {
                      const venueEvents = filteredEvents.filter((e) => e.venueId === venue.id)
                      const layout = computeEventLayout(venueEvents)
                      const stackTops = computeStackTops(venueEvents, slotHeight, slotHeight, dayStartHour)
                      return venueEvents.map((event, idx) => {
                        const cfg = eventTypeConfig[event.type]
                        const EventIcon = cfg.icon
                        const lo = layout.get(event.id)
                        const col = lo?.col ?? 0
                        const total = lo?.total ?? 1
                        const gapPx = 2
                        const marginPx = 4
                        const leftStyle =
                          total === 1
                            ? `${marginPx}px`
                            : `calc(${marginPx}px + ${col} * ((100% - ${marginPx * 2 - gapPx}px) / ${total}))`
                        const widthStyle =
                          total === 1
                            ? `calc(100% - ${marginPx * 2}px)`
                            : `calc((100% - ${marginPx * 2 - gapPx}px) / ${total} - ${gapPx}px)`
                        return (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, scaleY: 0 }}
                            animate={{ opacity: 1, scaleY: 1 }}
                            transition={{ duration: 0.35, delay: idx * 0.08, ease: easeOut }}
                            style={{
                              top: stackTops.get(event.id) ?? 0,
                              height: 72,
                              left: leftStyle,
                              width: widthStyle,
                            }}
                            className={cn(
                              'group absolute rounded-md px-1.5 py-1 cursor-pointer overflow-hidden',
                              event.status === 'NO_SHOW'
                                ? 'bg-gray-500/10 border border-gray-400/40 border-dashed'
                                : cn(
                                    'border-l-[3px]',
                                    event.status === 'PLAYING' ? 'bg-emerald-500/20 border-l-emerald-500' :
                                    event.status === 'CHECKED_IN' ? 'bg-amber-500/20 border-l-amber-500' :
                                    cfg.bg,
                                    event.status === 'PLAYING' || event.status === 'CHECKED_IN' ? '' : cfg.border,
                                  ),
                              'hover:overflow-visible hover:z-[30] hover:shadow-vr-xl hover:ring-2 hover:ring-white/20 transition-all duration-150 z-20'
                            )}
                          >
                            <div className={cn("flex items-center gap-1", event.status === 'NO_SHOW' ? 'text-gray-600' : 'text-white')}>
                              <EventIcon className="w-3 h-3 shrink-0" />
                              <span className="text-vr-caption font-medium truncate">
                                {cfg.label}
                              </span>
                            </div>
                            <div className={cn("text-vr-caption mt-0.5 truncate", event.status === 'NO_SHOW' ? 'text-gray-500' : 'text-white/80')}>
                              {event.startTime}-{event.endTime}
                            </div>
                            <div className={cn("text-vr-caption mt-0.5 truncate", event.status === 'NO_SHOW' ? 'text-gray-400' : 'text-white/70')}>
                              {event.game?.title || 'VR体验'} · {event.personCount || 1}人
                            </div>
                            {/* Hover tooltip */}
                            <div className="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-[40] flex-col px-5 py-4 rounded-2xl bg-slate-800/95 backdrop-blur-sm border border-slate-500 shadow-2xl min-w-[180px]">
                              <div className="flex items-center gap-2 text-white">
                                <EventIcon className="w-5 h-5 shrink-0" />
                                <span className="text-vr-body font-semibold">{cfg.label}</span>
                              </div>
                              <div className="text-vr-body-sm text-slate-300 mt-2">
                                {event.startTime} - {event.endTime}
                              </div>
                              {event.personName && (
                                <div className="text-vr-caption text-slate-400 mt-1">{event.personName}</div>
                              )}
                              <div className="text-vr-caption text-slate-400 mt-1">
                                {event.game?.title || 'VR体验'} · {event.personCount || 1}人
                              </div>
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-800/95 border-r border-b border-slate-500 rotate-45" />
                            </div>
                          </motion.div>
                        )
                      })
                    })()}

                    {/* Click to add overlay on empty areas */}
                    {(() => {
                      const todayStr = format(new Date(), 'yyyy-MM-dd')
                      const currentDateStr = format(currentDate, 'yyyy-MM-dd')
                      const isPastDate = currentDateStr < todayStr
                      if (isPastDate) return null
                      return (
                        <div
                          className="absolute inset-0 z-10 opacity-0 hover:opacity-100 transition-opacity bg-white/5 cursor-pointer flex items-center justify-center"
                          onClick={() => openNewBooking(venue.id, '09:00')}
                          style={{ top: slotHeight }}
                        >
                          <span className="text-vr-caption text-vrtext-secondary flex items-center gap-1">
                            <Plus className="w-3 h-3" />
                            点击新建
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                ))}
            </div>
          </motion.div>
        )}

        {/* ═══ Week View ═══ */}
        {view === 'week' && (
          <motion.div
            key="week-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-vrbg-card rounded-b-xl border border-t-0 border-vrborder-DEFAULT overflow-hidden"
          >
            <div className="flex overflow-x-auto">
              {/* Time axis */}
              <div className="w-[60px] shrink-0 border-r border-vrborder-DEFAULT" style={{ height: totalHeight }}>
                {hourSlots.map((slot) => (
                  <div
                    key={slot}
                    className={cn(
                      'flex items-start justify-end pr-2 text-vr-caption',
                      slot.endsWith(':00') || slot.endsWith(':30')
                        ? 'text-vrtext-tertiary'
                        : 'text-vrtext-tertiary/30'
                    )}
                    style={{ height: slotHeight }}
                  >
                    {slot.endsWith(':00') || slot.endsWith(':30') ? slot : ''}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'flex-1 min-w-[160px] border-r border-vrborder-DEFAULT relative',
                    isToday(day) && 'bg-[rgba(59,130,246,0.04)]'
                  )}
                  style={{ height: totalHeight }}
                >
                  {/* Column header */}
                  <div
                    className="sticky top-0 z-10 bg-vrbg-card border-b border-vrborder-DEFAULT py-2 text-center cursor-pointer hover:bg-vrbg-hover transition-colors"
                    onClick={() => { setCurrentDate(day); setView('day') }}
                  >
                    <p className={cn(
                      'text-vr-body-sm font-medium',
                      isToday(day) ? 'text-vr-blue' : 'text-vrtext-primary'
                    )}>
                      {format(day, 'EEE M/d', { locale: zhCN })}
                    </p>
                  </div>

                  {/* Grid lines with quarter-hour ticks */}
                  {hourSlots.map((slot) => (
                    <div key={slot} className="relative" style={{ height: slotHeight }}>
                      <div className={cn(
                        'absolute bottom-0 left-0 right-0',
                        slot.endsWith(':00') || slot.endsWith(':30')
                          ? 'border-b border-vrborder-DEFAULT/40'
                          : 'border-b border-vrborder-DEFAULT/15'
                      )} />
                    </div>
                  ))}

                  {/* Events for the week view */}
                  {(() => {
                    const dayEvents = filteredEvents.filter(
                      (e) => getEventDateStr(e.date) === format(day, 'yyyy-MM-dd')
                    )
                    if (selectedVenue !== 'all') {
                      const venueEvents = dayEvents.filter((e) => e.venueId === selectedVenue)
                      const layout = computeEventLayout(venueEvents)
                      const stackTops = computeStackTops(venueEvents, slotHeight, slotHeight, dayStartHour)
                      return dayEvents
                        .filter((e) => e.venueId === selectedVenue)
                        .map((event, idx) => {
                          const cfg = eventTypeConfig[event.type]
                          const EventIcon = cfg.icon
                          const lo = layout.get(event.id)
                          const subCol = lo?.col ?? 0
                          const subTotal = lo?.total ?? 1
                          const colWidth = 100 / subTotal
                          const left = subCol * colWidth
                          return (
                            <motion.div
                              key={event.id}
                              initial={{ opacity: 0, scaleY: 0 }}
                              animate={{ opacity: 1, scaleY: 1 }}
                              transition={{ duration: 0.35, delay: idx * 0.04 }}
                              style={{
                                top: stackTops.get(event.id) ?? 0,
                                height: 72,
                                left: `${left}%`,
                                width: `${colWidth}%`,
                              }}
                              className={cn(
                                'group absolute rounded-md px-1.5 py-1 cursor-pointer overflow-hidden',
                                event.status === 'NO_SHOW'
                                  ? 'bg-gray-500/10 border border-gray-400/40 border-dashed'
                                  : cn(
                                      'border-l-[3px]',
                                      event.status === 'PLAYING' ? 'bg-emerald-500/20 border-l-emerald-500' :
                                      event.status === 'CHECKED_IN' ? 'bg-amber-500/20 border-l-amber-500' :
                                      cfg.bg,
                                      event.status === 'PLAYING' || event.status === 'CHECKED_IN' ? '' : cfg.border,
                                    ),
                                'hover:overflow-visible hover:z-[30] hover:shadow-vr-xl hover:ring-2 hover:ring-white/20 transition-all duration-150 z-20'
                              )}
                            >
                              <div className={cn("flex items-center gap-1", event.status === 'NO_SHOW' ? 'text-gray-600' : 'text-white')}>
                                <EventIcon className="w-3 h-3 shrink-0" />
                                <span className="text-vr-caption font-medium truncate">
                                  {cfg.label}
                                </span>
                              </div>
                              <div className={cn("text-vr-caption truncate", event.status === 'NO_SHOW' ? 'text-gray-500' : 'text-white/70')}>
                                {event.startTime}-{event.endTime}
                              </div>
                              <div className={cn("text-vr-caption truncate", event.status === 'NO_SHOW' ? 'text-gray-400' : 'text-white/70')}>
                                {event.game?.title || 'VR体验'} · {event.personCount || 1}人
                              </div>
                              {/* Hover tooltip */}
                              <div className="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-[40] flex-col px-5 py-4 rounded-2xl bg-slate-800/95 backdrop-blur-sm border border-slate-500 shadow-2xl min-w-[180px]">
                                <div className="flex items-center gap-2 text-white">
                                  <EventIcon className="w-5 h-5 shrink-0" />
                                  <span className="text-vr-body font-semibold">{cfg.label}</span>
                                </div>
                                <div className="text-vr-body-sm text-slate-300 mt-2">
                                  {event.startTime} - {event.endTime}
                                </div>
                                {event.personName && (
                                  <div className="text-vr-caption text-slate-400 mt-1">{event.personName}</div>
                                )}
                                <div className="text-vr-caption text-slate-400 mt-1">
                                  {event.game?.title || 'VR体验'} · {event.personCount || 1}人
                                </div>
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-800/95 border-r border-b border-slate-500 rotate-45" />
                              </div>
                            </motion.div>
                          )
                        })
                    }
                    // all venues: group by venue and compute layout per venue
                    const venueGroups = new Map<string, any[]>()
                    for (const e of dayEvents) {
                      const list = venueGroups.get(e.venueId) || []
                      list.push(e)
                      venueGroups.set(e.venueId, list)
                    }
                    const layouts = new Map<string, ReturnType<typeof computeEventLayout>>()
                    const stackTopsMap = new Map<string, ReturnType<typeof computeStackTops>>()
                    for (const [vid, list] of venueGroups) {
                      layouts.set(vid, computeEventLayout(list))
                      stackTopsMap.set(vid, computeStackTops(list, slotHeight, slotHeight, dayStartHour))
                    }
                    return dayEvents.map((event, idx) => {
                      const cfg = eventTypeConfig[event.type]
                      const EventIcon = cfg.icon
                      const venueIdx = venues.findIndex((v) => v.id === event.venueId)
                      const baseColWidth = 100 / 4
                      const baseLeft = venueIdx * baseColWidth
                      const lo = layouts.get(event.venueId)?.get(event.id)
                      const subCol = lo?.col ?? 0
                      const subTotal = lo?.total ?? 1
                      const subWidth = baseColWidth / subTotal
                      const left = baseLeft + subCol * subWidth
                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, scaleY: 0 }}
                          animate={{ opacity: 1, scaleY: 1 }}
                          transition={{ duration: 0.35, delay: idx * 0.04 }}
                          style={{
                            top: stackTopsMap.get(event.venueId)?.get(event.id) ?? 0,
                            height: 72,
                            left: `${left}%`,
                            width: `${subWidth}%`,
                          }}
                          className={cn(
                            'group absolute rounded-md px-1.5 py-1 cursor-pointer overflow-hidden',
                            event.status === 'NO_SHOW'
                              ? 'bg-gray-500/10 border border-gray-400/40 border-dashed'
                              : cn(
                                  'border-l-[3px]',
                                  event.status === 'PLAYING' ? 'bg-emerald-500/20 border-l-emerald-500' :
                                  event.status === 'CHECKED_IN' ? 'bg-amber-500/20 border-l-amber-500' :
                                  cfg.bg,
                                  event.status === 'PLAYING' || event.status === 'CHECKED_IN' ? '' : cfg.border,
                                ),
                            'hover:overflow-visible hover:z-[30] hover:shadow-vr-xl hover:ring-2 hover:ring-white/20 transition-all duration-150 z-20'
                          )}
                        >
                          <div className={cn("flex items-center gap-1", event.status === 'NO_SHOW' ? 'text-gray-600' : 'text-white')}>
                            <EventIcon className="w-3 h-3 shrink-0" />
                            <span className="text-vr-caption font-medium truncate">
                              {cfg.label}
                            </span>
                          </div>
                          <div className={cn("text-vr-caption truncate", event.status === 'NO_SHOW' ? 'text-gray-500' : 'text-white/70')}>
                            {event.startTime}-{event.endTime}
                          </div>
                          <div className={cn("text-vr-caption truncate", event.status === 'NO_SHOW' ? 'text-gray-400' : 'text-white/70')}>
                            {event.game?.title || 'VR体验'} · {event.personCount || 1}人
                          </div>
                          {/* Hover tooltip */}
                          <div className="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-[40] flex-col px-5 py-4 rounded-2xl bg-slate-800/95 backdrop-blur-sm border border-slate-500 shadow-2xl min-w-[180px]">
                            <div className="flex items-center gap-2 text-white">
                              <EventIcon className="w-5 h-5 shrink-0" />
                              <span className="text-vr-body font-semibold">{cfg.label}</span>
                            </div>
                            <div className="text-vr-body-sm text-slate-300 mt-2">
                              {event.startTime} - {event.endTime}
                            </div>
                            {event.personName && (
                              <div className="text-vr-caption text-slate-400 mt-1">{event.personName}</div>
                            )}
                            <div className="text-vr-caption text-slate-400 mt-1">
                              {event.game?.title || 'VR体验'} · {event.personCount || 1}人
                            </div>
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-800/95 border-r border-b border-slate-500 rotate-45" />
                          </div>
                        </motion.div>
                      )
                    })
                  })()}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══ Month View ═══ */}
        {view === 'month' && (
          <motion.div
            key="month-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-vrbg-card rounded-b-xl border border-t-0 border-vrborder-DEFAULT overflow-hidden p-4"
          >
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((d) => (
                <div key={d} className="text-center text-vr-caption text-vrtext-secondary font-medium py-2">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <motion.div
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.02 },
                },
              }}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-7"
            >
              {monthDays.map((day) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth()
                const dayStr = format(day, 'yyyy-MM-dd')
                const dayEvents = filteredEvents.filter((e) => getEventDateStr(e.date) === dayStr)
                return (
                  <motion.div
                    key={day.toISOString()}
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1, transition: { duration: 0.2 } },
                    }}
                    className={cn(
                      'min-h-[100px] border border-vrborder-DEFAULT/40 p-1.5 cursor-pointer hover:bg-vrbg-hover/30 transition-colors',
                      !isCurrentMonth && 'opacity-50 bg-vrbg-base/30',
                      isToday(day) && 'bg-[rgba(59,130,246,0.06)]'
                    )}
                    onClick={() => { setCurrentDate(day); setView('day') }}
                  >
                    {/* Date number */}
                    <div className="flex justify-center mb-1">
                      <span
                        className={cn(
                          'w-6 h-6 flex items-center justify-center rounded-full text-vr-caption',
                          isToday(day)
                            ? 'bg-vr-blue text-white'
                            : isCurrentMonth
                              ? 'text-vrtext-primary'
                              : 'text-vrtext-muted'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>

                    {/* Events for today */}
                    {dayEvents.slice(0, 3).map((event) => {
                      const cfg = eventTypeConfig[event.type]
                      return (
                        <div
                          key={event.id}
                          className={cn(
                            'group relative flex items-center gap-1 px-1.5 py-0.5 rounded-sm mb-0.5 cursor-pointer hover:opacity-80 transition-opacity',
                            event.status === 'NO_SHOW' ? 'bg-gray-500/10 border border-gray-400/30 border-dashed' :
                            event.status === 'PLAYING' ? 'bg-emerald-500/20' :
                            event.status === 'CHECKED_IN' ? 'bg-amber-500/20' :
                            cfg.bg
                          )}
                        >
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor:
                              event.status === 'PLAYING' ? '#10B981' :
                              event.status === 'CHECKED_IN' ? '#F59E0B' :
                              cfg.border.replace('border-l-', '')
                            }}
                          />
                          <span className="text-vr-caption text-white truncate">
                            {event.startTime} {cfg.label.slice(0, 2)}
                          </span>
                          {/* Hover tooltip */}
                          <div className="hidden group-hover:flex absolute bottom-full left-0 mb-3 z-[40] flex-col px-4 py-3 rounded-xl bg-slate-800/95 backdrop-blur-sm border border-slate-500 shadow-2xl min-w-max">
                            <span className="text-vr-body-sm text-slate-200 whitespace-nowrap">
                              {event.startTime} {cfg.label} {event.personName ? `- ${event.personName}` : ''} · {event.game?.title || 'VR体验'} · {event.personCount || 1}人
                            </span>
                            <div className="absolute -bottom-2 left-3 w-4 h-4 bg-slate-800/95 border-r border-b border-slate-500 rotate-45" />
                          </div>
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-vr-caption text-vr-blue pl-1 cursor-pointer">
                        +{dayEvents.length - 3} 更多
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Bottom stats bar ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="flex items-center gap-8 mt-4 px-4"
      >
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-vrtext-tertiary" />
          <span className="text-vr-caption text-vrtext-tertiary">今日排场</span>
          <span className="text-vr-body text-vrtext-primary font-semibold">{stats.total}场</span>
        </div>
        <div className="w-px h-4 bg-vrborder-DEFAULT" />
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-vr-blue" />
          <span className="text-vr-caption text-vrtext-tertiary">团队预约</span>
          <span className="text-vr-body text-vrtext-primary font-semibold">{stats.team}场</span>
        </div>
        <div className="w-px h-4 bg-vrborder-DEFAULT" />
        <div className="flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-vr-purple" />
          <span className="text-vr-caption text-vrtext-tertiary">散客预约</span>
          <span className="text-vr-body text-vrtext-primary font-semibold">{stats.individual}场</span>
        </div>
        <div className="w-px h-4 bg-vrborder-DEFAULT" />
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-vr-green" />
          <span className="text-vr-caption text-vrtext-tertiary">企业活动</span>
          <span className="text-vr-body text-vrtext-primary font-semibold">{stats.corporate}场</span>
        </div>
        <div className="w-px h-4 bg-vrborder-DEFAULT" />
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-vrtext-tertiary" />
          <span className="text-vr-caption text-vrtext-tertiary">维护中</span>
          <span className="text-vr-body text-vrtext-primary font-semibold">{stats.maintenance}场</span>
        </div>
      </motion.div>

      {/* ═══ New Booking Modal ═══ */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="relative w-[560px] max-h-[90vh] bg-vrbg-elevated rounded-2xl shadow-vr-xl border border-vrborder-DEFAULT overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-vrborder-DEFAULT">
                <h3 className="text-vr-h3 text-vrtext-primary font-medium">新建预约</h3>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-hover transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                {/* Booking type */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-2">
                    预约类型 <span className="text-vr-red">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    {([
                      { key: 'team', label: '团队预约' },
                      { key: 'individual', label: '散客预约' },
                      { key: 'corporate', label: '企业活动' },
                    ] as const).map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="bookingType"
                          value={opt.key}
                          checked={bookingForm.type === opt.key}
                          onChange={(e) =>
                            setBookingForm((prev) => ({ ...prev, type: e.target.value as typeof prev.type }))
                          }
                          className="w-4 h-4 accent-vr-blue cursor-pointer"
                        />
                        <span
                          className={cn(
                            'text-vr-body-sm',
                            bookingForm.type === opt.key ? 'text-vrtext-primary' : 'text-vrtext-secondary'
                          )}
                        >
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </motion.div>

                {/* Venue + Date */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      场地 <span className="text-vr-red">*</span>
                    </label>
                    <select
                      value={bookingForm.venue}
                      onChange={(e) =>
                        setBookingForm((prev) => ({ ...prev, venue: e.target.value }))
                      }
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue cursor-pointer"
                    >
                      {venues.map((v) => {
                        const maintLabel = v.status === 'MAINTENANCE' && v.maintenanceStartTime && v.maintenanceEndTime
                          ? ` [维护 ${v.maintenanceStartTime}-${v.maintenanceEndTime}]`
                          : ''
                        return (
                          <option key={v.id} value={v.id}>{v.name} ({v.theme}){maintLabel}</option>
                        )
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      日期 <span className="text-vr-red">*</span>
                    </label>
                    <input
                      type="date"
                      min={format(new Date(), 'yyyy-MM-dd')}
                      value={bookingDate}
                      onChange={(e) => {
                        const newDate = e.target.value
                        setBookingDate(newDate)
                        if (isSlotPast(modalTime, newDate)) {
                          const venue = venues.find((v: Venue) => v.id === bookingForm.venue)
                          const vHours = parseVenueHours(venue)
                          const vSlots = buildHourSlots(vHours.openH, vHours.closeH)
                          const firstAvailable = vSlots.find((t) => !isSlotPast(t, newDate))
                          if (firstAvailable) setModalTime(firstAvailable)
                        }
                      }}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue"
                    />
                  </div>
                </motion.div>

                {/* 选择场次 */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    选择场次 <span className="text-vr-red">*</span>
                  </label>
                  <select
                    value={modalTime}
                    onChange={(e) => setModalTime(e.target.value)}
                    className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue cursor-pointer"
                  >
                    {(() => {
                      const slotDuration = selectedGame?.duration || 30
                      const venue = venues.find((v: Venue) => v.id === bookingForm.venue)
                      const vHours = parseVenueHours(venue)
                      const slots: string[] = []
                      for (let h = vHours.openH; h <= vHours.closeH; h++) {
                        slots.push(`${String(h).padStart(2, '0')}:00`)
                        if (h < vHours.closeH) {
                          const intervalMins = slotDuration
                          for (let m = intervalMins; m < 60; m += intervalMins) {
                            slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
                          }
                        }
                      }
                      return slots
                        .filter((t) => !isSlotPast(t, bookingDate))
                        .filter((t) => {
                          const [th, tm] = t.split(':').map(Number)
                          return th * 60 + tm + slotDuration <= vHours.closeH * 60
                        })
                        .map((t) => {
                          const inMaint = isInMaintenanceWindow(
                            venues.find((v) => v.id === bookingForm.venue),
                            bookingDate,
                            t,
                            slotDuration
                          )
                          return (
                            <option key={t} value={t} disabled={inMaint}>
                              {t} - {addMinutes(t, slotDuration)} {inMaint ? ' (维护中)' : ''}
                            </option>
                          )
                        })
                    })()}
                  </select>
                </motion.div>

                {/* Game selection + Amount preview */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, duration: 0.3 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      游戏 <span className="text-vr-red">*</span>
                    </label>
                    <select
                      value={bookingForm.gameId}
                      onChange={(e) =>
                        setBookingForm((prev) => ({ ...prev, gameId: e.target.value }))
                      }
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue cursor-pointer"
                    >
                      <option value="">请选择游戏</option>
                      {games.map((g: Game) => (
                        <option key={g.id} value={g.id}>{g.title} (¥{g.price / 100}/人)</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <div className="w-full h-10 px-3 bg-vrbg-elevated/50 border border-vrborder-DEFAULT rounded-lg flex items-center justify-between">
                      <span className="text-vr-body-sm text-vrtext-secondary">预估金额</span>
                      <span className="text-vr-body-sm text-vrtext-primary font-semibold">
                        ¥{estimatedAmount}
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* Slot status hint */}
                {slotStatus && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 -mt-2"
                  >
                    {slotStatus.status === 'available' && (
                      <span className="text-xs text-vrsuccess">✓ 该时段可预约（最多 {slotStatus.maxCount} 人）</span>
                    )}
                    {slotStatus.status === 'joinable' && (
                      <span className="text-xs text-orange-500">该时段已约 {slotStatus.currentCount} 人，剩余 {slotStatus.remainingCount} 个位置</span>
                    )}
                    {slotStatus.status === 'full' && (
                      <span className="text-xs text-vrerror">✕ 该时段已排满</span>
                    )}
                    {slotStatus.status === 'occupied_by_other_game' && (
                      <span className="text-xs text-vrerror">✕ 该时段已有其他游戏预约</span>
                    )}
                  </motion.div>
                )}

                {/* Person/Company + Count */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      {bookingForm.type === 'corporate' ? '企业名称' : '预约人'}
                    </label>
                    <input
                      type="text"
                      placeholder={bookingForm.type === 'corporate' ? '请输入企业名称' : '请输入预约人姓名'}
                      value={bookingForm.person}
                      onChange={(e) =>
                        setBookingForm((prev) => ({ ...prev, person: e.target.value }))
                      }
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      人数 <span className="text-vr-red">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={slotStatus?.remainingCount || slotStatus?.maxCount || 20}
                      value={bookingForm.count}
                      onChange={(e) =>
                        setBookingForm((prev) => ({ ...prev, count: Number(e.target.value) }))
                      }
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                    />
                  </div>
                </motion.div>

                {/* Phone */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    联系电话
                  </label>
                  <input
                    type="tel"
                    placeholder="请输入手机号码"
                    value={bookingForm.phone}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                  />
                  {isSearchingUser && (
                    <p className="text-vr-caption text-vrtext-muted mt-1">正在查询会员...</p>
                  )}
                </motion.div>

                {/* Member info */}
                {matchedUser && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.26, duration: 0.3 }}
                    className="p-3 rounded-lg bg-vrbg-elevated/50 border border-vrborder-DEFAULT"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-vr-body-sm text-vrtext-primary font-medium">{matchedUser.name}</span>
                        <span className={cn(
                          'text-vr-caption px-1.5 py-0.5 rounded-full',
                          matchedUser.level === 'VIP_PLUS' ? 'bg-vr-error/20 text-vr-error' :
                          matchedUser.level === 'VIP' ? 'bg-vr-warning/20 text-vr-warning' :
                          matchedUser.level === 'MEMBER' ? 'bg-vr-accent-primary/20 text-vraccent-primary' :
                          'bg-vrbg-hover text-vrtext-secondary'
                        )}>
                          {matchedUser.level === 'VIP_PLUS' ? 'VIP+' :
                           matchedUser.level === 'VIP' ? 'VIP' :
                           matchedUser.level === 'MEMBER' ? '会员' : '普通'}
                        </span>
                      </div>
                      <span className="text-vr-body-sm text-vrtext-secondary">
                        余额 <span className="text-vrtext-primary font-semibold">¥{(realBalance / 100).toLocaleString()}</span>
                        {discountRate < 100 && (
                          <span className="text-vr-caption text-vraccent-primary ml-1">享{discountRate}折</span>
                        )}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Payment method */}
                {matchedUser && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.27, duration: 0.3 }}
                  >
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">支付方式</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="payMethod"
                          checked={!useBalancePay}
                          onChange={() => setUseBalancePay(false)}
                          className="w-4 h-4 accent-vr-blue cursor-pointer"
                        />
                        <span className="text-vr-body-sm text-vrtext-primary">现场收款</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="payMethod"
                          checked={useBalancePay}
                          onChange={() => setUseBalancePay(true)}
                          className="w-4 h-4 accent-vr-blue cursor-pointer"
                        />
                        <span className="text-vr-body-sm text-vrtext-primary">余额支付</span>
                      </label>
                    </div>
                    {useBalancePay && realBalance < estimatedAmountRaw && (
                      <p className="text-vr-caption text-vr-error mt-1.5">
                        ⚠️ 余额不足（当前余额 ¥{(realBalance / 100).toLocaleString()}，还需 ¥{((estimatedAmountRaw - realBalance) / 100).toLocaleString()}）
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Note */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注</label>
                  <textarea
                    placeholder="请输入备注信息..."
                    rows={3}
                    value={bookingForm.note}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, note: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all resize-none"
                  />
                </motion.div>

                {/* Error message */}
                {createError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]"
                  >
                    <div className="w-4 h-4 rounded-full bg-vr-red flex items-center justify-center">
                      <span className="text-white text-[10px]">✕</span>
                    </div>
                    <span className="text-vr-body-sm text-vr-red">{createError}</span>
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-DEFAULT">
                <button
                  onClick={closeModal}
                  className="h-10 px-5 border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-hover transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    console.log('点击确定预约', { venue: bookingForm.venue, modalTime, bookingDate, person: bookingForm.person, phone: bookingForm.phone })
                    if (!bookingForm.venue) {
                      setCreateError('请选择场地')
                      return
                    }
                    if (!bookingForm.gameId) {
                      setCreateError('请选择游戏')
                      return
                    }
                    if (!modalTime) {
                      setCreateError('请选择场次')
                      return
                    }
                    if (isSlotPast(modalTime, bookingDate)) {
                      setCreateError(`场次 ${modalTime} 已过期（当前 ${getCurrentTimeString()}），请选择未来场次`)
                      return
                    }
                    const selectedVenue = venues.find((v) => v.id === bookingForm.venue)
                    if (isInMaintenanceWindow(selectedVenue, bookingDate, modalTime, selectedGame?.duration || 30)) {
                      setCreateError(`该时段场地正在维护中（${selectedVenue?.maintenanceStartTime}-${selectedVenue?.maintenanceEndTime}），请选择其他场次`)
                      return
                    }
                    // 余额支付校验
                    if (useBalancePay && matchedUser) {
                      if (realBalance < estimatedAmountRaw) {
                        setCreateError(`余额不足，当前余额 ¥${(realBalance / 100).toLocaleString()}，还需 ¥${((estimatedAmountRaw - realBalance) / 100).toLocaleString()}`)
                        return
                      }
                    }
                    setCreateError(null)
                    try {
                      const selectedGame = games.find((g: Game) => g.id === bookingForm.gameId)
                      const booking = await createMutation.mutateAsync({
                        venueId: bookingForm.venue,
                        type: bookingForm.type.toUpperCase(),
                        date: bookingDate,
                        startTime: modalTime,
                        endTime: addMinutes(modalTime, selectedGame?.duration || 30),
                        personName: bookingForm.person,
                        personPhone: bookingForm.phone,
                        personCount: bookingForm.count,
                        note: bookingForm.note,
                        title: `${bookingForm.type === 'corporate' ? '企业' : bookingForm.type === 'team' ? '团队' : '散客'}预约`,
                        gameId: bookingForm.gameId,
                      })
                      // 同步创建关联订单
                      if (booking?.id) {
                        const amount = (selectedGame?.price || 0) * bookingForm.count
                        await createOrder({
                          bookingId: booking.id,
                          venueId: bookingForm.venue,
                          venueName: selectedVenue?.name || '',
                          amount,
                          bookingTime: `${bookingDate} ${modalTime}-${addMinutes(modalTime, selectedGame?.duration || 30)}`,
                          customer: bookingForm.person,
                          phone: bookingForm.phone,
                          source: 'OFFLINE',
                          userId: matchedUser?.id,
                          payMethod: useBalancePay ? 'BALANCE' : undefined,
                        })
                        queryClient.invalidateQueries({ queryKey: ['orders'] })
                        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
                        queryClient.invalidateQueries({ queryKey: ['revenue'], exact: false })
                        queryClient.invalidateQueries({ queryKey: ['venues'], exact: false })
                        closeModal()
                      }
                    } catch (err: any) {
                      console.error('预约创建错误:', err)
                      setCreateError(err?.response?.data?.message || err?.message || '预约创建失败，请重试')
                    }
                  }}
                  disabled={createMutation.isPending || !bookingForm.venue || !modalTime || !bookingForm.gameId || slotStatus?.status === 'full' || slotStatus?.status === 'occupied_by_other_game' || (useBalancePay && !!matchedUser && realBalance < estimatedAmountRaw)}
                  className="h-10 px-5 bg-vraccent-primary text-white text-vr-body-sm font-medium rounded-lg hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? '提交中...' : useBalancePay ? '余额支付' : '确定预约'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
