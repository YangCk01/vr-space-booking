import test from 'node:test'
import assert from 'node:assert/strict'
import { buildJobStartupPlan } from './jobBootstrap'

test('buildJobStartupPlan keeps every background job in one startup list', () => {
  const plan = buildJobStartupPlan()

  assert.deepEqual(plan.map((job) => job.name), [
    'reconciliation',
    'data-consistency',
    'user-tag',
    'trigger',
    'coupon-effect',
    'order-timeout',
    'booking-lifecycle',
    'booking-reminder',
    'venue-maintenance',
    'daily-financial-report',
  ])
})

test('buildJobStartupPlan does not register duplicate jobs', () => {
  const names = buildJobStartupPlan().map((job) => job.name)

  assert.equal(new Set(names).size, names.length)
})
