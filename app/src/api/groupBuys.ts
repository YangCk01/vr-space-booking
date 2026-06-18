import { apiClient } from './client'

export interface GroupBuyPackage {
  id: string
  gameId: string
  title: string
  subtitle?: string | null
  type: string
  label: string
  minPeople: number
  maxPeople: number
  originalPricePerPerson: number
  groupPricePerPerson: number
  totalGroupPrice: number
  coverImage?: string | null
  tags: string[]
  status: string
  sortOrder: number
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  soldText: string
  refundTags: string[]
  packageItems: string[]
  processSteps: string[]
  notice?: string | null
  refundNotice?: string | null
  buyButtonText: string
  createdAt: string
  updatedAt: string
  venues: { id: string; name: string }[]
  game?: { id: string; title: string; coverImage?: string; duration: number }
}

export interface GroupBuyInput {
  gameId: string
  title: string
  subtitle?: string | null
  type: string
  label: string
  minPeople: number
  maxPeople: number
  originalPricePerPerson: number
  groupPricePerPerson: number
  totalGroupPrice: number
  coverImage?: string | null
  tags?: string[]
  status?: string
  sortOrder?: number
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  soldText?: string
  refundTags?: string[]
  packageItems?: string[]
  processSteps?: string[]
  notice?: string | null
  refundNotice?: string | null
  buyButtonText?: string
  venueIds?: string[]
}

export async function getGroupBuys(params?: { status?: string; type?: string; page?: number; pageSize?: number }) {
  const res = await apiClient.get('/group-buys', { params })
  return res.data.data as { data: GroupBuyPackage[]; total: number; page: number; pageSize: number; totalPages: number }
}

export async function getGroupBuy(id: string) {
  const res = await apiClient.get(`/group-buys/${id}`)
  return res.data.data as GroupBuyPackage
}

export async function createGroupBuy(data: GroupBuyInput) {
  const res = await apiClient.post('/group-buys', data)
  return res.data.data as GroupBuyPackage
}

export async function updateGroupBuy(id: string, data: Partial<GroupBuyInput>) {
  const res = await apiClient.put(`/group-buys/${id}`, data)
  return res.data.data as GroupBuyPackage
}

export async function deleteGroupBuy(id: string) {
  const res = await apiClient.delete(`/group-buys/${id}`)
  return res.data
}

export async function batchDeleteGroupBuys(ids: string[]) {
  const res = await apiClient.post('/group-buys/batch-delete', { ids })
  return res.data
}

export async function batchUpdateGroupBuyStatus(ids: string[], status: string) {
  const res = await apiClient.post('/group-buys/batch-status', { ids, status })
  return res.data
}
