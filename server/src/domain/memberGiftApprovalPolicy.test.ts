import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_MEMBER_GIFT_APPROVAL_POLICY,
  canManageMemberGiftApprovalPolicy,
  normalizeMemberGiftApprovalPolicy,
  shouldRequireMemberGiftApproval,
} from './memberGiftApprovalPolicy'

test('member gift approval policy only allows admin roles to manage', () => {
  assert.equal(canManageMemberGiftApprovalPolicy('SUPER_ADMIN'), true)
  assert.equal(canManageMemberGiftApprovalPolicy('ADMIN'), true)
  assert.equal(canManageMemberGiftApprovalPolicy('MANAGER'), false)
  assert.equal(canManageMemberGiftApprovalPolicy('FINANCE'), false)
  assert.equal(canManageMemberGiftApprovalPolicy('OPERATOR'), false)
  assert.equal(canManageMemberGiftApprovalPolicy(undefined), false)
})

test('member gift approval policy normalizes unsafe input', () => {
  const policy = normalizeMemberGiftApprovalPolicy({
    enabled: true,
    pointsThreshold: -1,
    batchSizeThreshold: '8',
    requireCouponGiftApproval: false,
    forceExperienceCouponApproval: false,
  })

  assert.equal(policy.enabled, true)
  assert.equal(policy.pointsThreshold, DEFAULT_MEMBER_GIFT_APPROVAL_POLICY.pointsThreshold)
  assert.equal(policy.batchSizeThreshold, 8)
  assert.equal(policy.requireCouponGiftApproval, false)
  assert.equal(policy.forceExperienceCouponApproval, false)
})

test('member gift approval policy decides when gifts need approval', () => {
  const policy = normalizeMemberGiftApprovalPolicy({
    enabled: true,
    pointsThreshold: 500,
    batchSizeThreshold: 2,
    requireCouponGiftApproval: false,
    forceExperienceCouponApproval: true,
  })

  assert.equal(shouldRequireMemberGiftApproval(policy, { kind: 'POINTS', points: 100, userCount: 1 }), false)
  assert.equal(shouldRequireMemberGiftApproval(policy, { kind: 'POINTS', points: 500, userCount: 1 }), true)
  assert.equal(shouldRequireMemberGiftApproval(policy, { kind: 'POINTS', points: 100, userCount: 3 }), true)
  assert.equal(shouldRequireMemberGiftApproval(policy, { kind: 'COUPON', couponType: 'DISCOUNT', userCount: 1 }), false)
  assert.equal(shouldRequireMemberGiftApproval(policy, { kind: 'COUPON', couponType: 'EXPERIENCE_FREE', userCount: 1 }), true)
})

