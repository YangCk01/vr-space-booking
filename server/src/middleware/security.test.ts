import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applySecurityHeaders,
  createFixedWindowRateLimiter,
} from './security'

function mockResponse() {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let body: any
  return {
    setHeader(name: string, value: string) {
      headers[name] = value
    },
    status(code: number) {
      statusCode = code
      return this
    },
    json(payload: any) {
      body = payload
      return this
    },
    headers,
    get statusCode() {
      return statusCode
    },
    get body() {
      return body
    },
  } as any
}

test('applySecurityHeaders sets core browser protection headers', () => {
  const res = mockResponse()
  let nextCalled = false

  applySecurityHeaders({} as any, res, () => { nextCalled = true })

  assert.equal(nextCalled, true)
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(res.headers['X-Frame-Options'], 'DENY')
  assert.equal(res.headers['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.match(res.headers['Content-Security-Policy'], /default-src 'self'/)
})

test('createFixedWindowRateLimiter blocks after the configured limit', () => {
  const limiter = createFixedWindowRateLimiter({
    windowMs: 60_000,
    max: 2,
    keyPrefix: 'test',
    now: () => 1_000,
  })
  const req = { ip: '127.0.0.1', originalUrl: '/api/auth/login' } as any

  const first = mockResponse()
  const second = mockResponse()
  const third = mockResponse()
  let allowed = 0

  limiter(req, first, () => { allowed++ })
  limiter(req, second, () => { allowed++ })
  limiter(req, third, () => { allowed++ })

  assert.equal(allowed, 2)
  assert.equal(third.statusCode, 429)
  assert.equal(third.body.message, '请求过于频繁，请稍后再试')
})
