type CancellationOrder = {
  orderKind: string
  metadata?: Record<string, any> | null
}

type GroupBuyRelatedOrder = CancellationOrder & {
  parentOrderId?: string | null
  amount?: number | null
}

export function isRedeemedGroupBuyBookingOrder(order: CancellationOrder): boolean {
  return order.orderKind === 'NORMAL' && Boolean(order.metadata?.redeemedFromOrderId)
}

export function calculateCancelableRefundAmount(input: {
  order: CancellationOrder
  isPaidOrder: boolean
  amount: number
  refundRate: number
}): number {
  if (isRedeemedGroupBuyBookingOrder(input.order)) return 0
  return input.isPaidOrder ? Math.floor((input.amount || 0) * input.refundRate) : 0
}

export function calculateGroupBuyRedemptionFinancialAmount(order: GroupBuyRelatedOrder): number {
  if (isRedeemedGroupBuyBookingOrder(order)) return 0
  return order.amount || 0
}

export function resolveGroupBuyRelatedOrderNo(order: GroupBuyRelatedOrder): string | null {
  const metadata = order.metadata || {}
  return metadata.redeemedFromOrderNo || metadata.redeemedOrderNo || order.parentOrderId || null
}
