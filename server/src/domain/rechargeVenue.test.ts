import { describe, it } from 'node:test'
import assert from 'node:assert'
import { requireRechargeVenueId } from './rechargeVenue'

describe('requireRechargeVenueId', () => {
  it('returns a trimmed explicit venue id', () => {
    assert.strictEqual(requireRechargeVenueId(' venue-1 '), 'venue-1')
  })

  it('rejects missing venue id instead of silently guessing a store', () => {
    assert.throws(
      () => requireRechargeVenueId(''),
      /充值必须选择归属门店/,
    )
  })
})
