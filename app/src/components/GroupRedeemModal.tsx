import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Ticket, Calendar, Clock, User, Phone, Users, MapPin, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOrders, redeemOrder, type RedeemInput } from '@/api/orders'
import { getVenues } from '@/api/venues'
import type { Venue } from '@/api/venues'
import { toast } from 'sonner'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

interface GroupRedeemModalProps {
  open: boolean
  onClose: () => void
  code: string
  onSuccess?: () => void
}

export default function GroupRedeemModal({ open, onClose, code, onSuccess }: GroupRedeemModalProps) {
  const queryClient = useQueryClient()
  const toastSuccess = (msg: string) => toast.success(msg)
  const toastError = (msg: string) => toast.error(msg)
  const [searchCode, setSearchCode] = useState('')

  const { data: orderRes, isLoading: orderLoading, error: orderError } = useQuery({
    queryKey: ['group-redeem-order', searchCode],
    queryFn: () => getOrders({ search: searchCode, orderKind: 'NORMAL', pageSize: 1 }),
    enabled: !!searchCode,
  })

  const { data: venuesRes, isLoading: venuesLoading } = useQuery({
    queryKey: ['venues-all'],
    queryFn: () => getVenues({ pageSize: 1000 }),
  })

  const order = orderRes?.data?.[0]
  const pkg = order?.groupBuyPackage
  const allowedVenueIds: string[] = pkg?.venues?.map((v: any) => v.id) || []
  const allVenues: Venue[] = venuesRes?.data || []
  const venues = useMemo(() => {
    if (allowedVenueIds.length === 0) return allVenues
    return allVenues.filter((v) => allowedVenueIds.includes(v.id))
  }, [allVenues, allowedVenueIds])

  const [form, setForm] = useState({
    venueId: '',
    date: '',
    startTime: '',
    endTime: '',
    personName: '',
    personPhone: '',
    personCount: 1,
    note: '',
    type: 'TEAM' as 'TEAM' | 'INDIVIDUAL' | 'CORPORATE',
  })
  const [confirmOpen, setConfirmOpen] = useState(false)

  const initRef = useRef<string | null>(null)

  // 打开时根据传入 code 查询；关闭时重置
  useEffect(() => {
    if (open) {
      setSearchCode(code)
    } else {
      initRef.current = null
      setSearchCode('')
      setForm({
        venueId: '',
        date: '',
        startTime: '',
        endTime: '',
        personName: '',
        personPhone: '',
        personCount: 1,
        note: '',
        type: 'TEAM',
      })
      setConfirmOpen(false)
    }
  }, [open, code])

  useEffect(() => {
    if (order && venues.length > 0 && initRef.current !== order.id) {
      initRef.current = order.id
      const booking = order.booking
      const bookingDate = booking?.date
        ? typeof booking.date === 'string'
          ? booking.date.slice(0, 10)
          : new Date(booking.date).toISOString().slice(0, 10)
        : ''
      const bookingVenueId = booking?.venueId || order.venueId
      const defaultVenueId = bookingVenueId && venues.some((v) => v.id === bookingVenueId)
        ? bookingVenueId
        : venues[0]?.id
      const personCount = pkg?.maxPeople ? pkg.maxPeople * (order.quantity || 1) : (booking?.personCount || 1)
      setForm({
        venueId: defaultVenueId || '',
        date: bookingDate,
        startTime: booking?.startTime || '',
        endTime: booking?.endTime || '',
        personName: booking?.personName || order.user?.name || '',
        personPhone: booking?.personPhone || order.user?.phone || '',
        personCount,
        note: booking?.note || '',
        type: 'TEAM',
      })
    }
  }, [order, venues, pkg])

  const selectedVenue = venues.find((v) => v.id === form.venueId)
  const gameDuration = pkg?.game?.duration || 30
  const timeSlots = useMemo(() => {
    if (!selectedVenue) return []
    const startMin = timeToMinutes(selectedVenue.openTime || '10:00')
    const endMin = timeToMinutes(selectedVenue.closeTime || '22:00')
    const step = gameDuration

    const now = new Date()
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const isToday = form.date === todayStr
    const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1

    const slots: { start: string; end: string }[] = []
    for (let s = startMin; s + gameDuration <= endMin; s += step) {
      if (isToday && s <= nowMinutes) continue
      slots.push({ start: minutesToTime(s), end: minutesToTime(s + gameDuration) })
    }
    return slots
  }, [selectedVenue, gameDuration, form.date])

  const redeemMutation = useMutation({
    mutationFn: (input: RedeemInput) => redeemOrder(input),
    onSuccess: () => {
      toastSuccess('团购券核销成功')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      onSuccess?.()
      onClose()
    },
    onError: (err: any) => {
      toastError(err?.response?.data?.message || '核销失败，请检查时间段是否冲突')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!order) return
    if (!form.venueId || !form.date || !form.startTime || !form.endTime || !form.personName || !form.personPhone) {
      toastError('请完善预约信息')
      return
    }
    setConfirmOpen(true)
  }

  const submitRedeem = (completed: boolean) => {
    if (!order) return
    redeemMutation.mutate({
      verifyCode: order.verifyCode || undefined,
      venueId: form.venueId,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      personName: form.personName,
      personPhone: form.personPhone,
      personCount: Number(form.personCount),
      note: form.note,
      type: form.type,
      completed,
    })
    setConfirmOpen(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex justify-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl h-full bg-vrbg-card border-l border-vrborder-subtle shadow-2xl overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-vrborder-subtle bg-vrbg-card/95 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vraccent-primary/10 flex items-center justify-center">
                  <Ticket className="w-5 h-5 text-vraccent-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-vrtext-primary">团购券核销</h2>
                  <p className="text-xs text-vrtext-secondary">扫码识别团购券订单并绑定预约</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-vrbg-elevated text-vrtext-muted hover:text-vrtext-primary flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {orderLoading && (
                <div className="flex items-center justify-center py-12 text-vrtext-muted text-sm">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  查询中...
                </div>
              )}

              {orderError && (
                <div className="rounded-xl p-4 bg-vrerror/10 border border-vrerror/20 text-vrerror text-sm">
                  查询失败，请检查券码是否正确
                </div>
              )}

              {!order && searchCode && !orderLoading && !orderError && (
                <div className="text-center py-12 text-vrtext-muted text-sm">
                  未找到符合条件的团购券订单
                </div>
              )}

              {order && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* 券信息 */}
                  <div className="rounded-xl border border-vrborder-subtle bg-vrbg-elevated p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-vrtext-muted">券码</span>
                      <span className="text-sm font-mono font-bold text-vraccent-primary">{order.verifyCode}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-vrtext-muted">订单号</span>
                      <span className="text-xs text-vrtext-primary">{order.orderNo}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-vrtext-muted">套餐</span>
                      <span className="text-sm font-medium text-vrtext-primary">{pkg?.title || '团购套餐'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-vrtext-muted">适用门店</span>
                      <span className="text-xs text-vrtext-primary">{pkg?.venues?.length ? pkg.venues.map((v: any) => v.name).join('、') : '不限'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-vrtext-muted">份数 / 人数</span>
                      <span className="text-xs text-vrtext-primary">{order.quantity || 1}份 · 每份{pkg?.maxPeople || 1}人</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-vrtext-muted">实付金额</span>
                      <span className="text-base font-bold text-vrerror">¥{((order.amount || 0) / 100).toFixed(2)}</span>
                    </div>
                    {order.user && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-vrtext-muted">购买用户</span>
                        <span className="text-xs text-vrtext-primary">{order.user.name} {order.user.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* 预约表单 */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-vrtext-secondary flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />适用门店
                        </label>
                        {order.booking ? (
                          <div className="w-full h-10 px-3 rounded-lg bg-vrbg-elevated border border-vrborder-subtle text-vr-body-sm text-vrtext-primary flex items-center">
                            {venues.find((v) => v.id === form.venueId)?.name || form.venueId || '-'}
                          </div>
                        ) : (
                          <select
                            value={form.venueId}
                            onChange={(e) => setForm((p) => ({ ...p, venueId: e.target.value }))}
                            className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                          >
                            <option value="">请选择门店</option>
                            {venues.map((v) => (
                              <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-vrtext-secondary flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />日期
                        </label>
                        {order.booking ? (
                          <div className="w-full h-10 px-3 rounded-lg bg-vrbg-elevated border border-vrborder-subtle text-vr-body-sm text-vrtext-primary flex items-center">
                            {form.date || '-'}
                          </div>
                        ) : (
                          <input
                            type="date"
                            value={form.date}
                            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                            className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                            required
                          />
                        )}
                      </div>

                      <div className="col-span-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-vrtext-secondary flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />选择时间
                          </label>
                          <span className="text-xs text-vrtext-muted">每场 {gameDuration} 分钟</span>
                        </div>
                        {order.booking ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="w-full h-10 px-3 rounded-lg bg-vrbg-elevated border border-vrborder-subtle text-vr-body-sm text-vrtext-primary flex items-center">
                              开始 {form.startTime || '-'}
                            </div>
                            <div className="w-full h-10 px-3 rounded-lg bg-vrbg-elevated border border-vrborder-subtle text-vr-body-sm text-vrtext-primary flex items-center">
                              结束 {form.endTime || '-'}
                            </div>
                          </div>
                        ) : timeSlots.length > 0 ? (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {timeSlots.map((t) => (
                              <button
                                key={`${t.start}-${t.end}`}
                                type="button"
                                onClick={() => setForm((p) => ({ ...p, startTime: t.start, endTime: t.end }))}
                                className={cn(
                                  'py-2 rounded-lg text-xs font-medium border transition-all',
                                  form.startTime === t.start && form.endTime === t.end
                                    ? 'bg-vraccent-primary text-white border-vraccent-primary'
                                    : 'bg-vrbg-surface text-vrtext-primary border-vrborder-subtle hover:border-vraccent-primary hover:text-vraccent-primary'
                                )}
                              >
                                {t.start}-{t.end}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="w-full h-10 px-3 rounded-lg bg-vrbg-elevated border border-vrborder-subtle text-vr-body-sm text-vrtext-muted flex items-center">
                            请先选择适用门店和日期
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-vrtext-secondary flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />联系人
                        </label>
                        <input
                          type="text"
                          value={form.personName}
                          onChange={(e) => setForm((p) => ({ ...p, personName: e.target.value }))}
                          placeholder="到店联系人姓名"
                          className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-vrtext-secondary flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />联系电话
                        </label>
                        <input
                          type="tel"
                          value={form.personPhone}
                          onChange={(e) => setForm((p) => ({ ...p, personPhone: e.target.value }))}
                          placeholder="联系人手机号"
                          className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-vrtext-secondary flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />人数
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={form.personCount}
                          onChange={(e) => setForm((p) => ({ ...p, personCount: parseInt(e.target.value) || 1 }))}
                          className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-vrtext-secondary">预约类型</label>
                        <select
                          value={form.type}
                          onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))}
                          className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                        >
                          <option value="TEAM">团队</option>
                          <option value="INDIVIDUAL">散客</option>
                          <option value="CORPORATE">企业</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-vrtext-secondary">备注</label>
                      <textarea
                        value={form.note}
                        onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                        placeholder="选填"
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setForm({
                            venueId: '',
                            date: '',
                            startTime: '',
                            endTime: '',
                            personName: '',
                            personPhone: '',
                            personCount: 1,
                            note: '',
                            type: 'TEAM',
                          })
                        }}
                        className="h-10 px-5 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-sm hover:bg-vrbg-elevated transition-colors"
                      >
                        重置
                      </button>
                      <button
                        type="submit"
                        disabled={redeemMutation.isPending || venuesLoading}
                        className="h-10 px-6 rounded-lg bg-vraccent-primary text-white text-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {redeemMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        <CheckCircle2 className="w-4 h-4" />
                        确认订单
                      </button>
                    </div>
                  </form>

                  {/* 核销确认弹窗 */}
                  <AnimatePresence>
                    {confirmOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => !redeemMutation.isPending && setConfirmOpen(false)}
                      >
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0, y: 20 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={{ scale: 0.95, opacity: 0, y: 20 }}
                          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full max-w-sm bg-vrbg-card border border-vrborder-subtle rounded-2xl shadow-2xl overflow-hidden"
                        >
                          <div className="px-5 py-4 border-b border-vrborder-subtle">
                            <h3 className="text-base font-bold text-vrtext-primary">确认核销？</h3>
                          </div>
                          <div className="px-5 py-4 space-y-3">
                            <p className="text-sm text-vrtext-secondary leading-relaxed">
                              该团购券尚未在线预约。点击「确认核销」将直接完成核销；点击「仅创建预约」将按所选时间创建预约，订单状态会按核销提前量自动判断。
                            </p>
                            <div className="rounded-xl bg-vrbg-elevated p-3 text-xs text-vrtext-secondary space-y-1.5">
                              <div className="flex justify-between"><span>门店</span><span className="text-vrtext-primary">{venues.find((v) => v.id === form.venueId)?.name || '-'}</span></div>
                              <div className="flex justify-between"><span>日期</span><span className="text-vrtext-primary">{form.date}</span></div>
                              <div className="flex justify-between"><span>时间</span><span className="text-vrtext-primary">{form.startTime}-{form.endTime}</span></div>
                              <div className="flex justify-between"><span>联系人</span><span className="text-vrtext-primary">{form.personName} {form.personPhone}</span></div>
                            </div>
                          </div>
                          <div className="px-5 py-4 flex items-center justify-end gap-3 border-t border-vrborder-subtle">
                            <button
                              type="button"
                              onClick={() => setConfirmOpen(false)}
                              disabled={redeemMutation.isPending}
                              className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-sm hover:bg-vrbg-elevated transition-colors disabled:opacity-50"
                            >
                              关闭
                            </button>
                            <button
                              type="button"
                              onClick={() => submitRedeem(false)}
                              disabled={redeemMutation.isPending}
                              className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vrtext-primary text-sm hover:bg-vrbg-elevated transition-colors disabled:opacity-50"
                            >
                              仅创建预约
                            </button>
                            <button
                              type="button"
                              onClick={() => submitRedeem(true)}
                              disabled={redeemMutation.isPending}
                              className="h-9 px-4 rounded-lg bg-vrsuccess text-white text-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                              {redeemMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                              确认核销
                            </button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
