import { apiClient } from './client'

export interface PointsProduct {
  id: string
  name: string
  description: string | null
  image: string | null
  type: 'EXPERIENCE_TICKET' | 'PHYSICAL_GOOD' | 'COUPON'
  pointsCost: number
  discountRate: number | null
  validityDays: number | null
  stock: number
  status: 'ON_SALE' | 'OFF_SALE' | 'SOLD_OUT'
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PointsProductInput {
  name: string
  description?: string
  image?: string
  type: 'EXPERIENCE_TICKET' | 'PHYSICAL_GOOD' | 'COUPON'
  pointsCost: number
  discountRate?: number
  validityDays?: number | null
  stock?: number
  sortOrder?: number
}

export async function getPointsProducts(params?: { type?: string; status?: string }) {
  const res = await apiClient.get('/points/products', { params })
  return res.data.data as PointsProduct[]
}

export async function createPointsProduct(input: PointsProductInput) {
  const res = await apiClient.post('/points/products', input)
  return res.data.data as PointsProduct
}

export async function updatePointsProduct(id: string, input: Partial<PointsProductInput>) {
  const res = await apiClient.put(`/points/products/${id}`, input)
  return res.data.data as PointsProduct
}

export async function deletePointsProduct(id: string) {
  const res = await apiClient.delete(`/points/products/${id}`)
  return res.data.data
}

export interface PointsOrder {
  id: string
  orderNo: string
  userId: string
  productId: string
  productName: string
  productType: string
  pointsCost: number
  quantity: number
  deliveryType: 'PICKUP' | 'DELIVERY' | null
  recipientName: string | null
  recipientPhone: string | null
  address: string | null
  status: 'PENDING' | 'SHIPPED' | 'COMPLETED' | 'RETURNED' | 'CANCELLED'
  trackingNumber: string | null
  shippedAt: string | null
  returnReason: string | null
  returnedAt: string | null
  adminNote: string | null
  createdAt: string
  updatedAt: string
  product?: { id: string; name: string; image: string | null }
  user?: { id: string; name: string; phone: string }
}

export async function getAllPointsOrders(params?: { status?: string; page?: number; pageSize?: number }) {
  const res = await apiClient.get('/points/orders/all', { params })
  return {
    list: res.data.data as PointsOrder[],
    total: res.data.meta?.total || 0,
    page: res.data.meta?.page || 1,
    pageSize: res.data.meta?.pageSize || 20,
  }
}

export async function shipPointsOrder(id: string, trackingNumber?: string) {
  const res = await apiClient.put(`/points/orders/${id}/ship`, { trackingNumber })
  return res.data.data as PointsOrder
}

export async function completePointsOrder(id: string) {
  const res = await apiClient.put(`/points/orders/${id}/complete`)
  return res.data.data as PointsOrder
}

export async function approvePointsReturn(id: string) {
  const res = await apiClient.put(`/points/orders/${id}/approve-return`)
  return res.data.data
}
