import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mapCampaignRewardRecord,
  parseRewardRecordFilters,
} from './campaignRewardRecords'

test('campaign reward records normalize paging and filters', () => {
  const filters = parseRewardRecordFilters({
    page: '0',
    pageSize: '999',
    campaignId: ' campaign-1 ',
    rewardType: 'points',
    status: 'success',
    userKeyword: ' 138 ',
    startDate: '2026-07-01',
    endDate: '2026-07-13',
  })

  assert.equal(filters.page, 1)
  assert.equal(filters.pageSize, 100)
  assert.equal(filters.campaignId, 'campaign-1')
  assert.equal(filters.rewardType, 'POINTS')
  assert.equal(filters.status, 'SUCCESS')
  assert.equal(filters.userKeyword, '138')
  assert.equal(filters.startAt?.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(filters.endAt?.toISOString(), '2026-07-13T23:59:59.999Z')
})

test('campaign reward records map points without avatar or acquisition method', () => {
  const record = mapCampaignRewardRecord({
    id: 'log-points',
    campaignId: 'campaign-1',
    userId: 'user-1',
    rewardType: 'POINTS',
    rewardValue: 500,
    rewardCouponName: null,
    costPoints: 500,
    status: 'SUCCESS',
    reason: null,
    issuedAt: new Date('2026-07-13T02:00:00.000Z'),
    usedAt: null,
    usedOrderId: null,
    usedAmount: null,
    campaign: { name: '注册赠积分', rewards: [{ rewardType: 'POINTS', pointsAmount: 500 }] },
    user: { name: '测试用户', phone: '13800000000' },
  })

  assert.equal(record.rewardType, 'POINTS')
  assert.equal(record.rewardName, '积分')
  assert.equal(record.pointsAmount, 500)
  assert.equal(record.rewardValue, 500)
  assert.equal(record.description, '注册赠积分发放 500 积分')
  assert.equal('avatar' in record, false)
  assert.equal('acquisitionMethod' in record, false)
})

test('campaign reward records map coupon and experience usage fields', () => {
  const coupon = mapCampaignRewardRecord({
    id: 'log-coupon',
    campaignId: 'campaign-2',
    userId: 'user-2',
    rewardType: 'COUPON',
    rewardValue: 80,
    rewardCouponName: '八折券',
    costPoints: null,
    status: 'SUCCESS',
    reason: null,
    issuedAt: new Date('2026-07-10T02:00:00.000Z'),
    usedAt: new Date('2026-07-12T03:00:00.000Z'),
    usedOrderId: 'order-1',
    usedAmount: 12000,
    campaign: { name: '暑期活动', rewards: [{ rewardType: 'COUPON', couponName: '八折券', couponDiscountRate: 80, couponValidDays: 10 }] },
    user: { name: '用户二', phone: '13900000000' },
  })
  const experience = mapCampaignRewardRecord({
    id: 'log-experience',
    campaignId: 'campaign-3',
    userId: 'user-3',
    rewardType: 'EXPERIENCE_COUPON',
    rewardValue: 1,
    rewardCouponName: '恐龙体验券',
    costPoints: null,
    status: 'SUCCESS',
    reason: null,
    issuedAt: new Date('2026-07-11T02:00:00.000Z'),
    usedAt: null,
    usedOrderId: null,
    usedAmount: null,
    campaign: { name: '新客体验', rewards: [{ rewardType: 'EXPERIENCE_COUPON', couponName: '恐龙体验券', couponValidDays: 7, applicableGames: ['game-1'] }] },
    user: { name: '用户三', phone: '13700000000' },
    applicableGameNames: ['恐龙世界'],
  })

  assert.equal(coupon.rewardName, '八折券')
  assert.equal(coupon.validDays, 10)
  assert.equal(coupon.usedOrderId, 'order-1')
  assert.equal(coupon.usedAmount, 12000)
  assert.deepEqual(experience.applicableGameNames, ['恐龙世界'])
  assert.equal(experience.rewardType, 'EXPERIENCE_COUPON')
})
