export type OrderPaymentState = 'PAYABLE' | 'PAID' | 'UNAVAILABLE'

const paidLifecycleStatuses = new Set([
  'PAID',
  'READY_TO_VERIFY',
  'PLAYING',
  'COMPLETED',
  'NO_SHOW',
  'REFUNDING',
  'REFUNDED',
])

export function classifyOrderPaymentState(status?: string | null): OrderPaymentState {
  if (status === 'PENDING') return 'PAYABLE'
  if (status && paidLifecycleStatuses.has(status)) return 'PAID'
  return 'UNAVAILABLE'
}
