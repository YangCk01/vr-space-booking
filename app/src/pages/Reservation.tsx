import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarDays,
  X,
  CheckCircle2,
  QrCode,
  FileText,
  Home,
  AlertCircle,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/lib/imageUrl'
import { getVenues } from '@/api/venues'
import { getBookings, createBooking, checkConflict } from '@/api/bookings'
import { createOrder } from '@/api/orders'
import { getNotifications, getUnreadCount, markAllRead } from '@/api/notifications'

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Venue {
  id: string
  name: string
  theme: string
  image: string
  area: string
  capacity: number
  pricePerHour: number
  status: 'available' | 'occupied' | 'maintenance' | 'closed'
  maintenanceStartDate?: string | null
  maintenanceEndDate?: string | null
  maintenanceStartTime?: string | null
  maintenanceEndTime?: string | null
}

type PaymentMethod = 'wechat' | 'alipay'

type Step = 1 | 2 | 3 | 4

interface BookingData {
  venue: Venue | null
  date: Date | null
  timeSlots: string[]
  paymentMethod: PaymentMethod
  personName: string
  personPhone: string
  personCount: number
  note: string
  title: string
}

/* ─────────────────────────────────────────────
   Constants & Data
   ───────────────────────────────────────────── */

const STEP_TITLES = ['选择场地', '选择时间', '确认订单', '预约成功']

const HOURS = Array.from({ length: 25 }, (_, i) => {
  const hour = Math.floor(i / 2) + 9
  const minute = (i % 2) * 30
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
})

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function add30Minutes(time: string) {
  return minutesToTime(timeToMinutes(time) + 30)
}

/* ─────────────────────────────────────────────
   Utility Components
   ───────────────────────────────────────────── */

function StatusBadge({ status, text }: { status: string; text: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    available: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
    occupied: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-tertiary' },
    closed: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-tertiary' },
    maintenance: { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
  }
  const c = config[status] || config.maintenance
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium', c.bg, c.text)}>
      {text}
    </span>
  )
}

/* ─────────────────────────────────────────────
   Step Indicator
   ───────────────────────────────────────────── */

