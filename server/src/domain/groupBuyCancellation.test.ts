import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCancelableRefundAmount,
  calculateGroupBuyRedemptionFinancialAmount,
  isRedeemedGroupBuyBookingOrder,
  resolveGroupBuyRelatedOrderNo,
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

test('treats redeemed group-buy bookings as zero-amount financial records', () => {
  assert.equal(
    calculateGroupBuyRedemptionFinancialAmount({
      orderKind: 'NORMAL',
      metadata: { redeemedFromOrderId: 'voucher-1' },
      amount: 17600,
    }),
    0
  )

  assert.equal(
    calculateGroupBuyRedemptionFinancialAmount({
      orderKind: 'NORMAL',
      metadata: null,
      amount: 15600,
    }),
    15600
  )
})

test('resolves group-buy voucher and redeemed booking related order numbers', () => {
  assert.equal(
    resolveGroupBuyRelatedOrderNo({
      orderKind: 'NORMAL',
      parentOrderId: null,
      metadata: { redeemedFromOrderNo: 'VRG2026070200003' },
    }),
    'VRG2026070200003'
  )

  assert.equal(
    resolveGroupBuyRelatedOrderNo({
      orderKind: 'NORMAL',
      parentOrderId: null,
      metadata: { redeemedOrderNo: 'VRN2026070200009' },
    }),
    'VRN2026070200009'
  )
})
