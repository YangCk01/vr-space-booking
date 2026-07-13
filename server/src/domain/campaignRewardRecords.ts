export type CampaignRewardRecordType = 'POINTS' | 'COUPON' | 'EXPERIENCE_COUPON'

export interface RewardRecordFilters {
  page: number
  pageSize: number
  campaignId?: string
  rewardType?: CampaignRewardRecordType
  status?: string
  userKeyword?: string
  startAt?: Date
  endAt?: Date
}

interface RewardSnapshot {
  rewardType: string
  pointsAmount?: number | null
  couponName?: string | null
  couponDiscountRate?: number | null
  couponValidDays?: number | null
  applicableGames?: string[]
}

export interface CampaignRewardRecordRow {
  id: string
  campaignId: string
  userId: string
  rewardType?: string | null
  rewardValue?: number | null
  rewardCouponName?: string | null
  costPoints?: number | null
  status: string
  reason?: string | null
  issuedAt: Date
  usedAt?: Date | null
  usedOrderId?: string | null
  usedAmount?: number | null
  campaign: { name: string; rewards?: RewardSnapshot[] }
  user: { name: string; phone: string }
  applicableGameNames?: string[]
}

export interface CampaignRewardRecordDto {
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

function clean(value: unknown): string | undefined {
  const result = typeof value === 'string' ? value.trim() : ''
  return result || undefined
}

function parseDate(value: unknown, endOfDay = false): Date | undefined {
  const text = clean(value)
  if (!text) return undefined
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text)
  const parsed = new Date(dateOnly ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : text)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function normalizeRewardType(value?: string | null): CampaignRewardRecordType {
  const normalized = String(value || '').toUpperCase().replace(/^GIFT_/, '')
  if (normalized === 'POINTS') return 'POINTS'
  if (normalized === 'EXPERIENCE' || normalized === 'EXPERIENCE_COUPON') return 'EXPERIENCE_COUPON'
  return 'COUPON'
}

export function parseRewardRecordFilters(query: Record<string, unknown>): RewardRecordFilters {
  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1)
  const requestedPageSize = Number.parseInt(String(query.pageSize || '20'), 10) || 20
  const rewardType = clean(query.rewardType)
  const status = clean(query.status)

  return {
    page,
    pageSize: Math.min(100, Math.max(1, requestedPageSize)),
    campaignId: clean(query.campaignId),
    rewardType: rewardType ? normalizeRewardType(rewardType) : undefined,
    status: status && status.toLowerCase() !== 'all' ? status.toUpperCase() : undefined,
    userKeyword: clean(query.userKeyword),
    startAt: parseDate(query.startDate),
    endAt: parseDate(query.endDate, true),
  }
}

export function mapCampaignRewardRecord(row: CampaignRewardRecordRow): CampaignRewardRecordDto {
  const rewardType = normalizeRewardType(row.rewardType)
  const reward = row.campaign.rewards?.find((item) => normalizeRewardType(item.rewardType) === rewardType)
    || row.campaign.rewards?.[0]
  const pointsAmount = rewardType === 'POINTS'
    ? row.rewardValue ?? row.costPoints ?? reward?.pointsAmount ?? 0
    : null
  const rewardValue = rewardType === 'POINTS'
    ? pointsAmount
    : row.rewardValue ?? reward?.couponDiscountRate ?? null
  const rewardName = rewardType === 'POINTS'
    ? '积分'
    : row.rewardCouponName || reward?.couponName || (rewardType === 'EXPERIENCE_COUPON' ? '体验券' : '优惠券')
  const description = rewardType === 'POINTS'
    ? `${row.campaign.name}发放 ${pointsAmount || 0} 积分`
    : `${row.campaign.name}发放${rewardName}`

  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    userId: row.userId,
    userName: row.user.name,
    userPhone: row.user.phone,
    rewardType,
    rewardName,
    rewardValue,
    pointsAmount,
    validDays: reward?.couponValidDays ?? null,
    applicableGameNames: row.applicableGameNames || [],
    status: row.status,
    reason: row.reason || null,
    issuedAt: row.issuedAt.toISOString(),
    usedAt: row.usedAt?.toISOString() || null,
    usedOrderId: row.usedOrderId || null,
    usedAmount: row.usedAmount ?? null,
    description,
  }
}
