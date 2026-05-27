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
  payMethod: string | null
  paidAt: string | null
  cancelledAt: string | null
  refundAmount: number | null
  bookingTime: string
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
  payMethod?: 'BALANCE' | 'WECHAT' | 'ALIPAY'
}

export async function getOrders(params?: {
  status?: string
  search?: string
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
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

export async function payOrder(id: string, method?: string) {
  const res = await apiClient.put(`/orders/${id}/pay`, { method })
  return res.data.data
}

export async function cancelOrder(id: string) {
  const res = await apiClient.put(`/orders/${id}/cancel`)
  return res.data.data
}

export async function refundOrder(id: string, amount?: number) {
  const res = await apiClient.put(`/orders/${id}/refund`, { amount })
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
