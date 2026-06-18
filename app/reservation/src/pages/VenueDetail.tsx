import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Phone, Users, Clock, Share2, Star, Link2, Wrench } from 'lucide-react'
import { getPublicVenue } from '@/api/venues'
import { getGames } from '@/api/games'
import { getBookings } from '@/api/bookings'
import { getBookingConfig } from '@/api/settings'
import { getPublicGroupBuy } from '@/api/groupBuys'
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

  // 从 URL query 参数中读取 gameId / groupBuy
  const searchParams = new URLSearchParams(window.location.search)
  const initialGameId = searchParams.get('gameId')
  const groupBuyId = searchParams.get('groupBuy')

  const [selectedGameId, setSelectedGameId] = useState<string | null>(initialGameId)
  const [selectedDay, setSelectedDay] = useState(0)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)

  const { data: groupBuyPackage } = useQuery({
    queryKey: ['public-group-buy', groupBuyId],
    queryFn: () => getPublicGroupBuy(groupBuyId!),
    enabled: !!groupBuyId,
    staleTime: 60000,
  })

  // 团购套餐自动选中对应游戏
  useEffect(() => {
    if (groupBuyPackage?.gameId && !selectedGameId) {
      setSelectedGameId(groupBuyPackage.gameId)
    }
  }, [groupBuyPackage, selectedGameId])

  const { data: venue, isLoading } = useQuery({
    queryKey: ['venue', id],
    queryFn: () => getPublicVenue(id!),
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
  const gamePrice = selectedGame ? selectedGame.price / 100 : 0

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

  type SlotStatus = 'available' | 'joinable' | 'full' | 'occupied_by_other_game' | 'past' | 'maintenance'

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
    const slotDuration = selectedGame?.duration || 30

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

      // 检查目标日期/时段是否落入维护窗口。预约页需要提前提示未来维护，不等维护开始后才生效。
      const inMaintenance =
        venue?.status === 'MAINTENANCE' &&
        venue.maintenanceStartDate &&
        venue.maintenanceEndDate &&
        venue.maintenanceStartTime &&
        venue.maintenanceEndTime &&
        dateStr >= venue.maintenanceStartDate.slice(0, 10) &&
        dateStr <= venue.maintenanceEndDate.slice(0, 10) &&
        (() => {
          const ms = timeToMinutes(venue.maintenanceStartTime!)
          const me = timeToMinutes(venue.maintenanceEndTime!)
          const slotStart = timeToMinutes(t)
          const slotEnd = timeToMinutes(e)
          return slotStart < me && slotEnd > ms
        })()

      if (inMaintenance) {
        slots.push({ time: t, end: e, status: 'maintenance', currentCount: 0, remainingCount: 0, maxCount: deviceCount })
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
      if (!selectedGameId) {
        if (overlapping.length > 0) {
          slots.push({ time: t, end: e, status: 'full', currentCount: 0, remainingCount: 0, maxCount: deviceCount })
        } else {
          slots.push({ time: t, end: e, status: 'available', currentCount: 0, remainingCount: deviceCount, maxCount: deviceCount })
        }
        continue
      }

      // 检查是否有其他游戏的预约
      const otherGame = overlapping.some((b) => b.gameId && b.gameId !== selectedGameId)
      if (otherGame) {
        slots.push({ time: t, end: e, status: 'occupied_by_other_game', currentCount: 0, remainingCount: 0, maxCount: deviceCount })
        continue
      }

      // 统计同一游戏已预约人数
      const sameGame = overlapping.filter((b) => b.gameId === selectedGameId)
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
  }, [bookingsData, dateStr, venue, selectedGameId, selectedGame?.duration])

  const displaySlots = slotInfo.filter((s) => s.status !== 'past' && s.status !== 'occupied_by_other_game')

  // 当前选中的日期是否存在维护窗口。预约页需要提前提示未来维护。
  const isDateInMaintenanceWindow = useMemo(() => {
    if (venue?.status !== 'MAINTENANCE') return false
    if (!venue.maintenanceStartDate || !venue.maintenanceEndDate || !venue.maintenanceStartTime) return false
    if (dateStr < venue.maintenanceStartDate.slice(0, 10) || dateStr > venue.maintenanceEndDate.slice(0, 10)) return false
    return true
  }, [venue, dateStr])

  // 维护时段文本
  const maintenanceRangeText = useMemo(() => {
    if (!isDateInMaintenanceWindow) return ''
    const start = venue?.maintenanceStartTime?.slice(0, 5) || ''
    const end = venue?.maintenanceEndTime?.slice(0, 5) || ''
    if (start && end) return `${start}-${end}`
    return ''
  }, [isDateInMaintenanceWindow, venue])

  const dayLabel = (idx: number, date: Date) => {
    if (idx === 0) return '今天'
    if (idx === 1) return '明天'
    return weekDays[date.getDay()]
  }

  const handleCopyLink = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback
    }
  }

  const handleAppShare = (app: string) => {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      ;(navigator as any).share({
        title: venue?.name || '',
        text: `${venue?.name} ${venue?.address || ''}`,
        url: window.location.href,
      }).catch(() => {})
      return
    }
    const messages: Record<string, string> = {
      wechat: '请使用微信扫一扫或从微信打开分享',
      moments: '请使用微信扫一扫或从微信打开分享',
      qq: '请使用 QQ 打开进行分享',
      weibo: '请使用微博打开进行分享',
      dingtalk: '请使用钉钉打开进行分享',
    }
    setShareToast(messages[app] || '请在对应 App 中打开分享')
    setTimeout(() => setShareToast(null), 2000)
  }

  const handleSelectGame = useCallback((gameId: string) => {
    setSelectedGameId((current) => (current === gameId ? current : gameId))
  }, [])

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
        gamePrice: groupBuyPackage ? groupBuyPackage.groupPricePerPerson / 100 : gamePrice,
        gameId: selectedGameId || undefined,
        groupBuyPackageId: groupBuyPackage?.id,
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
        <button
          onClick={() => setShareOpen(true)}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 lg:px-12 -mt-8 relative z-10">
        {/* Venue Info Card */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 shadow-lg flex gap-3">
          <div className="flex-1 min-w-0">
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


        </div>

        {/* Copy toast */}
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs"
          >
            链接已复制
          </motion.div>
        )}
      </div>

      {/* Maintenance notice */}
      {isDateInMaintenanceWindow && (
        <div className="px-4 sm:px-0 mt-4">
          <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-700">
            <Wrench className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold">场地维护中</p>
              <p className="mt-0.5 text-orange-600/80">
                {maintenanceRangeText ? `${maintenanceRangeText} ` : ''}该时段场地正在维护，暂时不可预约
              </p>
            </div>
          </div>
        </div>
      )}

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
        <div key={selectedGame.id} className="px-4 sm:px-0 mt-4">
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
              const isMaintenance = slot.status === 'maintenance'
              const isPast = slot.status === 'past'
              const visual = isAvailable
                ? {
                  card: 'border-indigo-100 bg-white shadow-[0_8px_20px_rgba(79,70,229,0.06)]',
                  iconWrap: 'bg-indigo-50',
                  icon: 'text-indigo-500',
                  time: 'text-[var(--text-primary)]',
                  sub: 'text-slate-400',
                  badge: 'bg-gradient-accent text-white',
                  label: '预订',
                }
                : isJoinable
                ? {
                  card: 'border-amber-200 bg-amber-50/75 shadow-[0_8px_20px_rgba(245,158,11,0.08)]',
                  iconWrap: 'bg-amber-100',
                  icon: 'text-amber-500',
                  time: 'text-amber-950',
                  sub: 'text-amber-600',
                  badge: 'bg-amber-500 text-white',
                  label: '拼场',
                }
                : isMaintenance
                ? {
                  card: 'border-orange-200 bg-orange-50/80',
                  iconWrap: 'bg-orange-100',
                  icon: 'text-orange-500',
                  time: 'text-orange-950',
                  sub: 'text-orange-500',
                  badge: 'bg-orange-100 text-orange-600 border border-orange-200',
                  label: '维护',
                }
                : isFull
                ? {
                  card: 'border-rose-200 bg-rose-50/80',
                  iconWrap: 'bg-rose-100',
                  icon: 'text-rose-400',
                  time: 'text-rose-950',
                  sub: 'text-rose-500',
                  badge: 'bg-rose-100 text-rose-500 border border-rose-200',
                  label: '满员',
                }
                : isOtherGame
                ? {
                  card: 'border-sky-200 bg-sky-50/75',
                  iconWrap: 'bg-sky-100',
                  icon: 'text-sky-500',
                  time: 'text-sky-950',
                  sub: 'text-sky-500',
                  badge: 'bg-sky-100 text-sky-600 border border-sky-200',
                  label: '占用',
                }
                : {
                  card: 'border-slate-200 bg-slate-50/80',
                  iconWrap: 'bg-slate-100',
                  icon: 'text-slate-400',
                  time: 'text-slate-500',
                  sub: 'text-slate-400',
                  badge: 'bg-slate-100 text-slate-400 border border-slate-200',
                  label: isPast ? '已过' : '不可选',
                }

              return (
                <div
                  key={slot.time}
                  className={cn(
                    'grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl border px-3 py-2.5 transition-colors',
                    visual.card,
                    (isMaintenance || isFull || isOtherGame || isPast) && 'opacity-90'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      visual.iconWrap
                    )}>
                      <Clock className={cn(
                        'h-4 w-4',
                        visual.icon
                      )} />
                    </div>
                    <div className="min-w-0 leading-tight">
                      <p className={cn('truncate text-sm font-black whitespace-nowrap', visual.time)}>
                        {slot.time} - {slot.end}
                      </p>
                      <p className={cn('mt-0.5 truncate text-[11px] font-medium whitespace-nowrap', visual.sub)}>
                        {isMaintenance
                          ? '场地维护'
                          : isJoinable
                          ? `已约${slot.currentCount}人，余${slot.remainingCount}位`
                          : isFull
                          ? '当前已满'
                          : isOtherGame
                          ? '其他游戏占用'
                          : isPast
                          ? '已过时段'
                          : selectedGame
                          ? `¥${gamePrice}/人`
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
                        'h-8 min-w-[52px] rounded-full px-3 text-xs font-bold transition-all shrink-0',
                        selectedGame
                          ? visual.badge + ' active:scale-95'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
                      )}
                    >
                      {visual.label}
                    </button>
                  )}
                  {isJoinable && (
                    <button
                      onClick={() => handleBook(slot)}
                      disabled={!selectedGame}
                      className={cn(
                        'h-8 min-w-[52px] rounded-full px-3 text-xs font-bold transition-all active:scale-95 shrink-0',
                        visual.badge,
                        !selectedGame && 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed hover:bg-[var(--bg-elevated)]'
                      )}
                    >
                      {visual.label}
                    </button>
                  )}
                  {!isAvailable && !isJoinable && (
                    <span className={cn('inline-flex h-7 min-w-[48px] shrink-0 items-center justify-center rounded-full px-2.5 text-[11px] font-bold', visual.badge)}>
                      {visual.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Share Sheet */}
      {shareOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShareOpen(false)}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 bottom-0 z-50 bg-[var(--bg-card)] rounded-t-3xl p-4 pb-8"
          >
            <div className="w-10 h-1 rounded-full bg-[var(--border-subtle)] mx-auto mb-4" />
            <h3 className="text-center text-sm font-semibold text-[var(--text-primary)] mb-5">分享给好友</h3>

            <div className="grid grid-cols-5 gap-3 mb-6">
              {[
                { id: 'wechat', label: '微信好友', color: 'bg-[#07C160]', text: '微' },
                { id: 'moments', label: '朋友圈', color: 'bg-[#07C160]', text: '圈' },
                { id: 'qq', label: 'QQ', color: 'bg-[#12B7F5]', text: 'QQ' },
                { id: 'weibo', label: '微博', color: 'bg-[#E6162D]', text: '博' },
                { id: 'dingtalk', label: '钉钉', color: 'bg-[#0089FF]', text: '钉' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleAppShare(option.id)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm',
                      option.color
                    )}
                  >
                    {option.text}
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">{option.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                handleCopyLink()
                setShareOpen(false)
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium mb-3 active:scale-[0.99] transition-transform"
            >
              <Link2 className="w-4 h-4" />
              复制链接
            </button>
            <button
              onClick={() => setShareOpen(false)}
              className="w-full py-3 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium active:scale-[0.99] transition-transform"
            >
              取消
            </button>
          </motion.div>
        </>
      )}

      {/* Share toast */}
      {shareToast && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-black/70 text-white text-xs z-[60] text-center max-w-[70%]"
        >
          {shareToast}
        </motion.div>
      )}
    </motion.div>
  )
}
