import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, AlertCircle, Coins } from 'lucide-react'
import { createBooking, checkConflict } from '@/api/bookings'
import { createOrder, payOrder } from '@/api/orders'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import Stepper from '@/components/Stepper'
import { apiClient } from '@/api/client'

interface LocationState {
  venueId: string
  venueName: string
  venueImage?: string
  date: string
  startTime: string
  endTime: string
  gamePrice: number
  gameId?: string
  slotStatus?: string
  currentCount?: number
  remainingCount?: number
  maxCount?: number
}

export default function OrderConfirm() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const state = location.state as LocationState | null
  const { user, isLoggedIn } = useAuth()

  const { data: memberConfig } = useQuery({
    queryKey: ['member-public-config'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/member-public')
      return res.data.data as {
        levels: Array<{ key: string; name: string; discount: number }>
        points: { earnRate: number; deductRate: number }
      }
    },
    enabled: isLoggedIn,
  })

  const currentLevel = memberConfig?.levels?.find((l) => l.key === user?.level || l.key === ({ VIP_PLUS: 'VIP+' } as any)[user?.level || ''])
  const discount = currentLevel?.discount ?? 100

  const [personCount, setPersonCount] = useState(1)
  const [personName, setPersonName] = useState('')
  const [personPhone, setPersonPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'balance'>('wechat')
  const [usePoints, setUsePoints] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [slotInfo, setSlotInfo] = useState<{ status: string; currentCount: number; remainingCount: number; maxCount: number } | null>(null)

  // 实时校验时段状态
  useEffect(() => {
    if (!state) return
    const { venueId, date, startTime, endTime, gameId, remainingCount } = state
    checkConflict({ venueId, date, startTime, endTime, gameId }).then((res: any) => {
      setSlotInfo(res)
      // 如果人数超过剩余可拼人数，自动调整
      if (res.remainingCount > 0 && personCount > res.remainingCount) {
        setPersonCount(res.remainingCount)
      }
    }).catch(() => {
      setSlotInfo({ status: state.slotStatus || 'available', currentCount: state.currentCount || 0, remainingCount: remainingCount || 10, maxCount: state.maxCount || 10 })
    })
  }, [state])

  // 已登录时自动填充联系人信息
  useEffect(() => {
    if (isLoggedIn && user) {
      if (!personName) setPersonName(user.name || '')
      if (!personPhone) setPersonPhone(user.phone || '')
    }
  }, [isLoggedIn, user])

  const createBookingMutation = useMutation({ mutationFn: createBooking })
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!state) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)]">
        <p className="text-sm">页面参数错误</p>
        <button onClick={() => navigate('/')} className="mt-4 text-[var(--accent-primary)] text-sm">返回首页</button>
      </div>
    )
  }

  const { venueId, venueName, venueImage, date, startTime, endTime, gamePrice, gameId } = state
  const effectiveRemaining = slotInfo?.remainingCount ?? state.remainingCount ?? 10
  const effectiveStatus = slotInfo?.status ?? state.slotStatus ?? 'available'
  const effectiveCurrent = slotInfo?.currentCount ?? state.currentCount ?? 0
  const effectiveMax = slotInfo?.maxCount ?? state.maxCount ?? 10

  const durationMin =
    (parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])) -
    (parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]))
  const totalPrice = gamePrice * personCount
  const totalFen = Math.round(totalPrice * 100)

  // 1. 先算会员折扣
  const discountedFen = Math.round(totalFen * discount / 100)

  // 2. 再算积分抵扣（基于折扣后金额，积分不打折）
  const deductRate = memberConfig?.points?.deductRate ?? 100
  const userPoints = user?.points || 0
  // 最大可用积分：最多覆盖折扣后金额
  const maxPointsNeeded = Math.ceil(discountedFen / 100) * deductRate
  const maxPointsCanUse = Math.min(userPoints, maxPointsNeeded)
  const pointsToUse = usePoints && isLoggedIn ? maxPointsCanUse : 0
  const pointsDeductionFen = Math.floor(pointsToUse * 100 / deductRate)
  // 限制积分抵扣不超过折扣后金额
  const actualPointsDeductionFen = Math.min(pointsDeductionFen, discountedFen)
  const remainingFen = Math.max(0, discountedFen - actualPointsDeductionFen)
  const finalPrice = remainingFen / 100
  const pointsDeductionAmount = actualPointsDeductionFen / 100

  const handlePay = async () => {
    if (!personName.trim() || !personPhone.trim()) {
      setErrorMsg('请填写预约人姓名和联系电话')
      return
    }

    // 纯积分抵扣时强制走余额支付分支（后端只扣积分不扣余额）
    const effectivePayMethod = remainingFen === 0 && pointsToUse > 0 ? 'balance' : paymentMethod

    // 积分抵扣仅支持余额支付（在线支付+积分抵扣需后续扩展）
    if (pointsToUse > 0 && remainingFen > 0 && effectivePayMethod !== 'balance') {
      setErrorMsg('积分抵扣仅支持余额支付，请选择余额支付或关闭积分抵扣')
      return
    }

    // 余额支付检查（考虑积分抵扣后剩余金额）
    if (effectivePayMethod === 'balance') {
      const balance = user?.balance || 0
      const need = remainingFen
      if (balance < need) {
        setErrorMsg(`余额不足，当前余额 ¥${balance / 100}，还需 ¥${(need - balance) / 100}`)
        return
      }
    }

    setErrorMsg('')
    setIsSubmitting(true)

    try {
      // 前置冲突检查：避免下单过程中时段被他人预约
      const conflictCheck = await checkConflict({
        venueId,
        date,
        startTime,
        endTime,
        gameId,
      })
      if (conflictCheck.status === 'full' || conflictCheck.status === 'occupied_by_other_game') {
        setErrorMsg('该时段已无法预约，请选择其他时间')
        setIsSubmitting(false)
        return
      }
      if (personCount > conflictCheck.remainingCount) {
        setErrorMsg(`该时段仅剩 ${conflictCheck.remainingCount} 个位置，请减少人数`)
        setIsSubmitting(false)
        return
      }

      const booking = await createBookingMutation.mutateAsync({
        venueId,
        type: 'INDIVIDUAL',
        date,
        startTime,
        endTime,
        personName,
        personPhone,
        personCount,
        title: `${venueName}预约`,
        gameId,
      })

      if (booking?.id) {
        const order = await createOrder({
          bookingId: booking.id,
          venueId,
          venueName,
          amount: Math.round(totalPrice * 100),
          bookingTime: `${date} ${startTime}-${endTime}`,
          customer: personName,
          phone: personPhone,
          source: 'ONLINE',
          payMethod: effectivePayMethod === 'balance' ? 'BALANCE' : undefined,
          pointsUsed: pointsToUse > 0 ? pointsToUse : undefined,
        })
        // 非余额支付：完成支付流程
        if (effectivePayMethod !== 'balance' && order?.id && remainingFen > 0) {
          await payOrder(order.id, effectivePayMethod === 'wechat' ? 'WECHAT' : 'ALIPAY')
        }
        queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
        queryClient.invalidateQueries({ queryKey: ['orders'] })
        await queryClient.invalidateQueries({ queryKey: ['rechargeConfig'] })
        navigate('/success', { state: { venueName, date, startTime, endTime, durationMin, totalPrice, personName, personCount, orderId: booking.id } })
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || '预约提交失败，请稍后重试'
      setErrorMsg(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const month = parseInt(date.split('-')[1])
  const day = parseInt(date.split('-')[2])
  const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date).getDay()]

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav-xl"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">确认订单</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Venue info */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">{venueName}</h2>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] mb-3">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />VR大空间体验店</span>
          </div>

          <div className="flex items-center gap-3 bg-[var(--bg-elevated)] rounded-lg p-3">
            {venueImage && (
              <img src={getImageUrl(venueImage)} alt={venueName} className="w-16 h-12 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {startTime}-{endTime} <span className="text-xs text-[var(--text-muted)]">({durationMin}分钟)</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">{month}月{day}日 {weekDay}</p>
            </div>
          </div>
        </div>

        {/* Person count */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">体验人数</span>
            <Stepper value={personCount} min={1} max={effectiveRemaining} onChange={setPersonCount} />
          </div>
          {effectiveStatus === 'joinable' ? (
            <p className="text-xs text-orange-500">
              该时段已有 {effectiveCurrent} 人预约，您最多可再约 {effectiveRemaining} 人
            </p>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">1人起订，请按实际人数填写</p>
          )}
        </div>

        {/* Contact info */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">联系人信息</h3>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">预约人姓名 <span className="text-[var(--error)]">*</span></label>
            <input
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="请输入姓名"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">联系电话 <span className="text-[var(--error)]">*</span></label>
            <input
              type="tel"
              value={personPhone}
              onChange={(e) => setPersonPhone(e.target.value)}
              placeholder="请输入手机号"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>
        </div>

        {/* Points deduction */}
        {isLoggedIn && user && userPoints > 0 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-[var(--text-primary)]">使用积分抵扣</span>
              </div>
              <button
                onClick={() => setUsePoints((v) => !v)}
                className={cn(
                  'w-11 h-6 rounded-full transition-colors relative',
                  usePoints ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-hover)]',
                )}
              >
                <div className={cn(
                  'w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform',
                  usePoints ? 'translate-x-5' : 'translate-x-0.5',
                )} />
              </button>
            </div>
            {usePoints && (
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                可用 {userPoints} 积分，抵扣 ¥{pointsDeductionAmount.toFixed(2)}
                {pointsToUse >= maxPointsCanUse && actualPointsDeductionFen < discountedFen && (
                  <span className="text-amber-500 ml-1">（积分不足全额抵扣）</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">支付方式</h3>
          <div className="space-y-2">
            {[
              { key: 'wechat' as const, label: '微信支付', sub: '使用微信支付' },
              { key: 'alipay' as const, label: '支付宝', sub: '使用支付宝支付' },
              ...(isLoggedIn && user ? [{
                key: 'balance' as const,
                label: '余额支付',
                sub: `当前余额 ¥${(user.balance || 0) / 100}${discount < 100 ? ` · 享${discount}折` : ''}${usePoints && actualPointsDeductionFen > 0 ? ` · 积分已抵¥${pointsDeductionAmount.toFixed(2)}` : ''}`,
                disabled: (user.balance || 0) < remainingFen,
              }] : []),
            ].map((m: any) => (
              <button
                key={m.key}
                onClick={() => !m.disabled && setPaymentMethod(m.key)}
                disabled={m.disabled}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                  m.disabled
                    ? 'border-[var(--border-subtle)] bg-transparent opacity-50 cursor-not-allowed'
                    : paymentMethod === m.key
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                      : 'border-[var(--border-subtle)] bg-transparent hover:border-[var(--border-hover)]',
                )}
              >
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                  paymentMethod === m.key ? 'border-[var(--accent-primary)]' : 'border-[var(--text-muted)]',
                )}>
                  {paymentMethod === m.key && <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[var(--text-primary)]">{m.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{m.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Price summary */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">体验费用</span>
            <span className="text-[var(--text-primary)]">¥{totalPrice.toFixed(2)}</span>
          </div>
          {actualPointsDeductionFen > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">积分抵扣</span>
              <span className="text-amber-500">-¥{pointsDeductionAmount.toFixed(2)}</span>
            </div>
          )}
          {discount < 100 && currentLevel && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">{currentLevel.name}优惠（{discount}折）</span>
              <span className="text-[var(--success)]">-¥{((totalFen - discountedFen) / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-primary)]">合计</span>
            <span className="text-lg font-bold text-[var(--error)]">¥{finalPrice.toFixed(2)}</span>
          </div>
          {(discount < 100 || actualPointsDeductionFen > 0) && (
            <p className="text-xs text-[var(--text-muted)] text-right">
              已省 ¥{(((totalFen - discountedFen) / 100) + pointsDeductionAmount).toFixed(2)}
            </p>
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-xl text-[var(--error)] text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </motion.div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-primary)]/95 backdrop-blur-md border-t border-[var(--border-subtle)]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--text-muted)]">待支付</span>
            <span className="text-lg font-bold text-[var(--error)] ml-2">¥{finalPrice.toFixed(2)}</span>
            {(discount < 100 || actualPointsDeductionFen > 0) && (
              <span className="text-xs text-[var(--text-muted)] line-through ml-1">¥{totalPrice.toFixed(2)}</span>
            )}
            {actualPointsDeductionFen > 0 && remainingFen === 0 && (
              <span className="text-xs text-amber-500 ml-1">（积分全额抵扣）</span>
            )}
          </div>
          <button
            onClick={handlePay}
            disabled={isSubmitting}
            className={cn(
              'h-10 px-6 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.97]',
              createBookingMutation.isPending
                ? 'bg-[var(--accent-primary)]/50 cursor-not-allowed'
                : 'bg-gradient-accent shadow-glow hover:shadow-glow-sm',
            )}
          >
            {isSubmitting ? '提交中...' : (remainingFen === 0 && actualPointsDeductionFen > 0 ? '确认抵扣' : '立即支付')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
