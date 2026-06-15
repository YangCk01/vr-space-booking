import { useState, useMemo, useDeferredValue, useCallback, useRef } from 'react'
import type { PointerEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Phone, Users, Clock, Copy, Star } from 'lucide-react'
import { getVenue } from '@/api/venues'
import { getGames } from '@/api/games'
import { getBookings } from '@/api/bookings'
import { getBookingConfig } from '@/api/settings'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'

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

export default function VenueDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isLoggedIn } = useAuth()

  // 从 URL query 参数中读取 gameId
  const searchParams = new URLSearchParams(window.location.search)
  const initialGameId = searchParams.get('gameId')

  const [selectedGameId, setSelectedGameId] = useState<string | null>(initialGameId)
  const [selectedDay, setSelectedDay] = useState(0)
  const [copied, setCopied] = useState(false)
  const gameTouchRef = useRef<{ id: string; x: number; y: number } | null>(null)

  const { data: venue, isLoading } = useQuery({
    queryKey: ['venue', id],
    queryFn: () => getVenue(id!),
    enabled: !!id,
  })

  const { data: games } = useQuery({
    queryKey: ['games'],
    queryFn: () => getGames(),
  })

  const activeGames = useMemo(() => {
    return (games || []).filter((g) => g.status === 'ACTIVE')
  }, [games])

  const selectedGame = useMemo(() => {
    return activeGames.find((g) => g.id === selectedGameId)
  }, [activeGames, selectedGameId])
  const deferredSelectedGameId = useDeferredValue(selectedGameId)
  const deferredSelectedGame = useMemo(() => {
    return activeGames.find((g) => g.id === deferredSelectedGameId)
  }, [activeGames, deferredSelectedGameId])
  const gamePrice = selectedGame ? selectedGame.price / 100 : 0
  const deferredGamePrice = deferredSelectedGame ? deferredSelectedGame.price / 100 : 0

  // Fetch booking config
  const { data: bookingConfig } = useQuery({
    queryKey: ['booking-config'],
    queryFn: getBookingConfig,
  })
  const advanceDays = bookingConfig?.advanceDays || 7

  // Days
  const days = useMemo(() => {
    const result: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < advanceDays; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      result.push(d)
    }
    return result
  }, [advanceDays])

  const selectedDate = days[selectedDay]
  const dateStr = useMemo(() => {
    const y = selectedDate.getFullYear()
    const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0')
    const d = selectedDate.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [selectedDate])

  // Fetch bookings
  const { data: bookingsData } = useQuery({
    queryKey: ['bookings', id, dateStr],
    queryFn: () => getBookings({ venueId: id!, date: dateStr }),
    enabled: !!id,
  })

  type SlotStatus = 'available' | 'joinable' | 'full' | 'occupied_by_other_game' | 'past'

  interface SlotInfo {
    time: string
    end: string
    status: SlotStatus
    currentCount: number
    remainingCount: number
    maxCount: number
  }

  const slotInfo = useMemo(() => {
    const bookings: any[] = bookingsData?.data || []
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
    const isToday = dateStr === todayStr
    const deviceCount = venue?.deviceCount || 1

    const slots: SlotInfo[] = []
    const slotDuration = deferredSelectedGame?.duration || 30

    const openMinutes = venue?.openTime ? timeToMinutes(venue.openTime) : 9 * 60
    const closeMinutes = venue?.closeTime ? timeToMinutes(venue.closeTime) : 21 * 60

    for (let m = openMinutes; m < closeMinutes; m += slotDuration) {
      const t = minutesToTime(m)
      const e = minutesToTime(m + slotDuration)

      // 过滤超出营业时间的场次
      if (m + slotDuration > closeMinutes) continue

      const isPast = isToday && m <= now.getHours() * 60 + now.getMinutes()

      if (isPast) {
        slots.push({ time: t, end: e, status: 'past', currentCount: 0, remainingCount: 0, maxCount: deviceCount })
        continue
      }

      // 找出覆盖该 30 分钟槽的所有非取消 booking
      const overlapping = bookings.filter((b) => {
        if (b.status === 'CANCELLED') return false
        const bs = timeToMinutes(b.startTime)
        const be = timeToMinutes(b.endTime)
        const ms = timeToMinutes(t)
        const me = timeToMinutes(e)
        return ms < be && me > bs
      })

      // 未选游戏时保持原有二元冲突判断
      if (!deferredSelectedGameId) {
        if (overlapping.length > 0) {
          slots.push({ time: t, end: e, status: 'full', currentCount: 0, remainingCount: 0, maxCount: deviceCount })
        } else {
          slots.push({ time: t, end: e, status: 'available', currentCount: 0, remainingCount: deviceCount, maxCount: deviceCount })
        }
        continue
      }

      // 检查是否有其他游戏的预约
      const otherGame = overlapping.some((b) => b.gameId && b.gameId !== deferredSelectedGameId)
      if (otherGame) {
        slots.push({ time: t, end: e, status: 'occupied_by_other_game', currentCount: 0, remainingCount: 0, maxCount: deviceCount })
        continue
      }

      // 统计同一游戏已预约人数
      const sameGame = overlapping.filter((b) => b.gameId === deferredSelectedGameId)
      const currentCount = sameGame.reduce((sum, b) => sum + (b.personCount || 1), 0)

      if (currentCount === 0) {
        slots.push({ time: t, end: e, status: 'available', currentCount: 0, remainingCount: deviceCount, maxCount: deviceCount })
      } else if (currentCount < deviceCount) {
        slots.push({ time: t, end: e, status: 'joinable', currentCount, remainingCount: deviceCount - currentCount, maxCount: deviceCount })
      } else {
        slots.push({ time: t, end: e, status: 'full', currentCount, remainingCount: 0, maxCount: deviceCount })
      }
    }

    return slots
  }, [bookingsData, dateStr, venue, deferredSelectedGameId, deferredSelectedGame?.duration])

  const displaySlots = slotInfo.filter((s) => s.status !== 'past' && s.status !== 'occupied_by_other_game')

  const dayLabel = (idx: number, date: Date) => {
    if (idx === 0) return '今天'
    if (idx === 1) return '明天'
    return weekDays[date.getDay()]
  }

  const handleCopyAddress = () => {
    if (venue?.address) {
      navigator.clipboard.writeText(venue.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleSelectGame = useCallback((gameId: string) => {
    setSelectedGameId((current) => (current === gameId ? current : gameId))
  }, [])

  const handleGamePointerDown = useCallback((gameId: string, event: PointerEvent<HTMLButtonElement>) => {
    gameTouchRef.current = { id: gameId, x: event.clientX, y: event.clientY }
    handleSelectGame(gameId)
  }, [handleSelectGame])

  const handleGamePointerUp = useCallback((gameId: string, event: PointerEvent<HTMLButtonElement>) => {
    const start = gameTouchRef.current
    gameTouchRef.current = null

    if (!start || start.id !== gameId) {
      handleSelectGame(gameId)
      return
    }

    const moved = Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y)
    if (moved < 10) {
      handleSelectGame(gameId)
    }
  }, [handleSelectGame])

  const handleBook = (slot: SlotInfo) => {
    if (!isLoggedIn) {
      navigate('/login')
      return
    }
    navigate('/confirm', {
      state: {
        venueId: id,
        venueName: venue?.name,
        venueImage: venue?.image,
        date: dateStr,
        startTime: slot.time,
        endTime: slot.end,
        gamePrice,
        gameId: selectedGameId || undefined,
        slotStatus: slot.status,
        currentCount: slot.currentCount,
        remainingCount: slot.remainingCount,
        maxCount: slot.maxCount,
      },
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!venue) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)] bg-[var(--bg-primary)]">
        <p className="text-sm">场地不存在</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-[var(--accent-primary)] text-sm">返回</button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-[100dvh] bg-[var(--bg-primary)] pb-28"
    >
      {/* Hero Image */}
      <div className="relative w-full aspect-[4/3]">
        <img
          src={venue.image ? getImageUrl(venue.image) : '/venue-cyber.jpg'}
          alt={venue.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-transparent to-black/20" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 lg:px-12 -mt-8 relative z-10">
        {/* Venue Info Card */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 shadow-lg">
          <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[var(--accent-primary)]/15 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-[var(--accent-primary)]" />
            </span>
            {venue.name}
          </h1>

          {venue.address && (
            <div className="flex items-start gap-2 mt-2">
              <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed flex-1">{venue.address}</p>
              <button
                onClick={handleCopyAddress}
                className="shrink-0 w-7 h-7 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {venue.phone && (
            <div className="flex items-center gap-2 mt-1.5">
              <Phone className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <p className="text-xs text-[var(--text-secondary)]">{venue.phone}</p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-2.5 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              容纳{venue.capacity || 0}人
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {venue.area ? `${venue.area}㎡` : '未知面积'}
            </span>
          </div>
        </div>

        {/* Copy toast */}
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs"
          >
            地址已复制
          </motion.div>
        )}
      </div>

      {/* Game List */}
      {activeGames.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] px-4 sm:px-0 mb-2">游戏列表</h3>
          <div className="relative">
            {/* 左渐变提示 */}
            <div className="absolute left-0 top-0 bottom-2 w-5 bg-gradient-to-r from-[var(--bg-primary)] to-transparent z-10 pointer-events-none" />
            {/* 右渐变提示 */}
            <div className="absolute right-0 top-0 bottom-2 w-5 bg-gradient-to-l from-[var(--bg-primary)] to-transparent z-10 pointer-events-none" />
            <div className="flex gap-3 overflow-x-auto overscroll-x-contain px-4 sm:px-0 pb-2 scrollbar-hide snap-x snap-mandatory touch-pan-x [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
              {activeGames.map((game) => {
                const isSelected = selectedGameId === game.id
                return (
                  <button
                    key={game.id}
                    type="button"
                    aria-pressed={isSelected}
                    onPointerDown={(event) => handleGamePointerDown(game.id, event)}
                    onPointerUp={(event) => handleGamePointerUp(game.id, event)}
                    onPointerCancel={() => {
                      gameTouchRef.current = null
                    }}
                    onClick={() => handleSelectGame(game.id)}
                    className={cn(
                      'shrink-0 w-24 rounded-xl overflow-hidden border snap-start transform-gpu will-change-transform transition-[transform,border-color,opacity] duration-150 active:scale-[0.97]',
                      isSelected
                        ? 'border-[var(--accent-primary)] shadow-glow-sm'
                        : 'border-[var(--border-subtle)] opacity-80'
                    )}
                  >
                    <div className="aspect-[9/16] relative">
                      <img
                        src={game.coverImage ? getImageUrl(game.coverImage) : '/venue-cyber.jpg'}
                        alt={game.title}
                        loading="eager"
                        decoding="async"
                        draggable={false}
                        className="w-full h-full object-cover select-none"
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Selected Game Detail */}
      {selectedGame && (
        <div className="px-4 sm:px-0 mt-4">
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">{selectedGame.title}</h3>
                {selectedGame.subtitle && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{selectedGame.subtitle}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[var(--error)]">
                  ¥{gamePrice.toFixed(2)}
                  <span className="text-xs font-normal text-[var(--text-muted)]">/人</span>
                </p>
              </div>
            </div>

            {/* Difficulty placeholder using tags */}
            <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-[var(--accent-primary)]" />
                {selectedGame.tags.slice(0, 2).join(' · ') || 'VR体验'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                1-{venue.capacity || 4}人
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {selectedGame.duration}分钟
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Date Selector */}
      <div className="px-4 sm:px-0 mt-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">选择日期</h3>
        <div className="relative">
          {/* 左渐变提示 */}
          <div className="absolute left-0 top-0 bottom-2 w-5 bg-gradient-to-r from-[var(--bg-primary)] to-transparent z-10 pointer-events-none" />
          {/* 右渐变提示 */}
          <div className="absolute right-0 top-0 bottom-2 w-5 bg-gradient-to-l from-[var(--bg-primary)] to-transparent z-10 pointer-events-none" />
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory touch-pan-x scroll-smooth">
            {days.map((date, idx) => {
              const isActive = idx === selectedDay
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(idx)}
                  className={cn(
                    'flex flex-col items-center justify-center min-w-[80px] h-16 rounded-xl border transition-all snap-start',
                    isActive
                      ? 'bg-gradient-accent text-white border-transparent shadow-glow-sm'
                      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  )}
                >
                <span className={cn('text-[11px]', isActive ? 'text-white/80' : 'text-[var(--text-muted)]')}>
                  {dayLabel(idx, date)}
                </span>
                <span className={cn('text-sm font-semibold', isActive ? 'text-white' : 'text-[var(--text-primary)]')}>
                  {date.getMonth() + 1}月{date.getDate()}日
                </span>
              </button>
            )
          })}
        </div>
      </div>
      </div>

      {/* Time Slots */}
      <div className="px-4 sm:px-0 mt-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
          {selectedGameId ? '场次状态' : '可预订场次'}
        </h3>
        {displaySlots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
            <Clock className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">今日暂无可用场次</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {displaySlots.map((slot) => {
              const isAvailable = slot.status === 'available'
              const isJoinable = slot.status === 'joinable'
              const isFull = slot.status === 'full'
              const isOtherGame = slot.status === 'occupied_by_other_game'

              return (
                <div
                  key={slot.time}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-xl border bg-[var(--bg-card)] gap-3',
                    isAvailable || isJoinable
                      ? 'border-[var(--border-subtle)]'
                      : 'border-[var(--border-subtle)] opacity-60'
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                      isAvailable ? 'bg-[var(--accent-primary)]/10' :
                      isJoinable ? 'bg-orange-500/10' :
                      'bg-[var(--bg-elevated)]'
                    )}>
                      <Clock className={cn(
                        'w-4 h-4',
                        isAvailable ? 'text-[var(--accent-primary)]' :
                        isJoinable ? 'text-orange-500' :
                        'text-[var(--text-muted)]'
                      )} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">
                        {slot.time} - {slot.end}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] whitespace-nowrap truncate">
                        {isJoinable
                          ? `已约${slot.currentCount}人，余${slot.remainingCount}位`
                          : isFull
                          ? '已满'
                          : isOtherGame
                          ? '占用'
                          : selectedGame
                          ? `¥${deferredGamePrice}/人`
                          : '请先选择游戏'
                        }
                      </p>
                    </div>
                  </div>
                  {isAvailable && (
                    <button
                      onClick={() => handleBook(slot)}
                      disabled={!selectedGame}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium text-white transition-all shrink-0',
                        selectedGame
                          ? 'bg-gradient-accent active:scale-95'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
                      )}
                    >
                      预订
                    </button>
                  )}
                  {isJoinable && (
                    <button
                      onClick={() => handleBook(slot)}
                      disabled={!selectedGame}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium text-white transition-all bg-orange-500 hover:bg-orange-600 active:scale-95 shrink-0',
                        !selectedGame && 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed hover:bg-[var(--bg-elevated)]'
                      )}
                    >
                      拼场
                    </button>
                  )}
                  {isFull && (
                    <span className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-muted)] shrink-0">
                      已满
                    </span>
                  )}
                  {isOtherGame && (
                    <span className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-muted)] shrink-0">
                      占用
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
