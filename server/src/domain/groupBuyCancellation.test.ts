import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCancelableRefundAmount,
  isRedeemedGroupBuyBookingOrder,
} from './groupBuyCancellation'

test('detects normal orders created from redeemed group-buy vouchers', () => {
  assert.equal(
    isRedeemedGroupBuyBookingOrder({
      orderKind: 'NORMAL',
      metadata: { redeemedFromOrderId: 'voucher-1' },
    }),
    true
  )
  assert.equal(
    isRedeemedGroupBuyBookingOrder({
      orderKind: 'NORMAL',
      metadata: {},
    }),
    false
  )
})

test('does not refund redeemed group-buy booking cancellation', () => {
  const refundAmount = calculateCancelableRefundAmount({
    order: {
      orderKind: 'NORMAL',
      metadata: { redeemedFromOrderId: 'voucher-1' },
    },
    isPaidOrder: true,
    amount: 8800,
    refundRate: 1,
  })

  assert.equal(refundAmount, 0)
})

test('keeps normal paid order refund calculation unchanged', () => {
  const refundAmount = calculateCancelableRefundAmount({
    order: {
      orderKind: 'NORMAL',
      metadata: null,
    },
    isPaidOrder: true,
    amount: 8800,
    refundRate: 0.5,
  })

  assert.equal(refundAmount, 4400)
})
