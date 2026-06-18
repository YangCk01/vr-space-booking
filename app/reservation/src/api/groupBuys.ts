import { apiClient } from './client'

export interface PublicGroupBuyPackage {
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
  description?: string | null
  soldText: string
  refundTags: string[]
  packageItems: string[]
  processSteps: string[]
  notice?: string | null
  refundNotice?: string | null
  buyButtonText: string
  venues: {
    id: string
    name: string
    address?: string | null
    phone?: string | null
    openTime?: string | null
    closeTime?: string | null
    image?: string | null
    status?: string | null
    maintenanceStartDate?: string | null
    maintenanceEndDate?: string | null
    maintenanceStartTime?: string | null
    maintenanceEndTime?: string | null
  }[]
  game?: {
    id: string
    title: string
    subtitle?: string | null
    coverImage?: string | null
    duration: number
    tags: string[]
  }
  venue?: {
    id: string
    name: string
    address?: string | null
    phone?: string | null
    openTime?: string | null
    closeTime?: string | null
    image?: string | null
    status?: string | null
    maintenanceStartDate?: string | null
    maintenanceEndDate?: string | null
    maintenanceStartTime?: string | null
    maintenanceEndTime?: string | null
  }
}

export async function getPublicGroupBuys(type?: string) {
  const res = await apiClient.get('/group-buys/public', { params: type && type !== 'all' ? { type } : {} })
  return res.data.data as PublicGroupBuyPackage[]
}

export async function getPublicGroupBuy(id: string) {
  const res = await apiClient.get(`/group-buys/public/${id}`)
  return res.data.data as PublicGroupBuyPackage
}
