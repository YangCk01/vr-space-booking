export type CampaignUserScope = 'ALL' | 'NORMAL' | 'PAID'

export interface RewardEligibilityRule {
  userScope: CampaignUserScope
  validFrom?: Date | null
  validTo?: Date | null
  minOrderAmount?: number | null
  applicableVenues?: string[]
  applicableGames?: string[]
  applicableWeekdays?: number[]
  applicableStartTime?: string | null
  applicableEndTime?: string | null
  minPeople?: number | null
  firstOrderOnly?: boolean
  minCompletedOrders?: number | null
}

export interface RewardEligibilityContext {
  isVip: boolean
  now?: Date
  amount?: number
  venueId?: string | null
  gameId?: string | null
  weekday?: number
  startTime?: string | null
  personCount?: number
  completedOrderCount?: number
}

export type RewardEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string }

function timeMatches(value: string | null | undefined, start: string, end: string): boolean {
  if (!value) return false
  return start <= end ? value >= start && value <= end : value >= start || value <= end
}

export function evaluateCampaignRewardEligibility(
  rule: RewardEligibilityRule,
  context: RewardEligibilityContext,
): RewardEligibilityResult {
  const now = context.now || new Date()
  if (rule.validFrom && now < rule.validFrom) {
    return { eligible: false, reason: 'REWARD_NOT_STARTED' }
  }
  if (rule.validTo && now > rule.validTo) {
    return { eligible: false, reason: 'REWARD_EXPIRED' }
  }
  if ((rule.userScope === 'NORMAL' && context.isVip) || (rule.userScope === 'PAID' && !context.isVip)) {
    return { eligible: false, reason: 'USER_SCOPE_NOT_MET' }
  }
  if (rule.minOrderAmount && (context.amount ?? -1) < rule.minOrderAmount) {
    return { eligible: false, reason: 'MIN_ORDER_NOT_MET' }
  }
  if (rule.applicableVenues?.length && (!context.venueId || !rule.applicableVenues.includes(context.venueId))) {
    return { eligible: false, reason: 'VENUE_NOT_APPLICABLE' }
  }
  if (rule.applicableGames?.length && (!context.gameId || !rule.applicableGames.includes(context.gameId))) {
    return { eligible: false, reason: 'GAME_NOT_APPLICABLE' }
  }
  if (rule.applicableWeekdays?.length && (context.weekday === undefined || !rule.applicableWeekdays.includes(context.weekday))) {
    return { eligible: false, reason: 'WEEKDAY_NOT_APPLICABLE' }
  }
  if (rule.applicableStartTime && rule.applicableEndTime
    && !timeMatches(context.startTime, rule.applicableStartTime, rule.applicableEndTime)) {
    return { eligible: false, reason: 'TIME_NOT_APPLICABLE' }
  }
  if (rule.minPeople && (context.personCount ?? -1) < rule.minPeople) {
    return { eligible: false, reason: 'MIN_PEOPLE_NOT_MET' }
  }
  if (rule.firstOrderOnly && context.completedOrderCount !== 1) {
    return { eligible: false, reason: 'FIRST_ORDER_REQUIRED' }
  }
  if (rule.minCompletedOrders && (context.completedOrderCount ?? -1) < rule.minCompletedOrders) {
    return { eligible: false, reason: 'MIN_COMPLETED_ORDERS_NOT_MET' }
  }
  return { eligible: true }
}
