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
  originalAmount?: number
  couponDiscount?: number
  userCouponId?: string | null
  userCoupon?: { name: string; type: string; discountRate?: number | null; source?: string | null } | null
  metadata?: Record<string, any> | null
  status: string
  payMethod: string | null
  paidAt: string | null
  cancelledAt: string | null
  refundAmount: number | null
  bookingTime: string
  expireAt: string | null
  createdAt: string
  updatedAt: string
  quantity: number
  verifyCode: string | null
  orderKind?: string
  feeType?: string | null
  feeReason?: string | null
  parentOrderId?: string | null
  parentOrder?: { id: string; orderNo: string } | null
  feeOrders?: { id: string; orderNo: string; amount: number; status: string; feeType?: string | null; feeReason?: string | null; paidAt?: string | null }[]
  groupBuyPackage?: {
    id: string
    title: string
    label: string
    coverImage?: string | null
    totalGroupPrice: number
    originalPricePerPerson: number
    maxPeople: number
    game?: { id: string; title: string; duration?: number | null; coverImage?: string | null } | null
    venues: { id: string; name: string; address?: string | null; openTime?: string | null; closeTime?: string | null; phone?: string | null; image?: string | null; status?: string | null; maintenanceStartDate?: string | null; maintenanceEndDate?: string | null; maintenanceStartTime?: string | null; maintenanceEndTime?: string | null }[]
  } | null
  booking?: {
    id: string
    date?: string
    startTime?: string
    endTime?: string
    personName?: string
    personPhone?: string
    personCount?: number
    venue?: { id: string; name: string; address?: string | null; image?: string | null } | null
    game?: { id: string; title: string; duration?: number | null; coverImage?: string | null } | null
  } | null
}

export interface OrderInput {
  bookingId?: string
  venueId?: string
  venueName?: string
  amount: number
  bookingTime?: string
  userId?: string
  customer?: string
  phone?: string
  source?: 'ONLINE' | 'OFFLINE'
  payMethod?: string
  userCouponId?: string
  groupBuyPackageId?: string
  quantity?: number
  thirdPartyCouponCode?: string
}

export async function getOrders(params?: {
  status?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/orders', { params })
  return res.data
}

export async function getOrder(id: string) {
  const res = await apiClient.get(`/orders/${id}`)
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

export async function cancelOrder(id: string, reason?: string) {
  const res = await apiClient.put(`/orders/${id}/cancel`, { reason })
  return res.data.data
}

export interface RedeemInput {
  venueId: string
  date: string
  startTime: string
  endTime: string
  personName: string
  personPhone: string
  personCount: number
  note?: string
  type?: 'TEAM' | 'INDIVIDUAL' | 'CORPORATE'
}

export async function redeemOrder(id: string, input: RedeemInput) {
  const res = await apiClient.post(`/orders/${id}/redeem`, input)
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
