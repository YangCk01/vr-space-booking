import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldBlockExistingCampaignIssue } from '../services/campaignRewardService'

test('campaign issue limit blocks existing success by default', () => {
  assert.equal(shouldBlockExistingCampaignIssue(undefined, { id: 'log-1' }), true)
  assert.equal(shouldBlockExistingCampaignIssue(true, { id: 'log-1' }), true)
})

test('campaign issue limit allows repeated triggers when runOnce is false', () => {
  assert.equal(shouldBlockExistingCampaignIssue(false, { id: 'log-1' }), false)
  assert.equal(shouldBlockExistingCampaignIssue(false, null), false)
})
