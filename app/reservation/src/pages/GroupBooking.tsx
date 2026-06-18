import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Calendar, Users, AlertCircle, Phone, Store, User, ChevronDown } from 'lucide-react'
import { getOrder, redeemOrder } from '@/api/orders'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/lib/imageUrl'
import Stepper from '@/components/Stepper'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDateCN(d: Date) {
  const month = d.getMonth() + 1
  const day = d.getDate()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return { month, day, week, iso: `${d.getFullYear()}-${pad(month)}-${pad(day)}` }
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

function addMinutes(t: string, m: number) {
  return minutesToTime(timeToMinutes(t) + m)
}

function isSlotInMaintenance(venue: any, date: string, start: string, end: string) {
  if (venue?.status !== 'MAINTENANCE') return false
  if (!venue.maintenanceStartDate || !venue.maintenanceEndDate || !venue.maintenanceStartTime || !venue.maintenanceEndTime) return false
  if (date < venue.maintenanceStartDate.slice(0, 10) || date > venue.maintenanceEndDate.slice(0, 10)) return false
  return timeToMinutes(start) < timeToMinutes(venue.maintenanceEndTime) && timeToMinutes(end) > timeToMinutes(venue.maintenanceStartTime)
}

export default function GroupBooking() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoggedIn, isLoading: authLoading } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId && isLoggedIn,
  })

  const pkg = order?.groupBuyPackage
  const venues = pkg?.venues || []

  const [selectedVenueId, setSelectedVenueId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(formatDateCN(new Date()).iso)
  const [selectedTime, setSelectedTime] = useState<{ start: string; end: string } | null>(null)
  const [personName, setPersonName] = useState('')
  const [personPhone, setPersonPhone] = useState('')
  const [personCount, setPersonCount] = useState(1)
  const [errorMsg, setErrorMsg] = useState('')

  const today = new Date()
  const dateList = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      return formatDateCN(d)
    })
  }, [])

  useEffect(() => {
    if (venues.length > 0 && !selectedVenueId) {
      setSelectedVenueId(venues[0].id)
    }
  }, [venues, selectedVenueId])

  useEffect(() => {
    if (isLoggedIn && user) {
      if (!personName) setPersonName(user.name || '')
      if (!personPhone) setPersonPhone(user.phone || '')
    }
  }, [isLoggedIn, user, personName, personPhone])

  useEffect(() => {
    if (pkg && personCount === 1) {
      setPersonCount(Math.min((pkg.maxPeople || 1) * (order.quantity || 1), pkg.maxPeople || 1))
    }
  }, [pkg, order?.quantity, personCount])

  const selectedVenue = useMemo(
    () => venues.find((v: any) => v.id === selectedVenueId),
    [venues, selectedVenueId]
  )

  const duration = pkg?.game?.duration || 30
  const maxPeople = (pkg?.maxPeople || 1) * (order?.quantity || 1)

  const timeSlots = useMemo(() => {
    if (!selectedVenue) return []
    const startMin = timeToMinutes(selectedVenue.openTime || '10:00')
    const endMin = timeToMinutes(selectedVenue.closeTime || '22:00')
    const step = duration

    const now = new Date()
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const isToday = selectedDate === todayStr
    const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1

    const slots: { start: string; end: string; status: 'available' | 'maintenance' }[] = []
    for (let s = startMin; s + duration <= endMin; s += step) {
      // 只显示当前时间之后的时间段
      if (isToday && s <= nowMinutes) continue
      const st = minutesToTime(s)
      const en = minutesToTime(s + duration)
      slots.push({ start: st, end: en, status: isSlotInMaintenance(selectedVenue, selectedDate, st, en) ? 'maintenance' : 'available' })
    }
    return slots
  }, [selectedVenue, duration, selectedDate])

  useEffect(() => {
    if (timeSlots.length > 0) {
      const availableSlots = timeSlots.filter((t) => t.status === 'available')
      const exists = selectedTime && availableSlots.some((t) => t.start === selectedTime.start && t.end === selectedTime.end)
      if (!exists) {
        setSelectedTime(availableSlots[0] || null)
      }
    } else {
      setSelectedTime(null)
    }
  }, [timeSlots, selectedTime])

  const redeemMutation = useMutation({
    mutationFn: () =>
      redeemOrder(orderId!, {
        venueId: selectedVenueId,
        date: selectedDate,
        startTime: selectedTime!.start,
        endTime: selectedTime!.end,
        personName,
        personPhone,
        personCount,
        type: 'TEAM',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toastSuccess('预约成功')
      navigate(`/order/${orderId}`, { replace: true })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || '预约失败，请稍后重试'
      setErrorMsg(msg)
      toastError(msg)
    },
  })

  const handleSubmit = () => {
    setErrorMsg('')
    if (!selectedVenueId) {
      setErrorMsg('请选择适用门店')
      return
    }
    if (!selectedDate) {
      setErrorMsg('请选择日期')
      return
    }
    if (!selectedTime) {
      setErrorMsg('请选择时间')
      return
    }
    if (!personName.trim() || !personPhone.trim()) {
      setErrorMsg('请填写联系人姓名和手机号')
      return
    }
    if (!/^1\d{10}$/.test(personPhone.trim())) {
      setErrorMsg('请输入正确的11位手机号')
      return
    }
    redeemMutation.mutate()
  }

  if (isLoading || authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order || !pkg || !isLoggedIn) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)] px-6 bg-[var(--bg-primary)]">
        <AlertCircle className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">订单不存在或非团购订单</p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 px-6 py-2 rounded-xl text-sm font-medium text-white bg-gradient-accent"
        >
          返回订单列表
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] bg-[var(--bg-primary)] pb-28"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">在线预约</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* 套餐信息 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
          <div className="flex gap-3">
            <div className="w-16 h-16 rounded-xl bg-[var(--bg-elevated)] overflow-hidden shrink-0">
              <img
                src={getImageUrl(pkg.coverImage || pkg.game?.coverImage || null)}
                alt={pkg.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight">
                【{pkg.label}】{pkg.title}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                时长 {duration} 分钟 · {pkg.maxPeople}人/份 · 共{order.quantity || 1}份
              </p>
              <p className="text-sm font-black text-[var(--error)] mt-2">¥{((order.amount || 0) / 100).toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* 门店选择 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Store className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">选择门店</span>
            <span className="text-xs text-[var(--text-muted)] ml-auto">{venues.length}家适用</span>
          </div>
          <div className="relative">
            <select
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            >
              {venues.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {selectedVenue ? (
              <div className="flex items-start gap-3 p-3 rounded-xl border border-[var(--accent-primary)] bg-[var(--accent-primary)]/5">
                <div className="w-12 h-12 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                  {selectedVenue.image ? (
                    <img src={getImageUrl(selectedVenue.image)} alt={selectedVenue.name} className="w-full h-full object-cover" />
                  ) : (
                    'VR'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--accent-primary)]">{selectedVenue.name}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{selectedVenue.address || '到店前请确认预约时间'}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    营业时间 {selectedVenue.openTime || '10:00'} - {selectedVenue.closeTime || '22:00'}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-1" />
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-sm text-[var(--text-muted)]">
                请选择门店
              </div>
            )}
          </div>
        </div>

        {/* 日期选择 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">选择日期</span>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {dateList.map((d) => (
              <button
                key={d.iso}
                onClick={() => setSelectedDate(d.iso)}
                className={cn(
                  'flex flex-col items-center justify-center min-w-[64px] h-16 rounded-xl border transition-all',
                  selectedDate === d.iso
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                )}
              >
                <span className="text-xs">{d.month}月{d.day}日</span>
                <span className="text-xs mt-0.5 font-medium">{d.week}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 时间选择 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">选择时间</span>
            <span className="text-xs text-[var(--text-muted)] ml-auto">每场 {duration} 分钟</span>
          </div>
          {timeSlots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {timeSlots.map((t) => {
                const isMaintenance = t.status === 'maintenance'
                const selected = selectedTime?.start === t.start && selectedTime?.end === t.end
                return (
                  <button
                    key={`${t.start}-${t.end}`}
                    onClick={() => {
                      if (!isMaintenance) setSelectedTime(t)
                    }}
                    disabled={isMaintenance}
                    className={cn(
                      'py-2.5 rounded-xl text-sm font-medium border transition-all flex flex-col items-center justify-center leading-tight',
                      isMaintenance
                        ? 'border-orange-200 bg-orange-50 text-orange-500 cursor-not-allowed'
                        : selected
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-hover)]'
                    )}
                  >
                    <span>{t.start}-{t.end}</span>
                    {isMaintenance && <span className="mt-0.5 text-[10px] font-bold">维护中</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">当前门店暂无可用时段</p>
          )}
        </div>

        {/* 人数 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent-primary)]" />
              <span className="text-sm font-bold text-[var(--text-primary)]">体验人数</span>
            </div>
            <Stepper value={personCount} min={1} max={maxPeople} onChange={setPersonCount} />
          </div>
          <p className="text-xs text-[var(--text-muted)]">该套餐最多支持 {maxPeople} 人同时体验</p>
        </div>

        {/* 联系人 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">联系人</span>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">姓名 <span className="text-[var(--error)]">*</span></label>
            <input
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="请输入姓名"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">手机号 <span className="text-[var(--error)]">*</span></label>
            <input
              type="tel"
              value={personPhone}
              onChange={(e) => setPersonPhone(e.target.value)}
              placeholder="请输入手机号"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
        </div>

        {/* 提示 */}
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            <p className="text-xs text-orange-600/90 leading-relaxed">
              请按预约时间提前到店进行佩戴教学。预约成功后可在「订单详情」查看二维码，到店出示即可核销入场。
            </p>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 px-4 py-3 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-xl text-[var(--error)] text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[var(--border-subtle)]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="text-sm text-[var(--text-secondary)]">
            {selectedTime ? (
              <span>
                {selectedDate} {selectedTime.start}-{selectedTime.end}
              </span>
            ) : (
              '请选择时间'
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={redeemMutation.isPending}
            className={cn(
              'h-10 px-6 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.97]',
              redeemMutation.isPending
                ? 'bg-[var(--accent-primary)]/50 cursor-not-allowed'
                : 'bg-gradient-accent shadow-glow hover:shadow-glow-sm'
            )}
          >
            {redeemMutation.isPending ? '提交中...' : '确认预约'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
