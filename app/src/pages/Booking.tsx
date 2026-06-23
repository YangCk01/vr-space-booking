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
  Clock,
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
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/lib/permissions'
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

function buildTimeSlots(openH: number, closeH: number, stepMinutes = 20): string[] {
  const slots: string[] = []
  const start = openH * 60
  const end = closeH * 60
  for (let minutes = start; minutes + stepMinutes <= end; minutes += stepMinutes) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
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

function buildMaintenanceEvents(
  venues: Venue[],
  dateRange: { startDate: string; endDate: string },
) {
  const events: any[] = []
  for (const venue of venues) {
    if (venue.status !== 'MAINTENANCE') continue
    if (!venue.maintenanceStartDate || !venue.maintenanceEndDate || !venue.maintenanceStartTime || !venue.maintenanceEndTime) continue

    const maintenanceStartDate = venue.maintenanceStartDate.slice(0, 10)
    const maintenanceEndDate = venue.maintenanceEndDate.slice(0, 10)
    const rangeStart = maintenanceStartDate > dateRange.startDate ? maintenanceStartDate : dateRange.startDate
    const rangeEnd = maintenanceEndDate < dateRange.endDate ? maintenanceEndDate : dateRange.endDate
    if (rangeStart > rangeEnd) continue

    let day = new Date(`${rangeStart}T00:00:00`)
    const end = new Date(`${rangeEnd}T00:00:00`)
    while (day <= end) {
      const dateStr = format(day, 'yyyy-MM-dd')
      events.push({
        id: `maintenance-${venue.id}-${dateStr}`,
        venueId: venue.id,
        venue,
        type: 'MAINTENANCE',
        status: 'MAINTENANCE',
        date: dateStr,
        startTime: venue.maintenanceStartTime,
        endTime: venue.maintenanceEndTime,
        personName: '场地维护',
        personCount: 0,
        game: { title: '场地维护' },
      })
      day = addDays(day, 1)
    }
  }
  return events
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

function isTimeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB)
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
  const currentUser = useAuthStore((s) => s.user)
  const canManageBookings = hasPermission(currentUser, 'booking:manage')
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
  const bookingEvents = (bookingData?.data || []).filter((b: Booking) => b.status !== 'CANCELLED')
  const maintenanceEvents = useMemo(
    () => buildMaintenanceEvents(venues, dateRange),
    [venues, dateRange],
  )
  const allEvents = useMemo(
    () => [...bookingEvents, ...maintenanceEvents],
    [bookingEvents, maintenanceEvents],
  )

  /* ─── Fetch games ─── */
  const { data: gamesData } = useQuery({
    queryKey: ['games', 'booking-modal'],
    queryFn: () => getGames({ status: 'ACTIVE' }),
  })
  const games = gamesData || []
  const [dayGameId, setDayGameId] = useState('')
  const dayGame = useMemo(
    () => games.find((g: Game) => g.id === dayGameId) || games[0],
    [games, dayGameId],
  )
  const daySlotStep = Math.max(dayGame?.duration || 30, 5)

  useEffect(() => {
    if (!dayGameId && games[0]?.id) {
      setDayGameId(games[0].id)
    }
  }, [dayGameId, games])

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

  const visibleVenues = useMemo(
    () => venues.filter((v) => selectedVenue === 'all' || v.id === selectedVenue),
    [venues, selectedVenue],
  )

  const daySlotTimes = useMemo(
    () => buildTimeSlots(dayStartHour, dayEndHour, daySlotStep),
    [dayStartHour, dayEndHour, daySlotStep],
  )

  const visibleDaySlotTimes = useMemo(() => {
    const currentDateStr = format(currentDate, 'yyyy-MM-dd')
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (currentDateStr < todayStr) return []
    if (currentDateStr === todayStr) {
      return daySlotTimes.filter((slot) => !isSlotPast(slot, currentDateStr))
    }
    return daySlotTimes
  }, [currentDate, daySlotTimes])

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
  const openNewBooking = (venueId?: string, time?: string, gameId?: string) => {
    const defaultVenueId = venueId || venues[0]?.id || ''
    const venue = venues.find((v) => v.id === defaultVenueId)
    const presetGame = games.find((g: Game) => g.id === gameId)
    const presetDuration = presetGame?.duration || 30
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
    if (isInMaintenanceWindow(venue, currentDateStr, targetTime, presetDuration)) {
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
      gameId: gameId || '',
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

  const currentDayStats = useMemo(() => {
    const currentDateStr = format(currentDate, 'yyyy-MM-dd')
    const dayEvents = filteredEvents.filter((e) => getEventDateStr(e.date) === currentDateStr && e.status !== 'NO_SHOW')
    const bookingOnly = dayEvents.filter((e) => e.type !== 'MAINTENANCE' && e.type !== 'maintenance')
    const totalPeople = bookingOnly.reduce((sum, e) => sum + (Number(e.personCount) || 0), 0)
    const venueCapacity = visibleVenues.reduce((sum, v) => sum + (Number(v.capacity) || 0), 0)
    const occupiedSlots = new Set<string>()
    for (const event of bookingOnly) {
      for (const slot of daySlotTimes) {
        const slotEnd = addMinutes(slot, daySlotStep)
        if (isTimeOverlap(event.startTime, event.endTime, slot, slotEnd)) {
          occupiedSlots.add(`${event.venueId}-${slot}`)
        }
      }
    }
    const totalSlots = Math.max(visibleVenues.length * daySlotTimes.length, 1)
    const freeRate = Math.max(0, Math.round((1 - occupiedSlots.size / totalSlots) * 100))
    return {
      total: bookingOnly.length,
      people: totalPeople,
      maintenance: dayEvents.filter((e) => e.type === 'MAINTENANCE' || e.type === 'maintenance').length,
      capacity: venueCapacity,
      freeRate,
    }
  }, [currentDate, filteredEvents, visibleVenues, daySlotTimes])

  const getDateOverview = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayEvents = filteredEvents.filter((e) => getEventDateStr(e.date) === dateStr && e.status !== 'NO_SHOW')
    const bookingOnly = dayEvents.filter((e) => e.type !== 'MAINTENANCE' && e.type !== 'maintenance')
    const maintenanceOnly = dayEvents.filter((e) => e.type === 'MAINTENANCE' || e.type === 'maintenance')
    const people = bookingOnly.reduce((sum, e) => sum + (Number(e.personCount) || 0), 0)
    const checkedIn = bookingOnly.filter((e) => e.status === 'CHECKED_IN').length
    const playing = bookingOnly.filter((e) => e.status === 'PLAYING').length
    const noShow = bookingOnly.filter((e) => e.status === 'NO_SHOW').length
    const active = bookingOnly.filter((e) => e.status !== 'CANCELLED' && e.status !== 'NO_SHOW')
    const utilization = Math.min(100, Math.round((active.length / Math.max(visibleVenues.length * 8, 1)) * 100))
    return {
      events: dayEvents,
      bookings: bookingOnly,
      maintenance: maintenanceOnly,
      people,
      checkedIn,
      playing,
      noShow,
      utilization,
    }
  }, [filteredEvents, visibleVenues.length])

  const getDaySlotState = useCallback((venue: Venue, slot: string) => {
    const currentDateStr = format(currentDate, 'yyyy-MM-dd')
    const slotEnd = addMinutes(slot, daySlotStep)
    const dayEvents = filteredEvents.filter((e) => getEventDateStr(e.date) === currentDateStr && e.venueId === venue.id)
    const maintenanceEvent = dayEvents.find((e) =>
      (e.type === 'MAINTENANCE' || e.type === 'maintenance') &&
      isTimeOverlap(e.startTime, e.endTime, slot, slotEnd)
    )
    if (maintenanceEvent || isInMaintenanceWindow(venue, currentDateStr, slot, daySlotStep)) {
      return {
        kind: 'maintenance' as const,
        label: '维护中',
        event: maintenanceEvent,
        clickable: false,
        used: 0,
        remaining: 0,
      }
    }

    if (isSlotPast(slot, currentDateStr)) {
      return {
        kind: 'past' as const,
        label: '已过时',
        event: null,
        clickable: false,
        used: 0,
        remaining: 0,
      }
    }

    const bookings = dayEvents.filter((e) =>
      e.type !== 'MAINTENANCE' &&
      e.type !== 'maintenance' &&
      e.status !== 'CANCELLED' &&
      isTimeOverlap(e.startTime, e.endTime, slot, slotEnd)
    )
    if (bookings.length === 0) {
      return {
        kind: 'available' as const,
        label: '可预约',
        event: null,
        clickable: canManageBookings,
        used: 0,
        remaining: Math.max(Number(venue.capacity) || 0, 0),
      }
    }

    const used = bookings.reduce((sum, e) => sum + (Number(e.personCount) || 0), 0)
    const capacity = Number(venue.capacity) || used
    const remaining = Math.max(capacity - used, 0)
    const first = bookings[0]
    const currentGameId = dayGame?.id || ''
    const sameGame = currentGameId
      ? bookings.every((e) => (e.gameId || e.game?.id || '') === currentGameId)
      : bookings.every((e) => (e.gameId || e.game?.id || '') === (first.gameId || first.game?.id || ''))
    if (remaining > 0 && sameGame) {
      return {
        kind: 'joinable' as const,
        label: `可拼 ${remaining}人`,
        event: first,
        clickable: canManageBookings,
        used,
        remaining,
      }
    }

    return {
      kind: 'full' as const,
      label: remaining <= 0 ? '已约满' : '已占用',
      event: first,
      clickable: false,
      used,
      remaining,
    }
  }, [currentDate, filteredEvents, canManageBookings, daySlotStep, dayGame])

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
        {canManageBookings && (() => {
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
            <div className="border-b border-vrborder-subtle bg-vrbg-elevated/30 px-4 py-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: '当日预约', value: `${currentDayStats.total} 场`, tone: 'text-vraccent-primary' },
                  { label: '预约人次', value: `${currentDayStats.people} 人`, tone: 'text-vrtext-primary' },
                  { label: '场地容量', value: `${currentDayStats.capacity} 人`, tone: 'text-vrtext-primary' },
                  { label: '空闲率', value: `${currentDayStats.freeRate}%`, tone: 'text-emerald-500' },
                  { label: '维护时段', value: `${currentDayStats.maintenance} 段`, tone: 'text-orange-500' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-vrborder-subtle bg-vrbg-card px-3 py-2">
                    <p className="text-vr-caption text-vrtext-tertiary">{item.label}</p>
                    <p className={cn('mt-1 text-vr-body font-semibold', item.tone)}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-vr-caption text-vrtext-secondary">
                {[
                  ['bg-vrbg-card border-vrborder-subtle', '可预约'],
                  ['bg-blue-50 border-blue-200', '可拼场'],
                  ['bg-indigo-50 border-indigo-200', '已预约'],
                  ['bg-red-50 border-red-200', '已约满/冲突'],
                  ['bg-orange-50 border-orange-200', '维护中'],
                  ['bg-slate-100 border-slate-200', '已过时'],
                ].map(([cls, label]) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <span className={cn('h-3 w-3 rounded border', cls)} />
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-vrborder-subtle bg-vrbg-card px-3 py-2">
                <div>
                  <p className="text-vr-caption text-vrtext-tertiary">按游戏时长展示场次</p>
                  <p className="mt-0.5 text-vr-body-sm text-vrtext-secondary">
                    当前每个时段为 {daySlotStep} 分钟，完整校验维护和占用冲突
                  </p>
                </div>
                <select
                  value={dayGame?.id || ''}
                  onChange={(e) => setDayGameId(e.target.value)}
                  className="h-9 min-w-[220px] rounded-lg border border-vrborder-DEFAULT bg-vrbg-card px-3 text-vr-body-sm text-vrtext-primary focus:border-vraccent-primary focus:outline-none"
                >
                  {games.map((game: Game) => (
                    <option key={game.id} value={game.id}>
                      {game.title} · {game.duration || 30}分钟
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {visibleDaySlotTimes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-vrborder-subtle px-6 py-12 text-center text-vr-body-sm text-vrtext-secondary">
                  当前日期没有可展示的后续时段
                </div>
              ) : visibleVenues.map((venue, venueIndex) => {
                const dateStr = format(currentDate, 'yyyy-MM-dd')
                const venueEvents = filteredEvents.filter((e) => getEventDateStr(e.date) === dateStr && e.venueId === venue.id && e.type !== 'MAINTENANCE' && e.type !== 'maintenance')
                const venuePeople = venueEvents.reduce((sum, e) => sum + (Number(e.personCount) || 0), 0)
                return (
                  <motion.div
                    key={venue.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: venueIndex * 0.03 }}
                    className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-3"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-vr-body font-semibold text-vrtext-primary">{venue.name}</p>
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[11px]',
                            venue.status === 'MAINTENANCE'
                              ? 'bg-orange-50 text-orange-600'
                              : venue.status === 'DISABLED'
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-emerald-50 text-emerald-600'
                          )}>
                            {venue.status === 'MAINTENANCE' ? '维护中' : venue.status === 'DISABLED' ? '暂停营业' : '营业中'}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-vr-caption text-vrtext-tertiary">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {venue.openTime?.slice(0, 5) || `${String(dayStartHour).padStart(2, '0')}:00`} - {venue.closeTime?.slice(0, 5) || `${String(dayEndHour).padStart(2, '0')}:00`}
                          </span>
                          <span>已排 {venueEvents.length} 场</span>
                          <span>人数 {venuePeople}/{venue.capacity}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-2">
                      {visibleDaySlotTimes.map((slot) => {
                        const state = getDaySlotState(venue, slot)
                        const event = state.event
                        const isClickable = state.clickable && venue.status !== 'DISABLED'
                        const cellClass =
                          state.kind === 'available'
                            ? 'bg-vrbg-card hover:border-vraccent-primary hover:bg-vrbg-hover'
                            : state.kind === 'joinable'
                              ? 'bg-blue-50 border-blue-200 hover:border-blue-400'
                              : state.kind === 'maintenance'
                                ? 'bg-orange-50 border-orange-200 text-orange-700'
                                : state.kind === 'past'
                                  ? 'bg-slate-100 border-slate-200 text-slate-400'
                                  : 'bg-red-50 border-red-200 text-red-600'

                        return (
                          <button
                            key={`${venue.id}-${slot}`}
                            type="button"
                            disabled={!isClickable}
                            onClick={() => isClickable && openNewBooking(venue.id, slot, dayGame?.id)}
                            className={cn(
                              'group min-h-[72px] rounded-lg border p-2 text-left transition-colors',
                              cellClass,
                              isClickable ? 'cursor-pointer' : 'cursor-default'
                            )}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <p className="text-vr-body-sm font-semibold text-vrtext-primary">{slot}</p>
                                <p className="text-[11px] text-vrtext-tertiary">{addMinutes(slot, daySlotStep)}</p>
                              </div>
                              <span className={cn(
                                'rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                                state.kind === 'available' ? 'bg-slate-100 text-vrtext-secondary' :
                                state.kind === 'joinable' ? 'bg-blue-100 text-blue-700' :
                                state.kind === 'full' ? 'bg-red-100 text-red-600' :
                                state.kind === 'maintenance' ? 'bg-orange-100 text-orange-700' :
                                'bg-slate-200 text-slate-500'
                              )}>
                                {state.label}
                              </span>
                            </div>

                            {event ? (
                              <div className="mt-1.5">
                                <p className="truncate text-[11px] font-medium text-vrtext-primary">
                                  {event.game?.title || event.title || 'VR体验'}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-vrtext-secondary">
                                  {event.personCount || state.used || 1}人{event.personName ? ` · ${event.personName}` : ''}
                                </p>
                              </div>
                            ) : state.kind === 'available' ? (
                              <div className="mt-2 flex items-center gap-1 text-[11px] text-vrtext-tertiary">
                                {isClickable && <Plus className="h-3 w-3" />}
                                {isClickable ? '点击排场' : '空闲'}
                              </div>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                )
              })}
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
            className="bg-vrbg-card rounded-b-xl border border-t-0 border-vrborder-DEFAULT overflow-hidden p-4"
          >
            <div className="grid grid-cols-7 gap-3">
              {weekDays.map((day) => {
                const overview = getDateOverview(day)
                const isPastDay = format(day, 'yyyy-MM-dd') < format(new Date(), 'yyyy-MM-dd')
                const topEvents = overview.bookings
                  .filter((e) => !isPastDay || e.status !== 'CANCELLED')
                  .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
                  .slice(0, 4)
                return (
                  <button
                  key={day.toISOString()}
                    type="button"
                    onClick={() => { setCurrentDate(day); setView('day') }}
                  className={cn(
                      'min-h-[260px] rounded-xl border p-3 text-left transition-all hover:border-vraccent-primary hover:shadow-vr-md',
                      isToday(day)
                        ? 'border-vraccent-primary bg-blue-50/40'
                        : 'border-vrborder-subtle bg-vrbg-card',
                      isPastDay && 'bg-slate-50/70'
                  )}
                >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={cn('text-vr-body-sm font-semibold', isToday(day) ? 'text-vraccent-primary' : 'text-vrtext-primary')}>
                          {format(day, 'EEE', { locale: zhCN })}
                        </p>
                        <p className="mt-1 text-vr-caption text-vrtext-tertiary">{format(day, 'M月d日', { locale: zhCN })}</p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px]',
                        overview.maintenance.length > 0
                          ? 'bg-orange-50 text-orange-600'
                          : overview.bookings.length > 0
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-slate-100 text-slate-500'
                      )}>
                        {overview.maintenance.length > 0 ? '有维护' : overview.bookings.length > 0 ? '有排场' : '空闲'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-vrbg-elevated px-2 py-2">
                        <p className="text-[11px] text-vrtext-tertiary">预约</p>
                        <p className="text-vr-body-sm font-semibold text-vrtext-primary">{overview.bookings.length} 场</p>
                      </div>
                      <div className="rounded-lg bg-vrbg-elevated px-2 py-2">
                        <p className="text-[11px] text-vrtext-tertiary">人次</p>
                        <p className="text-vr-body-sm font-semibold text-vrtext-primary">{overview.people} 人</p>
                      </div>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-vrbg-elevated">
                      <div
                        className={cn('h-full rounded-full', overview.utilization >= 70 ? 'bg-red-400' : overview.utilization >= 35 ? 'bg-blue-400' : 'bg-emerald-400')}
                        style={{ width: `${overview.utilization}%` }}
                      />
                    </div>

                    <div className="mt-3 space-y-2">
                      {topEvents.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-vrborder-subtle px-2 py-5 text-center text-vr-caption text-vrtext-tertiary">
                          暂无预约
                        </p>
                      ) : topEvents.map((event) => (
                        <div key={event.id} className="rounded-lg border border-vrborder-subtle bg-vrbg-card px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-vr-caption font-medium text-vrtext-primary">{event.startTime}-{event.endTime}</span>
                            <span className="text-[11px] text-vrtext-tertiary">{event.personCount || 1}人</span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-vrtext-secondary">
                            {event.venueName || venues.find((v) => v.id === event.venueId)?.name || '场地'} · {event.game?.title || event.title || 'VR体验'}
                          </p>
                        </div>
                      ))}
                      {overview.bookings.length > topEvents.length && (
                        <p className="text-center text-vr-caption text-vraccent-primary">+{overview.bookings.length - topEvents.length} 更多</p>
                      )}
                    </div>
                  </button>
                )
              })}
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
                const overview = getDateOverview(day)
                const hasMaintenance = overview.maintenance.length > 0
                const hasBooking = overview.bookings.length > 0
                return (
                  <motion.div
                    key={day.toISOString()}
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1, transition: { duration: 0.2 } },
                    }}
                    className={cn(
                      'min-h-[132px] border border-vrborder-DEFAULT/40 p-2 cursor-pointer hover:bg-vrbg-hover/30 transition-colors',
                      !isCurrentMonth && 'opacity-50 bg-vrbg-base/30',
                      isToday(day) && 'bg-[rgba(59,130,246,0.06)]',
                      hasMaintenance && 'bg-orange-50/40',
                    )}
                    onClick={() => { setCurrentDate(day); setView('day') }}
                  >
                    {/* Date number */}
                    <div className="flex items-center justify-between mb-2">
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
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px]',
                        hasMaintenance
                          ? 'bg-orange-100 text-orange-600'
                          : hasBooking
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-slate-100 text-slate-500'
                      )}>
                        {hasMaintenance ? '维护' : hasBooking ? '有排场' : '空闲'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-md bg-vrbg-card px-2 py-1.5">
                        <p className="text-[11px] text-vrtext-tertiary">预约</p>
                        <p className="text-vr-caption font-semibold text-vrtext-primary">{overview.bookings.length} 场</p>
                      </div>
                      <div className="rounded-md bg-vrbg-card px-2 py-1.5">
                        <p className="text-[11px] text-vrtext-tertiary">人次</p>
                        <p className="text-vr-caption font-semibold text-vrtext-primary">{overview.people} 人</p>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-vrbg-card">
                      <div
                        className={cn('h-full rounded-full', hasMaintenance ? 'bg-orange-400' : overview.utilization >= 70 ? 'bg-red-400' : overview.utilization >= 35 ? 'bg-blue-400' : 'bg-emerald-400')}
                        style={{ width: `${hasBooking || hasMaintenance ? Math.max(overview.utilization, 8) : 0}%` }}
                      />
                    </div>

                    {overview.bookings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {overview.bookings
                          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
                          .slice(0, 2)
                          .map((event) => (
                            <p key={event.id} className="truncate rounded bg-vrbg-card px-1.5 py-0.5 text-[11px] text-vrtext-secondary">
                              {event.startTime} {event.venueName || venues.find((v) => v.id === event.venueId)?.name || '场地'}
                            </p>
                          ))}
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
