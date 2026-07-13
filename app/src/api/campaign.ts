import { apiClient } from './client'

export interface CampaignReward {
  id: string
  rewardType: string
  pointsAmount?: number
  couponName?: string
  couponDiscountRate?: number
  couponValidDays?: number
  validFrom?: string
  validTo?: string
  minOrderAmount?: number
  applicableVenues?: string[]
  applicableGames?: string[]
  applicableWeekdays?: number[]
  applicableStartTime?: string
  applicableEndTime?: string
  minPeople?: number
  firstOrderOnly?: boolean
  minCompletedOrders?: number
  maxQuantity: number
  issuedCount: number
  usedCount: number
}

export type CampaignRewardRecordType = 'POINTS' | 'COUPON' | 'EXPERIENCE_COUPON'

export interface CampaignRewardRecord {
  id: string
  campaignId: string
  campaignName: string
  userId: string
  userName: string
  userPhone: string
  rewardType: CampaignRewardRecordType
  rewardName: string
  rewardValue: number | null
  pointsAmount: number | null
  validDays: number | null
  applicableGameNames: string[]
  status: string
  reason: string | null
  issuedAt: string
  usedAt: string | null
  usedOrderId: string | null
  usedAmount: number | null
  description: string
}

export interface CampaignRewardRecordFilters {
  page?: number
  pageSize?: number
  campaignId?: string
  rewardType?: CampaignRewardRecordType | ''
  status?: 'ISSUED' | 'USED' | 'FAILED' | ''
  userKeyword?: string
  startDate?: string
  endDate?: string
}

export interface TriggerRuleInfo {
  id: string
  name: string
  event: string
  conditions: Record<string, any>
  actions: Array<{ type: string; [key: string]: any }>
  enabled: boolean
  runOnce: boolean
  campaignId: string | null
  createdAt: string
  updatedAt: string
}

export interface Campaign {
  id: string
  name: string
  type: string
  status: string
  startAt?: string
  endAt?: string
  budget?: number
  spent: number
  createdBy: string
  createdAt: string
  rewards?: CampaignReward[]
  triggerRule?: TriggerRuleInfo | null
  effectPreview?: {
    issuedCount: number
    usedCount: number
  }
  // 新增字段
  targetTags?: string[]
  excludeTags?: string[]
  priority?: number
  channel?: string
  targetType?: string
  targetValue?: number
  autoPauseOnBudgetExhausted?: boolean
  autoEndOnExpire?: boolean
}

export interface CampaignTriggerRuleInput {
  name?: string
  event: string
  conditions?: Record<string, any>
  actions: Array<{ type: string; [key: string]: any }>
  runOnce?: boolean
  maxQuantity?: number
}

export interface CreateCampaignInput {
  name: string
  type: string
  startAt?: string
  endAt?: string
  budget?: number
  rewardType?: string
  pointsAmount?: number
  couponName?: string
  couponDiscountRate?: number
  couponValidDays?: number
  maxQuantity?: number
  rewards?: Array<{
    rewardType: string
    pointsAmount?: number
    couponName?: string
    couponDiscountRate?: number
    couponValidDays?: number
    validFrom?: string
    validTo?: string
    minOrderAmount?: number
    applicableVenues?: string[]
    applicableGames?: string[]
    applicableWeekdays?: number[]
    applicableStartTime?: string
    applicableEndTime?: string
    minPeople?: number
    firstOrderOnly?: boolean
    minCompletedOrders?: number
    maxQuantity: number
  }>
  triggerRule?: CampaignTriggerRuleInput
  // 新增字段
  targetTags?: string[]
  excludeTags?: string[]
  priority?: number
  channel?: string
  targetType?: string
  targetValue?: number
  autoPauseOnBudgetExhausted?: boolean
  autoEndOnExpire?: boolean
}

export async function getCampaigns(params?: {
  page?: number
  pageSize?: number
  status?: string
}) {
  const res = await apiClient.get('/campaigns', { params })
  return res.data
}

export async function createCampaign(data: CreateCampaignInput) {
  const res = await apiClient.post('/campaigns', data)
  return res.data.data
}

export async function pauseCampaign(id: string) {
  const res = await apiClient.put(`/campaigns/${id}/pause`)
  return res.data.data
}

export async function endCampaign(id: string) {
  const res = await apiClient.put(`/campaigns/${id}/end`)
  return res.data.data
}

export async function activateCampaign(id: string) {
  const res = await apiClient.put(`/campaigns/${id}/activate`)
  return res.data.data
}

export async function cloneCampaign(id: string) {
  const res = await apiClient.put(`/campaigns/${id}/clone`)
  return res.data.data
}

export async function getCampaignStats(id: string) {
  const res = await apiClient.get(`/campaigns/${id}/stats`)
  return res.data.data
}

export async function getCampaignEffects(id: string, params?: { days?: number }) {
  const res = await apiClient.get(`/campaigns/${id}/effects`, { params })
  return res.data.data
}

export async function distributeCampaign(id: string, phones: string[]) {
  const res = await apiClient.post(`/campaigns/${id}/distribute`, { phones })
  return res.data.data
}

export async function getCampaignTracks(id: string, params?: { page?: number; pageSize?: number }) {
  const res = await apiClient.get(`/campaigns/${id}/tracks`, { params })
  return res.data
}

export async function getCampaignLogs(id: string, params?: { page?: number; pageSize?: number; status?: string }) {
  const res = await apiClient.get(`/campaigns/${id}/logs`, { params })
  return res.data
}

export async function getCampaignRewardRecords(params?: CampaignRewardRecordFilters) {
  const res = await apiClient.get('/campaigns/reward-records', { params })
  return res.data
}

export async function deleteCampaign(id: string) {
  const res = await apiClient.delete(`/campaigns/${id}`)
  return res.data.data
}

export async function updateCampaign(id: string, data: Partial<CreateCampaignInput>) {
  const res = await apiClient.put(`/campaigns/${id}`, data)
  return res.data.data
}
