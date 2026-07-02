import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseNoShowDispositionRequest,
  parseRefundRequest,
} from './orderContracts'

test('parseRefundRequest normalizes optional amount and required reason', () => {
  assert.deepEqual(parseRefundRequest({ amount: '1200', reason: '客户取消' }), {
    amount: 1200,
    reason: '客户取消',
  })
})

test('parseRefundRequest rejects blank reason', () => {
  assert.throws(() => parseRefundRequest({ amount: 0, reason: ' ' }), /请填写退款原因/)
})

test('parseNoShowDispositionRequest parses valid partial refund', () => {
  assert.deepEqual(parseNoShowDispositionRequest({
    action: 'PARTIAL_REFUND',
    amount: '3000',
    reason: '天气原因',
  }), {
    action: 'PARTIAL_REFUND',
    amount: 3000,
    reason: '天气原因',
  })
})

test('parseNoShowDispositionRequest rejects invalid action', () => {
  assert.throws(() => parseNoShowDispositionRequest({
    action: 'BAD',
    amount: 0,
    reason: 'test',
  }), /请选择有效的处置方式/)
})
