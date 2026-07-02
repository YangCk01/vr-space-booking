import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRequestLogEvent } from './requestLogger'

test('buildRequestLogEvent emits a structured request log with duration and requestId', () => {
  const event = buildRequestLogEvent({
    requestId: 'req_123',
    method: 'GET',
    path: '/api/orders',
    statusCode: 200,
    startedAt: 1000,
    finishedAt: 1250,
    userId: 'u1',
    role: 'ADMIN',
  })

  assert.deepEqual(event, {
    level: 'info',
    event: 'http_request',
    requestId: 'req_123',
    method: 'GET',
    path: '/api/orders',
    statusCode: 200,
    durationMs: 250,
    userId: 'u1',
    role: 'ADMIN',
  })
})

test('buildRequestLogEvent raises log level for slow or failed requests', () => {
  assert.equal(buildRequestLogEvent({
    method: 'GET',
    path: '/api/finance',
    statusCode: 200,
    startedAt: 0,
    finishedAt: 2200,
  }).level, 'warn')

  assert.equal(buildRequestLogEvent({
    method: 'GET',
    path: '/api/finance',
    statusCode: 500,
    startedAt: 0,
    finishedAt: 10,
  }).level, 'error')
})
