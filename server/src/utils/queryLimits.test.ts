import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampPageParams,
  resolveDateRange,
} from './queryLimits'

test('clampPageParams caps unsafe page sizes', () => {
  assert.deepEqual(clampPageParams({ page: '0', pageSize: '500' }), {
    page: 1,
    pageSize: 100,
  })
  assert.deepEqual(clampPageParams({ page: '2', pageSize: '20' }), {
    page: 2,
    pageSize: 20,
  })
})

test('resolveDateRange rejects ranges above the hard cap', () => {
  assert.throws(
    () => resolveDateRange({ startDate: '2026-01-01', endDate: '2026-07-01', maxDays: 93 }),
    /不能超过 93 天/
  )
})

test('resolveDateRange defaults missing dates to a bounded recent window', () => {
  const range = resolveDateRange({
    now: new Date('2026-07-06T12:00:00+08:00'),
    defaultDays: 31,
    maxDays: 93,
  })

  assert.equal(range.startDate, '2026-06-06')
  assert.equal(range.endDate, '2026-07-06')
})
