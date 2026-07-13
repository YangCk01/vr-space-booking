import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCampaignRewardEligibility, type RewardEligibilityRule } from './campaignRewardEligibility'

const baseContext = {
  isVip: false,
  amount: 10000,
  venueId: 'venue-1',
  gameId: 'game-1',
  weekday: 1,
  startTime: '14:00',
  personCount: 4,
  completedOrderCount: 3,
}

test('evaluates all, normal and paid user scopes', () => {
  assert.deepEqual(evaluateCampaignRewardEligibility({ userScope: 'ALL' }, baseContext), { eligible: true })
  assert.deepEqual(evaluateCampaignRewardEligibility({ userScope: 'NORMAL' }, baseContext), { eligible: true })
  assert.equal(evaluateCampaignRewardEligibility({ userScope: 'NORMAL' }, { ...baseContext, isVip: true }).eligible, false)
  assert.deepEqual(evaluateCampaignRewardEligibility({ userScope: 'PAID' }, { ...baseContext, isVip: true }), { eligible: true })
  assert.equal(evaluateCampaignRewardEligibility({ userScope: 'PAID' }, baseContext).eligible, false)
})

test('accepts an order satisfying all eight eligibility conditions', () => {
  const result = evaluateCampaignRewardEligibility({
    userScope: 'ALL',
    minOrderAmount: 5000,
    applicableVenues: ['venue-1'],
    applicableGames: ['game-1'],
    applicableWeekdays: [1, 2],
    applicableStartTime: '09:00',
    applicableEndTime: '18:00',
    minPeople: 2,
    firstOrderOnly: false,
    minCompletedOrders: 3,
  }, baseContext)

  assert.deepEqual(result, { eligible: true })
})

test('returns a stable reason for each unmet condition', () => {
  const cases: Array<[Partial<RewardEligibilityRule>, string]> = [
    [{ minOrderAmount: 20000 }, 'MIN_ORDER_NOT_MET'],
    [{ applicableVenues: ['venue-2'] }, 'VENUE_NOT_APPLICABLE'],
    [{ applicableGames: ['game-2'] }, 'GAME_NOT_APPLICABLE'],
    [{ applicableWeekdays: [5] }, 'WEEKDAY_NOT_APPLICABLE'],
    [{ applicableStartTime: '15:00', applicableEndTime: '18:00' }, 'TIME_NOT_APPLICABLE'],
    [{ minPeople: 5 }, 'MIN_PEOPLE_NOT_MET'],
    [{ firstOrderOnly: true }, 'FIRST_ORDER_REQUIRED'],
    [{ minCompletedOrders: 4 }, 'MIN_COMPLETED_ORDERS_NOT_MET'],
  ]

  for (const [rule, reason] of cases) {
    assert.deepEqual(evaluateCampaignRewardEligibility({ userScope: 'ALL', ...rule }, baseContext), { eligible: false, reason })
  }
})

test('enforces the absolute reward issuance window', () => {
  const rule: RewardEligibilityRule = {
    userScope: 'ALL',
    validFrom: new Date('2026-07-13T10:00:00.000Z'),
    validTo: new Date('2026-07-13T12:00:00.000Z'),
  }

  assert.deepEqual(
    evaluateCampaignRewardEligibility(rule, { ...baseContext, now: new Date('2026-07-13T09:59:59.999Z') }),
    { eligible: false, reason: 'REWARD_NOT_STARTED' },
  )
  assert.deepEqual(
    evaluateCampaignRewardEligibility(rule, { ...baseContext, now: new Date('2026-07-13T11:00:00.000Z') }),
    { eligible: true },
  )
  assert.deepEqual(
    evaluateCampaignRewardEligibility(rule, { ...baseContext, now: new Date('2026-07-13T12:00:00.001Z') }),
    { eligible: false, reason: 'REWARD_EXPIRED' },
  )
})
