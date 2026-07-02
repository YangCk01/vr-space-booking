import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildJobExecutionRecord,
  serializeJobError,
} from './jobRunner'

test('serializeJobError keeps error message and stack when available', () => {
  const err = new Error('boom')
  const text = serializeJobError(err)

  assert.match(text, /boom/)
  assert.match(text, /Error/)
})

test('serializeJobError truncates long errors for database storage', () => {
  const text = serializeJobError(new Error('x'.repeat(5000)))

  assert.equal(text.length, 2000)
})

test('buildJobExecutionRecord computes duration and success status', () => {
  const record = buildJobExecutionRecord({
    id: 'id-1',
    jobName: 'order-timeout',
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    finishedAt: new Date('2026-07-01T00:00:02.500Z'),
    error: null,
  })

  assert.deepEqual(record, {
    id: 'id-1',
    jobName: 'order-timeout',
    status: 'SUCCESS',
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    finishedAt: new Date('2026-07-01T00:00:02.500Z'),
    durationMs: 2500,
    errorMessage: null,
  })
})

test('buildJobExecutionRecord computes failed status and serialized error', () => {
  const record = buildJobExecutionRecord({
    id: 'id-1',
    jobName: 'order-timeout',
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    finishedAt: new Date('2026-07-01T00:00:01.000Z'),
    error: new Error('failed'),
  })

  assert.equal(record.status, 'FAILED')
  assert.equal(record.durationMs, 1000)
  assert.match(record.errorMessage || '', /failed/)
})
