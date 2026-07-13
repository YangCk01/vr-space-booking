import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyOrderPaymentState } from './orderPaymentState.ts'

test('paid lifecycle statuses leave the payment page', () => {
  for (const status of ['PAID', 'READY_TO_VERIFY', 'PLAYING', 'COMPLETED', 'NO_SHOW', 'REFUNDING', 'REFUNDED']) {
    assert.equal(classifyOrderPaymentState(status), 'PAID')
  }
})

test('pending order remains payable', () => {
  assert.equal(classifyOrderPaymentState('PENDING'), 'PAYABLE')
})

test('cancelled and unknown orders are unavailable', () => {
  assert.equal(classifyOrderPaymentState('CANCELLED'), 'UNAVAILABLE')
  assert.equal(classifyOrderPaymentState('UNKNOWN'), 'UNAVAILABLE')
})
