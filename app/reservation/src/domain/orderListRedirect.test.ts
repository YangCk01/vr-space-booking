import test from 'node:test'
import assert from 'node:assert/strict'
import { startOrderListRedirect } from './orderListRedirect.ts'

test('falls back to a hard redirect when the payment page remains mounted', () => {
  const calls: string[] = []
  let fallback: (() => void) | undefined

  startOrderListRedirect({
    navigate: (target) => calls.push(`navigate:${target}`),
    hardRedirect: (target) => calls.push(`replace:${target}`),
    schedule: (callback) => {
      fallback = callback
      return 1
    },
    cancel: () => undefined,
  })

  assert.deepEqual(calls, ['navigate:/orders'])
  fallback?.()
  assert.deepEqual(calls, ['navigate:/orders', 'replace:/orders'])
})

test('cancels the hard redirect when the payment page unmounts', () => {
  let timerCancelled = false

  const stop = startOrderListRedirect({
    navigate: () => undefined,
    hardRedirect: () => undefined,
    schedule: () => 7,
    cancel: (timer) => {
      timerCancelled = timer === 7
    },
  })

  stop()
  assert.equal(timerCancelled, true)
})
