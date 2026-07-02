type CancellationOrder = {
  orderKind: string
  metadata?: Record<string, any> | null
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
