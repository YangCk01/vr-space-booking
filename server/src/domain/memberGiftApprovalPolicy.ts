export type MemberGiftApprovalPolicy = {
  enabled: boolean
  requirePointsGiftApproval: boolean
  requireCouponGiftApproval: boolean
  forceExperienceCouponApproval: boolean
  pointsThreshold: number
  batchSizeThreshold: number
}

export type MemberGiftApprovalContext =
  | { kind: 'POINTS'; points: number; userCount: number }
  | { kind: 'COUPON'; couponType: string; userCount: number }

export const MEMBER_GIFT_APPROVAL_POLICY_KEY = 'member_gift_approval_policy'

export const DEFAULT_MEMBER_GIFT_APPROVAL_POLICY: MemberGiftApprovalPolicy = {
  enabled: true,
  requirePointsGiftApproval: true,
  requireCouponGiftApproval: true,
  forceExperienceCouponApproval: true,
  pointsThreshold: 500,
  batchSizeThreshold: 2,
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function toPositiveInteger(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export function normalizeMemberGiftApprovalPolicy(input: unknown): MemberGiftApprovalPolicy {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}

  return {
    enabled: toBoolean(raw.enabled, DEFAULT_MEMBER_GIFT_APPROVAL_POLICY.enabled),
    requirePointsGiftApproval: toBoolean(
      raw.requirePointsGiftApproval,
      DEFAULT_MEMBER_GIFT_APPROVAL_POLICY.requirePointsGiftApproval
    ),
    requireCouponGiftApproval: toBoolean(
      raw.requireCouponGiftApproval,
      DEFAULT_MEMBER_GIFT_APPROVAL_POLICY.requireCouponGiftApproval
    ),
    forceExperienceCouponApproval: toBoolean(
      raw.forceExperienceCouponApproval,
      DEFAULT_MEMBER_GIFT_APPROVAL_POLICY.forceExperienceCouponApproval
    ),
    pointsThreshold: toPositiveInteger(raw.pointsThreshold, DEFAULT_MEMBER_GIFT_APPROVAL_POLICY.pointsThreshold),
    batchSizeThreshold: toPositiveInteger(raw.batchSizeThreshold, DEFAULT_MEMBER_GIFT_APPROVAL_POLICY.batchSizeThreshold),
  }
}

export function canManageMemberGiftApprovalPolicy(role?: string | null) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export function shouldRequireMemberGiftApproval(
  policyInput: MemberGiftApprovalPolicy,
  context: MemberGiftApprovalContext
) {
  const policy = normalizeMemberGiftApprovalPolicy(policyInput)
  if (!policy.enabled) return false
  if (context.userCount >= policy.batchSizeThreshold) return true

  if (context.kind === 'POINTS') {
    return policy.requirePointsGiftApproval && context.points >= policy.pointsThreshold
  }

  if (policy.forceExperienceCouponApproval && context.couponType === 'EXPERIENCE_FREE') return true
  return policy.requireCouponGiftApproval
}

