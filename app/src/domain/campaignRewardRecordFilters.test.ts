import { describe, expect, it } from 'vitest'
import {
  parseCampaignRewardRecordFilters,
  serializeCampaignRewardRecordFilters,
} from './campaignRewardRecordFilters.ts'

describe('campaign reward record filters', () => {
it('serializes and restores every reward record filter', () => {
  const filters = {
    campaignId: 'campaign-1',
    rewardType: 'POINTS' as const,
    status: 'ISSUED' as const,
    userKeyword: '13800000000',
    startDate: '2026-07-01',
    endDate: '2026-07-13',
  }

  const params = serializeCampaignRewardRecordFilters(filters)

  expect(params.toString()).toBe('campaignId=campaign-1&rewardType=POINTS&status=ISSUED&userKeyword=13800000000&startDate=2026-07-01&endDate=2026-07-13')
  expect(parseCampaignRewardRecordFilters(params)).toEqual(filters)
})

it('omits empty reward record filters', () => {
  const params = serializeCampaignRewardRecordFilters({
    campaignId: '', rewardType: '', status: '', userKeyword: '', startDate: '', endDate: '',
  })

  expect(params.toString()).toBe('')
})
})
