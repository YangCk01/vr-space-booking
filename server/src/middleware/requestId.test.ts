import test from 'node:test'
import assert from 'node:assert/strict'
import { type Request, type Response, type NextFunction } from 'express'
import { requestIdMiddleware, REQUEST_ID_HEADER } from './requestId'

function createReq(headers: Record<string, string> = {}): Request {
  return { get: (name: string) => headers[name.toLowerCase()] } as any
}

function createRes(): Response {
  const headers: Record<string, string> = {}
  return {
    locals: {},
    setHeader: (name: string, value: string) => {
      headers[name] = value
    },
    getHeader: (name: string) => headers[name],
  } as any
}

test('requestIdMiddleware generates requestId when header is absent', () => {
  const req = createReq()
  const res = createRes()
  let called = false
  const next: NextFunction = () => {
    called = true
  }
  requestIdMiddleware(req, res, next)

  assert.equal(called, true)
  assert.ok(typeof res.locals.requestId === 'string')
  assert.ok(res.locals.requestId.startsWith('req_'))
  assert.equal((res as any).getHeader(REQUEST_ID_HEADER), res.locals.requestId)
})

test('requestIdMiddleware reuses requestId from header', () => {
  const req = createReq({ [REQUEST_ID_HEADER]: 'req_existing' })
  const res = createRes()
  const next: NextFunction = () => {}
  requestIdMiddleware(req, res, next)

  assert.equal(res.locals.requestId, 'req_existing')
  assert.equal((res as any).getHeader(REQUEST_ID_HEADER), 'req_existing')
})
