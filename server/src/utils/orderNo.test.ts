import test from 'node:test'
import assert from 'node:assert/strict'
import { formatOrderNoFromSequence, getOrderNoSequenceName } from './orderNo'

test('order number sequence names are mapped by order type', () => {
  assert.equal(getOrderNoSequenceName('normal'), 'order_no_normal_seq')
  assert.equal(getOrderNoSequenceName('group'), 'order_no_group_seq')
  assert.equal(getOrderNoSequenceName('reschedule'), 'order_no_reschedule_seq')
})

test('formatOrderNoFromSequence preserves existing business format', () => {
  assert.match(formatOrderNoFromSequence('normal', 1, new Date('2026-07-06T08:00:00+08:00')), /^VRN20260706\d{5}$/)
  assert.match(formatOrderNoFromSequence('group', 12, new Date('2026-07-06T08:00:00+08:00')), /^VRG20260706\d{5}$/)
  assert.match(formatOrderNoFromSequence('reschedule', 123, new Date('2026-07-06T08:00:00+08:00')), /^VRS20260706\d{5}$/)
})
