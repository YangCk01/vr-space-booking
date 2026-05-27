import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBookings } from '@/api/bookings'
import { useAuth } from '@/providers/AuthProvider'

interface TimeSheetProps {
  venueId: string
  gamePrice: number
  onSelect: (date: string, startTime: string, endTime: string) => void
  onClose: () => void
}

const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export default function TimeSheet({ venueId, gamePrice, onSelect, onClose }: TimeSheetProps) {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuth()
  // Generate 7 days
  const days = useMemo(() => {
    const result: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      result.push(d)
    }
    return result
  }, [])

  const [selectedDay, setSelectedDay] = useState(0)
  const selectedDate = days[selectedDay]
  const dateStr = useMemo(() => {
    const y = selectedDate.getFullYear()
    const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0')
    const d = selectedDate.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [selectedDate])

  // Fetch bookings for selected date
  const { data: bookingsData } = useQuery({
    queryKey: ['bookings', venueId, dateStr],
    queryFn: () => getBookings({ venueId, date: dateStr }),
  })

  const occupied = useMemo(() => {
    const bookings: any[] = bookingsData?.data || []
    const set = new Set<string>()
    for (const b of bookings) {
      if (b.status === 'CANCELLED') continue
      const s = timeToMinutes(b.startTime)
      const e = timeToMinutes(b.endTime)
      for (let m = s; m < e; m += 30) {
        set.add(minutesToTime(m))
      }
    }
    return set
  }, [bookingsData])

  // Generate time slots 09:00 - 21:00, 30min each
  const timeSlots = useMemo(() => {
    const slots: { time: string; end: string; occupied: boolean; past: boolean }[] = []
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
    const isToday = dateStr === todayStr

    for (let m = 9 * 60; m < 21 * 60; m += 30) {
      const t = minutesToTime(m)
      const e = minutesToTime(m + 30)
      const isOccupied = occupied.has(t)
      const isPast = isToday && m <= now.getHours() * 60 + now.getMinutes()
      slots.push({ time: t, end: e, occupied: isOccupied, past: isPast })
    }
    return slots
  }, [occupied, dateStr])

  const dayLabel = (idx: number, date: Date) => {
    if (idx === 0) return '今天'
    if (idx === 1) return '明天'
    return weekDays[date.getDay()]
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-[var(--bg-primary)] rounded-t-3xl border-t border-[var(--border-subtle)] max-h-[85dvh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="w-10" />
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">选择时间</h3>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Day tabs */}
          <div className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-hide">
            {days.map((date, idx) => {
              const isActive = idx === selectedDay
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(idx)}
                  className={cn(
                    'flex flex-col items-center justify-center min-w-[72px] h-16 rounded-xl border transition-all duration-200',
                    isActive
                      ? 'bg-gradient-accent text-white border-transparent shadow-glow-sm'
                      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]',
                  )}
                >
                  <span className={cn('text-xs', isActive ? 'text-white/80' : 'text-[var(--text-muted)]')}>{dayLabel(idx, date)}</span>
                  <span className={cn('text-sm font-semibold', isActive ? 'text-white' : 'text-[var(--text-primary)]')}>
                    {date.getMonth() + 1}月{date.getDate()}日
                  </span>
                </button>
              )
            })}
          </div>

          {/* Time slots - 只显示可预订的 */}
          <div className="flex-1 overflow-y-auto px-5 space-y-2" style={{ paddingBottom: 'calc(6rem + var(--safe-bottom))' }}>
            {timeSlots.filter((s) => !s.past && !s.occupied).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                <Clock className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">今日暂无可用场次</p>
              </div>
            ) : (
              timeSlots
                .filter((s) => !s.past && !s.occupied)
                .map((slot) => (
                  <div
                    key={slot.time}
                    className="flex items-center justify-between p-4 rounded-xl border transition-all bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--accent-primary)]/10">
                        <Clock className="w-4 h-4 text-[var(--accent-primary)]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {slot.time} - {slot.end}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {`¥${gamePrice}/人`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!isLoggedIn) {
                          onClose()
                          navigate('/login')
                          return
                        }
                        onSelect(dateStr, slot.time, slot.end)
                      }}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-accent hover:shadow-glow-sm active:scale-95 transition-all"
                    >
                      预订
                    </button>
                  </div>
                ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
