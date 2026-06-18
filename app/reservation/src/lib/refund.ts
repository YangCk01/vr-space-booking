import type { RefundTier, RefundRules } from '@/api/settings'

export function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export interface RefundInfo {
  rate: number
  refundAmount: number
  refundText: string
  canCancel: boolean
  deadlineText: string
  isExpired: boolean
  activeTier: RefundTier | null
}

export function getRefundInfo(
  order: any,
  tiers: RefundTier[],
  cancelHours: number
): RefundInfo {
  const booking = order?.booking
  if (!booking?.date || !booking?.startTime) {
    return {
      rate: 0,
      refundAmount: 0,
      refundText: '¥0.00',
      canCancel: true,
      deadlineText: '',
      isExpired: false,
      activeTier: null,
    }
  }
  const startDate = new Date(booking.date)
  const [h, m] = booking.startTime.split(':')
  startDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  const now = new Date()
  const diffMs = startDate.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  const sorted = [...tiers].sort((a, b) => b.hours - a.hours)
  let activeTier: RefundTier | null = null
  for (const tier of sorted) {
    if (diffHours >= tier.hours) {
      activeTier = tier
      break
    }
  }
  const rate = activeTier ? activeTier.rate / 100 : 0

  const refundAmount = Math.floor((order.amount || 0) * rate)
  const refundText = `¥${(refundAmount / 100).toFixed(2)}`

  let deadlineText = ''
  if (diffHours > cancelHours) {
    const d = new Date(startDate.getTime() - cancelHours * 60 * 60 * 1000)
    if (cancelHours >= 24) {
      deadlineText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 前可取消`
    } else {
      deadlineText = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 前可取消`
    }
  } else if (diffHours > 0) {
    deadlineText = `开场前${cancelHours}小时内不可取消`
  } else {
    deadlineText = '已开场，不可取消'
  }

  return {
    rate,
    refundAmount,
    refundText,
    canCancel: diffHours > cancelHours,
    deadlineText,
    isExpired: diffHours <= cancelHours,
    activeTier,
  }
}

export function canReschedule(order: any, lifecycle: any) {
  if (!['PAID', 'READY_TO_VERIFY'].includes(order.status)) return false
  const booking = order?.booking
  if (!booking?.date || !booking?.startTime) return false
  const startDate = new Date(booking.date)
  const [h, m] = booking.startTime.split(':')
  startDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  const now = new Date()
  const minutesSinceStart = (now.getTime() - startDate.getTime()) / (1000 * 60)
  const allowAfterStart = lifecycle?.rescheduleAllowAfterStart ?? true
  const afterStartMinutes = lifecycle?.rescheduleAfterStartMinutes ?? 15
  if (minutesSinceStart > afterStartMinutes) return false
  if (minutesSinceStart > 0 && !allowAfterStart) return false
  return true
}

export function formatAmount(amount?: number | null) {
  return `¥${((amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
