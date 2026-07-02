import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNoShowDisposition,
  calculateOrderRefund,
  ensureOrderRefundable,
} from './refundPolicy'

test('ensureOrderRefundable allows paid-like fulfilled states', () => {
  assert.doesNotThrow(() => ensureOrderRefundable('PAID'))
  assert.doesNotThrow(() => ensureOrderRefundable('READY_TO_VERIFY'))
  assert.doesNotThrow(() => ensureOrderRefundable('COMPLETED'))
})

test('ensureOrderRefundable rejects no-show orders for normal refund flow', () => {
  assert.throws(() => ensureOrderRefundable('NO_SHOW'), /已作废订单请使用退款处置流程/)
})

test('calculateOrderRefund defaults to full order amount and splits balance refund by original deduction', () => {
  const refund = calculateOrderRefund({
    requestedAmount: 0,
    orderAmount: 10000,
    payMethod: 'BALANCE',
    principalDeduction: 7000,
    bonusDeduction: 3000,
  })

  assert.deepEqual(refund, {
    actualRefund: 10000,
    isBalancePay: true,
    principalAmount: 7000,
    bonusAmount: 3000,
    totalAmount: 10000,
  })
})

test('calculateOrderRefund handles partial balance refunds without exceeding original pockets', () => {
  const refund = calculateOrderRefund({
    requestedAmount: 2500,
    orderAmount: 10000,
    payMethod: 'BALANCE',
    principalDeduction: 7000,
    bonusDeduction: 3000,
  })

  assert.equal(refund.actualRefund, 2500)
  assert.equal(refund.principalAmount, 1750)
  assert.equal(refund.bonusAmount, 750)
})

test('calculateOrderRefund records online refunds without wallet pocket increments', () => {
  const refund = calculateOrderRefund({
    requestedAmount: 5000,
    orderAmount: 10000,
    payMethod: 'WECHAT',
    principalDeduction: 0,
    bonusDeduction: 0,
  })

  assert.deepEqual(refund, {
    actualRefund: 5000,
    isBalancePay: false,
    principalAmount: 0,
    bonusAmount: 0,
    totalAmount: 5000,
  })
})

test('calculateOrderRefund rejects invalid refund amount', () => {
  assert.throws(
    () => calculateOrderRefund({
      requestedAmount: 10001,
      orderAmount: 10000,
      payMethod: 'BALANCE',
      principalDeduction: 7000,
      bonusDeduction: 3000,
    }),
    /退款金额不合法/
  )
})

test('calculateNoShowDisposition computes no-refund retained penalty', () => {
  const disposition = calculateNoShowDisposition({
    action: 'NO_REFUND',
    requestedAmount: 0,
    orderAmount: 10000,
    originalPenaltyAmount: null,
  })

  assert.deepEqual(disposition, {
    actualRefund: 0,
    retainedPenalty: 10000,
    reversedPenaltyAmount: 0,
  })
})

test('calculateNoShowDisposition computes partial refund and reversed penalty', () => {
  const disposition = calculateNoShowDisposition({
    action: 'PARTIAL_REFUND',
    requestedAmount: 4000,
    orderAmount: 10000,
    originalPenaltyAmount: 10000,
  })

  assert.deepEqual(disposition, {
    actualRefund: 4000,
    retainedPenalty: 6000,
    reversedPenaltyAmount: 4000,
  })
})