function StepIndicator({ currentStep }: { currentStep: Step }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {[1, 2, 3, 4].map((step, idx) => {
        const isCompleted = currentStep > step
        const isCurrent = currentStep === step

        return (
          <div key={step} className="flex items-center">
            {/* Connector line before */}
            {idx > 0 && (
              <div className={cn(
                'w-8 h-[2px] mx-1 transition-colors duration-300',
                currentStep > step ? 'bg-vraccent-primary' : 'bg-vrbg-elevated'
              )} />
            )}

            {/* Step dot */}
            <div className="relative flex flex-col items-center">
              <motion.div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors duration-300',
                  isCompleted && 'bg-vraccent-primary border-vraccent-primary',
                  isCurrent && 'bg-vraccent-primary border-vraccent-primary scale-110',
                  !isCompleted && !isCurrent && 'bg-transparent border-vrborder-hover'
                )}
                animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.4 }}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 text-white" />
                ) : isCurrent ? (
                  <span className="text-white text-xs font-semibold">{step}</span>
                ) : (
                  <span className="text-vrtext-muted text-xs font-semibold">{step}</span>
                )}
              </motion.div>
              <span className={cn(
                'text-[10px] mt-1.5 font-medium transition-colors duration-300',
                isCurrent ? 'text-vraccent-primary' : isCompleted ? 'text-vrtext-secondary' : 'text-vrtext-muted'
              )}>
                {STEP_TITLES[step - 1]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Step 1: Select Venue
   ───────────────────────────────────────────── */

function StepSelectVenue({
  selectedVenue,
  selectedDate,
  onSelectVenue,
  onSelectDate,
}: {
  selectedVenue: Venue | null
  selectedDate: Date
  onSelectVenue: (v: Venue) => void
  onSelectDate: (d: Date) => void
}) {
  const { data: venueData } = useQuery({
    queryKey: ['venues', 'reservation'],
    queryFn: () => getVenues(),
  })

  const apiVenues = venueData?.data || []

  // Map API venues to local Venue type
  const VENUES: Venue[] = useMemo(() => {
    const statusMap: Record<string, Venue['status']> = {
      FREE: 'available',
      IN_USE: 'occupied',
      MAINTENANCE: 'maintenance',
      DISABLED: 'closed',
    }
    return apiVenues.map((v: any) => ({
      id: v.id,
      name: v.name,
      theme: v.theme,
      image: getImageUrl(v.image),
      area: `${v.area}㎡`,
      capacity: v.capacity,
      pricePerHour: v.pricePerHour || 0,
      status: statusMap[v.status] || 'available',
      maintenanceStartDate: v.maintenanceStartDate,
      maintenanceEndDate: v.maintenanceEndDate,
      maintenanceStartTime: v.maintenanceStartTime,
      maintenanceEndTime: v.maintenanceEndTime,
    }))
  }, [apiVenues])

  // Refresh current time every minute so days array stays up-to-date
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Generate 14 days starting from today
  const days = useMemo(() => {
    const result: Date[] = []
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      result.push(d)
    }
    return result
  }, [now])

  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
    >
      {/* Date selector */}
      <div className="mb-6">
        <h3 className="text-vr-body-sm text-vrtext-secondary mb-3 flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" />
          选择日期
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {days.map((date, idx) => {
            const isSelected =
              date.getDate() === selectedDate.getDate() &&
              date.getMonth() === selectedDate.getMonth()
            const dayLabel = idx === 0 ? '今天' : idx === 1 ? '明天' : weekDays[date.getDay()]

            const today = new Date(now)
            today.setHours(0, 0, 0, 0)
            const isPastDate = date.getTime() < today.getTime()

            return (
              <motion.button
                key={date.toISOString()}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
                onClick={() => !isPastDate && onSelectDate(date)}
                disabled={isPastDate}
                className={cn(
                  'flex flex-col items-center justify-center min-w-[56px] h-[64px] rounded-xl border transition-all duration-200',
                  isSelected
                    ? 'bg-vraccent-primary border-vraccent-primary text-white shadow-vr-glow-blue'
                    : isPastDate
                      ? 'bg-vrbg-elevated border-vrborder-subtle text-vrtext-muted cursor-not-allowed opacity-50'
                      : 'bg-vrbg-card border-vrborder-subtle text-vrtext-secondary hover:border-vrborder-hover'
                )}
              >
                <span className={cn('text-[10px]', isSelected ? 'text-white/80' : 'text-vrtext-tertiary')}>
                  {dayLabel}
                </span>
                <span className={cn('text-sm font-semibold', isSelected ? 'text-white' : 'text-vrtext-primary')}>
                  {date.getDate()}
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Venue cards */}
      <div className="mb-6">
        <h3 className="text-vr-body-sm text-vrtext-secondary mb-3">选择场地</h3>
        <div className="space-y-3">
          {VENUES.map((venue, idx) => {
            const isSelected = selectedVenue?.id === venue.id
            const isUnavailable = venue.status === 'closed'

            return (
              <motion.button
                key={venue.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: isUnavailable ? 0.6 : 1, x: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.35 }}
                onClick={() => !isUnavailable && onSelectVenue(venue)}
                disabled={isUnavailable}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200',
                  'bg-vrbg-card',
                  isSelected
                    ? 'border-vraccent-primary bg-vraccent-primary/5 shadow-vr-glow-blue'
                    : 'border-vrborder-subtle hover:border-vrborder-hover',
                  isUnavailable && 'cursor-not-allowed opacity-60'
                )}
              >
                {/* Venue image */}
                <div className="w-20 h-[60px] rounded-lg overflow-hidden shrink-0">
                  <img
                    src={getImageUrl(venue.image)}
                    alt={venue.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-vr-body text-vrtext-primary font-semibold">{venue.name}</span>
                    <span className="text-vr-caption text-vraccent-primary">{venue.theme}</span>
                  </div>
                  <p className="text-vr-caption text-vrtext-tertiary mb-1">
                    {venue.area} · 容纳{venue.capacity}人
                  </p>
                  <p className="text-vr-body-sm text-vrsuccess font-medium">
                    ¥{venue.pricePerHour}/小时
                  </p>
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge
                    status={venue.status}
                    text={venue.status === 'available' ? '可预约' : venue.status === 'occupied' ? '已满' : venue.status === 'closed' ? '暂停营业' : '维护中'}
                  />
                  {venue.status === 'maintenance' && venue.maintenanceStartTime && venue.maintenanceEndTime && (
                    <span className="text-vr-caption text-vrwarning">
                      {venue.maintenanceStartTime}-{venue.maintenanceEndTime}
                    </span>
                  )}
                  {isSelected ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    >
                      <div className="w-5 h-5 rounded-full bg-vraccent-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    </motion.div>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-vrtext-muted" />
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   Step 2: Select Time
   ───────────────────────────────────────────── */

function StepSelectTime({
  venue,
  selectedDate,
  selectedSlots,
  onToggleSlot,
}: {
  venue: Venue
  selectedDate: Date
  selectedSlots: string[]
  onToggleSlot: (time: string) => void
}) {
  const dateStr = useMemo(() => {
    const y = selectedDate.getFullYear()
    const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0')
    const d = selectedDate.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [selectedDate])

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings', venue.id, dateStr],
    queryFn: () => getBookings({ venueId: venue.id, date: dateStr }),
  })

  const occupied = useMemo(() => {
    const bookings: any[] = bookingsData?.data || []
    const occupiedSet = new Set<string>()
    for (const booking of bookings) {
      if (booking.status === 'CANCELLED') continue
      const startMin = timeToMinutes(booking.startTime)
      const endMin = timeToMinutes(booking.endTime)
      for (let m = startMin; m < endMin; m += 30) {
        occupiedSet.add(minutesToTime(m))
      }
    }
    return occupiedSet
  }, [bookingsData])

  // Check if a time slot falls within venue maintenance window
  const isInMaintenance = useCallback((time: string): boolean => {
    if (venue.status !== 'maintenance') return false
    if (!venue.maintenanceStartDate || !venue.maintenanceEndDate || !venue.maintenanceStartTime || !venue.maintenanceEndTime) return false
    if (dateStr < venue.maintenanceStartDate.slice(0, 10) || dateStr > venue.maintenanceEndDate.slice(0, 10)) return false
    const s1 = timeToMinutes(time)
    const e1 = s1 + 30
    const ms1 = timeToMinutes(venue.maintenanceStartTime)
    const me1 = timeToMinutes(venue.maintenanceEndTime)
    return s1 < me1 && e1 > ms1
  }, [venue, dateStr])

  // Group hours into rows of 3
  const timeRows = useMemo(() => {
    const rows: string[][] = []
    for (let i = 0; i < HOURS.length; i += 3) {
      rows.push(HOURS.slice(i, i + 3))
    }
    return rows
  }, [])

  const sortedSlots = useMemo(() => [...selectedSlots].sort(), [selectedSlots])
  const duration = selectedSlots.length * 30
  const totalPrice = (duration / 60) * venue.pricePerHour

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
    >
      {/* Selected venue summary */}
      <div className="flex items-center gap-3 bg-vrbg-elevated rounded-lg p-3 mb-5">
        <img src={getImageUrl(venue.image)} alt={venue.name} className="w-10 h-[30px] rounded-md object-cover" />
        <div className="flex-1">
          <p className="text-vr-body-sm text-vrtext-primary font-medium">
            {venue.name} ({venue.theme})
          </p>
          <p className="text-vr-caption text-vrsuccess">¥{venue.pricePerHour}/小时</p>
        </div>
      </div>

      {/* Time grid */}
      <h3 className="text-vr-body-sm text-vrtext-secondary mb-3">可选时段</h3>
      {bookingsLoading && (
        <div className="flex items-center justify-center py-6 mb-5">
          <div className="w-5 h-5 border-2 border-vraccent-primary border-t-transparent rounded-full animate-spin mr-2" />
          <span className="text-vr-body-sm text-vrtext-secondary">加载时段信息...</span>
        </div>
      )}
      <div className="space-y-2 mb-5">
        {timeRows.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-3 gap-2">
            {row.map((time, colIdx) => {
              const isOccupied = occupied.has(time)
              const isSelected = selectedSlots.includes(time)
              const inMaint = isInMaintenance(time)

              // Disable past time slots on today
              const now = new Date()
              const dateStrCompare = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1).toString().padStart(2, '0')}-${selectedDate.getDate().toString().padStart(2, '0')}`
              const todayStrCompare = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
              const isToday = dateStrCompare === todayStrCompare
              const isPastTime = isToday && timeToMinutes(time) <= timeToMinutes(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)

              const disabled = isOccupied || isPastTime || inMaint

              return (
                <motion.button
                  key={time}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (rowIdx * 3 + colIdx) * 0.03, duration: 0.2 }}
                  onClick={() => !disabled && onToggleSlot(time)}
                  disabled={disabled}
                  className={cn(
                    'flex flex-col items-center justify-center py-3 px-2 rounded-lg border transition-all duration-200',
                    isSelected
                      ? 'bg-vraccent-primary border-vraccent-primary text-white shadow-vr-glow-blue'
                      : disabled
                        ? isPastTime
                          ? 'bg-vrtext-muted/10 border-vrtext-muted/20 text-vrtext-muted cursor-not-allowed'
                          : inMaint
                            ? 'bg-vrwarning/10 border-vrwarning/20 text-vrwarning cursor-not-allowed'
                            : 'bg-vrerror/10 border-vrerror/20 text-vrerror cursor-not-allowed'
                        : 'bg-vrbg-elevated border-vrborder-subtle text-vrtext-primary hover:border-vrborder-hover',
                    !disabled && !isSelected && 'hover:bg-vrbg-elevated'
                  )}
                >
                  <span className={cn('text-sm font-medium', isSelected ? 'text-white' : disabled ? (isPastTime ? 'text-vrtext-muted' : inMaint ? 'text-vrwarning' : 'text-vrerror') : 'text-vrtext-primary')}>
                    {time}-{add30Minutes(time)}
                  </span>
                  {!disabled && (
                    <span className={cn('text-[11px] mt-0.5', isSelected ? 'text-white/70' : 'text-vrsuccess')}>
                      可预约
                    </span>
                  )}
                  {disabled && (
                    <span className={cn('text-[11px] mt-0.5', isPastTime ? 'text-vrtext-muted' : inMaint ? 'text-vrwarning' : 'text-vrerror')}>{isPastTime ? '已结束' : inMaint ? '维护中' : '已约满'}</span>
                  )}
                </motion.button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Selected time summary */}
      <AnimatePresence>
        {selectedSlots.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-vraccent-primary/10 border border-[rgba(59,130,246,0.2)] rounded-lg p-4 mb-5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-vr-body-sm text-vrtext-primary">
                已选时间: {sortedSlots[0]} - {(() => {
                  const last = sortedSlots[sortedSlots.length - 1]
                  const [h, m] = last.split(':').map(Number)
                  const endM = m + 30
                  const endH = h + Math.floor(endM / 60)
                  return `${endH.toString().padStart(2, '0')}:${(endM % 60).toString().padStart(2, '0')}`
                })()}
              </span>
              <span className="text-vr-body-sm text-vraccent-primary font-semibold">
                {duration}分钟
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-vr-caption text-vrtext-secondary">费用合计</span>
              <span className="text-lg font-bold text-vrtext-primary">¥{totalPrice}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   Step 3: Confirm Order
   ───────────────────────────────────────────── */

function StepConfirmOrder({
  venue,
  selectedDate,
  selectedSlots,
  paymentMethod,
  onSelectPayment,
  personName,
  personPhone,
  personCount,
  note,
  title,
  onUpdateField,
}: {
  venue: Venue
  selectedDate: Date
  selectedSlots: string[]
  paymentMethod: PaymentMethod
  onSelectPayment: (m: PaymentMethod) => void
  personName: string
  personPhone: string
  personCount: number
  note: string
  title: string
  onUpdateField: (field: string, value: string | number) => void
}) {
  const sortedSlots = useMemo(() => [...selectedSlots].sort(), [selectedSlots])
  const duration = selectedSlots.length * 30
  const durationHours = duration / 60
  const totalPrice = durationHours * venue.pricePerHour

  const month = selectedDate.getMonth() + 1
  const date = selectedDate.getDate()
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const weekDay = weekDays[selectedDate.getDay()]

  const startTime = sortedSlots[0]
  const endTime = (() => {
    const last = sortedSlots[sortedSlots.length - 1]
    const [h, m] = last.split(':').map(Number)
    const endM = m + 30
    const endH = h + Math.floor(endM / 60)
    return `${endH.toString().padStart(2, '0')}:${(endM % 60).toString().padStart(2, '0')}`
  })()

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
    >
      {/* Order summary card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5 mb-5"
      >
        {/* Venue info */}
        <div className="flex items-center gap-3 pb-4 border-b border-vrborder-subtle">
          <img src={getImageUrl(venue.image)} alt={venue.name} className="w-[60px] h-[45px] rounded-md object-cover" />
          <div>
            <p className="text-vr-body text-vrtext-primary font-semibold">
              {venue.name} ({venue.theme})
            </p>
            <p className="text-vr-body-sm text-vrtext-secondary">
              {startTime} - {endTime} ({duration}分钟)
            </p>
            <p className="text-vr-caption text-vrtext-tertiary">
              {month}月{date}日 {weekDay}
            </p>
          </div>
        </div>

        {/* Price breakdown */}
        <div className="pt-4 space-y-3">
          <h4 className="text-vr-body-sm text-vrtext-secondary">价格明细</h4>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-start justify-between"
          >
            <div>
              <p className="text-vr-body-sm text-vrtext-primary">
                {venue.name} ({venue.theme}) {startTime}-{endTime} ({duration}分钟)
              </p>
              <p className="text-vr-caption text-vrtext-tertiary">{month}月{date}日 {weekDay}</p>
            </div>
            <span className="text-vr-body-sm text-vrtext-primary shrink-0 ml-4">¥{totalPrice}</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.28 }}
            className="flex items-center justify-between"
          >
            <span className="text-vr-caption text-vrtext-secondary">优惠金额</span>
            <span className="text-vr-caption text-vrtext-secondary">-¥0</span>
          </motion.div>

          <div className="border-t border-vrborder-subtle pt-3">
            <div className="flex items-center justify-between">
              <span className="text-vr-body text-vrtext-primary font-bold">应付金额</span>
              <motion.span
                className="text-xl font-bold text-vrerror"
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ delay: 0.4, duration: 0.3 }}
              >
                ¥{totalPrice}
              </motion.span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Contact info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5 mb-5"
      >
        <h4 className="text-vr-body-sm text-vrtext-secondary mb-3">联系人信息</h4>
        <div className="space-y-3">
          <div>
            <label className="text-vr-caption text-vrtext-tertiary block mb-1">预约人姓名 <span className="text-vrerror">*</span></label>
            <input
              type="text"
              value={personName}
              onChange={(e) => onUpdateField('personName', e.target.value)}
              placeholder="请输入姓名"
              className="w-full h-10 px-3 rounded-lg bg-vrbg-base border border-vrborder-subtle text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
            />
          </div>
          <div>
            <label className="text-vr-caption text-vrtext-tertiary block mb-1">联系电话 <span className="text-vrerror">*</span></label>
            <input
              type="tel"
              value={personPhone}
              onChange={(e) => onUpdateField('personPhone', e.target.value)}
              placeholder="请输入手机号"
              className="w-full h-10 px-3 rounded-lg bg-vrbg-base border border-vrborder-subtle text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
            />
          </div>
          <div>
            <label className="text-vr-caption text-vrtext-tertiary block mb-1">人数</label>
            <input
              type="number"
              min={1}
              max={venue.capacity}
              value={personCount}
              onChange={(e) => onUpdateField('personCount', parseInt(e.target.value) || 1)}
              className="w-full h-10 px-3 rounded-lg bg-vrbg-base border border-vrborder-subtle text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
            />
          </div>
          <div>
            <label className="text-vr-caption text-vrtext-tertiary block mb-1">预约标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => onUpdateField('title', e.target.value)}
              placeholder="请输入预约标题"
              className="w-full h-10 px-3 rounded-lg bg-vrbg-base border border-vrborder-subtle text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
            />
          </div>
          <div>
            <label className="text-vr-caption text-vrtext-tertiary block mb-1">备注</label>
            <textarea
              value={note}
              onChange={(e) => onUpdateField('note', e.target.value)}
              placeholder="选填"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-vrbg-base border border-vrborder-subtle text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors resize-none"
            />
          </div>
        </div>
      </motion.div>

      {/* Payment method */}
      <div className="mb-5">
        <h4 className="text-vr-body-sm text-vrtext-secondary mb-3">支付方式</h4>
        <div className="space-y-2">
          {([
            { key: 'wechat' as const, label: '微信支付', color: 'text-[#07C160]', bg: 'bg-[#07C160]' },
            { key: 'alipay' as const, label: '支付宝', color: 'text-[#1677FF]', bg: 'bg-[#1677FF]' },
          ]).map((method, idx) => (
            <motion.button
              key={method.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + idx * 0.1, duration: 0.3 }}
              onClick={() => onSelectPayment(method.key)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200 relative overflow-hidden',
                paymentMethod === method.key
                  ? 'bg-vrbg-elevated border-vraccent-primary'
                  : 'bg-vrbg-card border-vrborder-subtle hover:border-vrborder-hover'
              )}
            >
              {/* Left indicator line */}
              {paymentMethod === method.key && (
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-0 top-1 bottom-1 w-[3px] bg-vraccent-primary rounded-r-full"
                />
              )}

              {/* Radio circle */}
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                paymentMethod === method.key
                  ? 'border-vraccent-primary'
                  : 'border-vrtext-muted'
              )}>
                {paymentMethod === method.key && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-2.5 h-2.5 rounded-full bg-vraccent-primary"
                  />
                )}
              </div>

              {/* Icon placeholder using colored circle */}
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', method.bg)}>
                <span className="text-white text-[10px] font-bold">
                  {method.key === 'wechat' ? '微' : '支'}
                </span>
              </div>

              <span className={cn('text-vr-body-sm flex-1', paymentMethod === method.key ? 'text-vrtext-primary' : 'text-vrtext-secondary')}>
                {method.label}
              </span>

              {paymentMethod === method.key && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                  <CheckCircle2 className="w-5 h-5 text-vraccent-primary" />
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   Step 4: Success
   ───────────────────────────────────────────── */

function StepSuccess({
  venue,
  selectedDate,
  selectedSlots,
  orderNumber,
}: {
  venue: Venue
  selectedDate: Date
  selectedSlots: string[]
  orderNumber: string
}) {
  const navigate = useNavigate()

  const sortedSlots = useMemo(() => [...selectedSlots].sort(), [selectedSlots])
  const duration = selectedSlots.length * 30
  const month = selectedDate.getMonth() + 1
  const date = selectedDate.getDate()
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const weekDay = weekDays[selectedDate.getDay()]

  const startTime = sortedSlots[0]
  const endTime = (() => {
    const last = sortedSlots[sortedSlots.length - 1]
    const [h, m] = last.split(':').map(Number)
    const endM = m + 30
    const endH = h + Math.floor(endM / 60)
    return `${endH.toString().padStart(2, '0')}:${(endM % 60).toString().padStart(2, '0')}`
  })()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center"
    >
      {/* Success icon with circle animation */}
      <motion.div
        className="relative mb-4"
        initial={{ scale: 0.8 }}
        animate={{ scale: [0.8, 1.1, 1] }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
      >
        <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke="#1E293B"
            strokeWidth="3"
          />
          {/* Animated progress circle */}
          <motion.circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke="#10B981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 36}
            initial={{ strokeDashoffset: 2 * Math.PI * 36 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
          />
        </svg>
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, duration: 0.3, type: 'spring', stiffness: 400 }}
        >
          <CheckCircle2 className="w-10 h-10 text-vrsuccess" />
        </motion.div>
      </motion.div>

      {/* Success title */}
      <motion.h2
        className="text-vr-h1 text-vrsuccess font-semibold mb-1"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
      >
        预约成功
      </motion.h2>

      <motion.p
        className="text-vr-body-sm text-vrtext-secondary mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.3 }}
      >
        您的场地预约已确认
      </motion.p>

      {/* Order info */}
      <motion.div
        className="w-full bg-vrbg-card rounded-xl border border-vrborder-subtle p-5 mb-5"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-vr-caption text-vrtext-tertiary">订单号</span>
            <span className="text-vr-body-sm text-vraccent-primary font-mono">{orderNumber}</span>
          </div>
          <div className="border-t border-vrborder-subtle" />
          <div className="flex justify-between items-center">
            <span className="text-vr-caption text-vrtext-tertiary">场地</span>
            <span className="text-vr-body-sm text-vrtext-primary">{venue.name} ({venue.theme})</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-vr-caption text-vrtext-tertiary">时间</span>
            <span className="text-vr-body-sm text-vrtext-primary">{startTime} - {endTime} ({duration}分钟)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-vr-caption text-vrtext-tertiary">日期</span>
            <span className="text-vr-caption text-vrtext-secondary">{month}月{date}日 {weekDay}</span>
          </div>
        </div>
      </motion.div>

      {/* QR Code placeholder */}
      <motion.div
        className="flex flex-col items-center mb-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.3 }}
      >
        <div className="w-28 h-28 bg-white rounded-lg flex items-center justify-center mb-2">
          <QrCode className="w-20 h-20 text-vrbg-base" />
        </div>
        <p className="text-vr-caption text-vrtext-tertiary">出示二维码签到入场</p>
      </motion.div>

      {/* Tip */}
      <motion.div
        className="flex items-center gap-2 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.85, duration: 0.3 }}
      >
        <AlertCircle className="w-4 h-4 text-vrwarning" />
        <span className="text-vr-body-sm text-vrtext-secondary">请提前15分钟到场签到</span>
      </motion.div>

      {/* Buttons */}
      <motion.div
        className="w-full flex gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.3 }}
      >
        <button
          onClick={() => navigate('/orders')}
          className="flex-1 h-12 rounded-lg border border-vraccent-primary text-vraccent-primary font-medium text-sm hover:bg-vraccent-primary/10 transition-colors flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" />
          查看订单
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex-1 h-12 rounded-lg bg-vraccent-primary text-white font-medium text-sm hover:bg-vraccent-primary-hover transition-colors flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          返回首页
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   Main Reservation Component
   ───────────────────────────────────────────── */

export default function Reservation() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>(1)
  const [bookingData, setBookingData] = useState<BookingData>({
    venue: null,
    date: new Date(),
    timeSlots: [],
    paymentMethod: 'wechat',
    personName: '',
    personPhone: '',
    personCount: 1,
    note: '',
    title: '',
  })
  const [orderNumber, setOrderNumber] = useState<string>('')
  const [showNotify, setShowNotify] = useState(false)

  const [direction, setDirection] = useState<'next' | 'prev'>('next')

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadCount,
    refetchInterval: 30000,
  })
  const unreadCount = unreadData || 0

  const { data: notifyData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications({ pageSize: 20 }),
    enabled: showNotify,
  })
  const notifications = notifyData?.data?.data || []

  const markAllReadMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const createBookingMutation = useMutation({
    mutationFn: createBooking,
  })

  const handleNext = useCallback(async () => {
    if (step === 3) {
      if (!bookingData.venue || !bookingData.date || bookingData.timeSlots.length === 0) return

      const sortedSlots = [...bookingData.timeSlots].sort()
      const startTime = sortedSlots[0]
      const last = sortedSlots[sortedSlots.length - 1]
      const [h, m] = last.split(':').map(Number)
      const endM = m + 30
      const endH = h + Math.floor(endM / 60)
      const endTime = `${endH.toString().padStart(2, '0')}:${(endM % 60).toString().padStart(2, '0')}`

      const dateStr = `${bookingData.date.getFullYear()}-${(bookingData.date.getMonth() + 1).toString().padStart(2, '0')}-${bookingData.date.getDate().toString().padStart(2, '0')}`
      const durationHours = sortedSlots.length * 0.5
      const totalPrice = durationHours * bookingData.venue.pricePerHour

      try {
        const booking = await createBookingMutation.mutateAsync({
          venueId: bookingData.venue.id,
          type: 'INDIVIDUAL',
          date: dateStr,
          startTime,
          endTime,
          personName: bookingData.personName,
          personPhone: bookingData.personPhone,
          personCount: bookingData.personCount,
          note: bookingData.note,
          title: bookingData.title || `${bookingData.venue.name}预约`,
        })
        // 同步创建关联订单
        if (booking?.id) {
          setOrderNumber(booking.id)
          await createOrder({
            bookingId: booking.id,
            venueId: bookingData.venue.id,
            venueName: bookingData.venue.name,
            amount: Math.round(totalPrice * 100),
            bookingTime: `${dateStr} ${startTime}-${endTime}`,
            customer: bookingData.personName,
            phone: bookingData.personPhone,
            source: 'ONLINE',
          })
          queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
          queryClient.invalidateQueries({ queryKey: ['orders'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          queryClient.invalidateQueries({ queryKey: ['revenue'], exact: false })
          queryClient.invalidateQueries({ queryKey: ['venues'], exact: false })
          setDirection('next')
          setStep(4)
        }
      } catch (err) {
        console.error('预约创建错误:', err)
      }
      return
    }

    if (step < 4) {
      setDirection('next')
      setStep((s) => (s + 1) as Step)
    }
  }, [step, bookingData, createBookingMutation, queryClient])

  const handleBack = useCallback(() => {
    if (step > 1) {
      setDirection('prev')
      setStep((s) => (s - 1) as Step)
    } else {
      navigate('/')
    }
  }, [step, navigate])

  const canProceed = useMemo(() => {
    switch (step) {
      case 1:
        return bookingData.venue !== null
      case 2:
        return bookingData.timeSlots.length > 0
      case 3:
        return (
          bookingData.personName.trim().length > 0 &&
          bookingData.personPhone.trim().length > 0
        )
      default:
        return false
    }
  }, [step, bookingData])

  const slideVariants = {
    enter: (dir: 'next' | 'prev') => ({
      x: dir === 'next' ? 30 : -30,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: 'next' | 'prev') => ({
      x: dir === 'next' ? -30 : 30,
      opacity: 0,
    }),
  }

  return (
    <div className="min-h-[100dvh] bg-vrbg-base">
      {/* Simplified Header */}
      <header className="sticky top-0 z-50 bg-vrbg-base/80 backdrop-blur-md border-b border-vrborder-subtle">
        <div className="max-w-[480px] mx-auto px-4 h-12 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-vrtext-secondary hover:text-vrtext-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">返回</span>
          </button>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-vr-body text-vrtext-primary font-medium">
            {step < 4 ? '场地预约' : ''}
          </h1>

          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotify((v) => !v)}
                className="relative p-1.5 text-vrtext-secondary hover:text-vrtext-primary transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-vrerror rounded-full" />
                )}
              </button>

              {showNotify && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotify(false)} />
                  <div className="absolute right-0 top-full mt-1 w-80 bg-vrbg-elevated border border-vrborder-hover rounded-xl shadow-lg z-50 overflow-hidden max-h-[70vh]">
                    <div className="px-4 py-3 border-b border-vrborder-hover flex items-center justify-between">
                      <p className="text-vr-body-sm text-vrtext-primary font-medium">消息通知</p>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllReadMutation.mutate()}
                          className="text-xs text-vraccent-primary hover:underline"
                        >
                          全部已读
                        </button>
                      )}
                    </div>
                    <div className="overflow-y-auto max-h-64">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-vr-caption text-vrtext-muted">
                          暂无通知
                        </div>
                      ) : (
                        notifications.map((n: any) => (
                          <div
                            key={n.id}
                            className={`px-4 py-3 border-b border-vrborder-hover last:border-0 ${
                              n.read ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-vr-body-sm text-vrtext-primary font-medium">{n.title}</p>
                              {!n.read && <span className="w-1.5 h-1.5 bg-vrerror rounded-full" />}
                            </div>
                            <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{n.content}</p>
                            <p className="text-xs text-vrtext-muted mt-1">
                              {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => navigate('/')}
              className="p-1 text-vrtext-secondary hover:text-vrtext-primary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[480px] mx-auto px-4 py-5">
        {/* Step indicator */}
        {step < 4 && <StepIndicator currentStep={step} />}

        {/* Step content */}
        <AnimatePresence mode="wait" custom={direction}>
          {step === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            >
              <StepSelectVenue
                selectedVenue={bookingData.venue}
                selectedDate={bookingData.date || new Date()}
                onSelectVenue={(venue) => setBookingData((d) => ({ ...d, venue }))}
                onSelectDate={(date) => setBookingData((d) => ({ ...d, date }))}
              />
            </motion.div>
          )}

          {step === 2 && bookingData.venue && (
            <motion.div
              key="step2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            >
              <StepSelectTime
                venue={bookingData.venue}
                selectedDate={bookingData.date || new Date()}
                selectedSlots={bookingData.timeSlots}
                onToggleSlot={(time) =>
                  setBookingData((d) => {
                    const has = d.timeSlots.includes(time)
                    return {
                      ...d,
                      timeSlots: has ? d.timeSlots.filter((t) => t !== time) : [...d.timeSlots, time],
                    }
                  })
                }
              />
            </motion.div>
          )}

          {step === 3 && bookingData.venue && (
            <motion.div
              key="step3"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            >
              <StepConfirmOrder
                venue={bookingData.venue}
                selectedDate={bookingData.date || new Date()}
                selectedSlots={bookingData.timeSlots}
                paymentMethod={bookingData.paymentMethod}
                onSelectPayment={(paymentMethod) => setBookingData((d) => ({ ...d, paymentMethod }))}
                personName={bookingData.personName}
                personPhone={bookingData.personPhone}
                personCount={bookingData.personCount}
                note={bookingData.note}
                title={bookingData.title}
                onUpdateField={(field, value) =>
                  setBookingData((d) => ({ ...d, [field]: value }))
                }
              />
            </motion.div>
          )}

          {step === 4 && bookingData.venue && (
            <motion.div
              key="step4"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            >
              <StepSuccess
                venue={bookingData.venue}
                selectedDate={bookingData.date || new Date()}
                selectedSlots={bookingData.timeSlots}
                orderNumber={orderNumber}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation Buttons */}
        {step < 4 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className={cn(
              'mt-6 flex gap-3',
              step === 1 && 'flex-col'
            )}
          >
            {step > 1 && (
              <button
                onClick={handleBack}
                className="h-12 px-6 rounded-lg border border-vrborder-subtle text-vrtext-secondary font-medium text-sm hover:border-vrborder-hover hover:text-vrtext-primary transition-all shrink-0"
              >
                上一步
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed || createBookingMutation.isPending}
              className={cn(
                'h-12 rounded-lg font-medium text-sm transition-all duration-200 flex-1',
                canProceed && !createBookingMutation.isPending
                  ? 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover hover:-translate-y-px active:scale-[0.97]'
                  : 'bg-[rgba(59,130,246,0.3)] text-white/50 cursor-not-allowed'
              )}
            >
              {step === 3
                ? createBookingMutation.isPending
                  ? '提交中...'
                  : '立即支付'
                : '下一步'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
