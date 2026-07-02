import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRechargeSchema, confirmRechargeSchema, staffRechargeSchema } from './recharge'

describe('recharge contracts', () => {
  it('requires an explicit venue for recharge creation', () => {
    const parsed = createRechargeSchema.safeParse({ amount: 10000, payMethod: 'cash' })

    assert.equal(parsed.success, false)
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0].path.join('.'), 'venueId')
    }
  })

  it('normalizes pay method and accepts a valid create request', () => {
    const parsed = createRechargeSchema.parse({
      amount: '10000',
      payMethod: 'cash',
      venueId: 'venue-1',
    })

    assert.deepStrictEqual(parsed, {
      amount: 10000,
      payMethod: 'CASH',
      venueId: 'venue-1',
    })
  })

  it('requires recharge id when confirming manual receipt', () => {
    assert.throws(() => confirmRechargeSchema.parse({}), /充值订单ID不能为空/)
  })

  it('requires a target member for staff recharge', () => {
    const parsed = staffRechargeSchema.safeParse({
      amount: 10000,
      payMethod: 'card',
      venueId: 'venue-1',
    })

    assert.equal(parsed.success, false)
  })
})
