import { apiClient } from './client'

export interface Order {
  id: string
  orderNo: string
  bookingId: string | null
  userId: string | null
  user?: { name: string; phone: string }
  venueId: string
  venueName: string
  amount: number
  status: string
  source?: 'ONLINE' | 'OFFLINE'
  payMethod: string | null
  couponDiscount?: number
  metadata?: Record<string, any> | null
  paidAt: string | null
  cancelledAt: string | null
  refundAmount: number | null
  bookingTime: string
  verifyCode?: string | null
  quantity?: number
  groupBuyPackageId?: string | null
  groupBuyPackage?: {
    id: string
    title: string
    label?: string
    coverImage?: string | null
    maxPeople?: number
    venues?: { id: string; name: string }[]
  }
  booking?: {
    game?: { title: string }
    personCount?: number
    personName?: string
    personPhone?: string
  }
  createdAt: string
  updatedAt: string
}

export interface OrderInput {
  bookingId?: string
  venueId: string
  venueName: string
  amount: number
  bookingTime: string
  userId?: string
  customer?: string
  phone?: string
  source?: 'ONLINE' | 'OFFLINE'
  payMethod?: 'BALANCE' | 'CASH' | 'CARD'
  thirdPartyCouponCode?: string
}

export async function getOrders(params?: {
  status?: string
  search?: string
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  source?: string
  orderType?: string
  orderKind?: string
  feeType?: string
  refundStatus?: string
  parentOrderNo?: string
}) {
  const res = await apiClient.get('/orders', { params })
  return res.data
}

export async function getOrder(id: string) {
  const res = await apiClient.get(`/orders/${id}`)
  return res.data.data
}

export async function getOrderByNo(orderNo: string) {
  const res = await apiClient.get(`/orders/by-no/${encodeURIComponent(orderNo)}`)
  return res.data.data
}

export async function createOrder(input: OrderInput) {
  const res = await apiClient.post('/orders', input)
  return res.data.data
}

export async function payOrder(id: string, method?: string, thirdPartyCouponCode?: string) {
  const res = await apiClient.put(`/orders/${id}/pay`, { method, thirdPartyCouponCode })
  return res.data.data
}

export async function cancelOrder(id: string) {
  const res = await apiClient.put(`/orders/${id}/cancel`)
  return res.data.data
}

export async function refundOrder(id: string, amount?: number, reason?: string) {
  const res = await apiClient.put(`/orders/${id}/refund`, { amount, reason })
  return res.data.data
}

export async function noShowDisposition(
  id: string,
  payload: { action: 'NO_REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND'; amount?: number; reason: string }
) {
  const res = await apiClient.post(`/orders/${id}/no-show-disposition`, payload)
  return res.data.data
}

export async function verifyOrder(id: string) {
  const res = await apiClient.put(`/orders/${id}/status`, { status: 'COMPLETED' })
  return res.data.data
}

export async function completeRefundOrder(id: string) {
  const res = await apiClient.put(`/orders/${id}/status`, { status: 'REFUNDED' })
  return res.data.data
}

export async function batchVerifyOrders(ids: string[]) {
  const res = await apiClient.post('/orders/batch-verify', { ids })
  return res.data
}

export async function batchRefundOrders(ids: string[], reason: string) {
  const res = await apiClient.post('/orders/batch-refund', { ids, reason })
  return res.data
}

export async function markNoShow(id: string, reason?: string) {
  const res = await apiClient.post(`/orders/${id}/mark-no-show`, { reason })
  return res.data
}

export async function activateOrder(id: string, reason?: string) {
  const res = await apiClient.post(`/orders/${id}/activate`, { reason })
  return res.data
}

export interface RedeemInput {
  verifyCode?: string
  id?: string
  venueId: string
  date: string
  startTime: string
  endTime: string
  personName: string
  personPhone: string
  personCount: number
  note?: string
  title?: string
  gameId?: string
  type?: 'TEAM' | 'INDIVIDUAL' | 'CORPORATE'
  completed?: boolean
}

export async function redeemOrder(input: RedeemInput) {
  const res = await apiClient.post('/orders/redeem', input)
  return res.data.data
}
