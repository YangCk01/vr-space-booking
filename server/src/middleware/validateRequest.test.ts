import test from 'node:test'
import assert from 'node:assert/strict'
import { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { validateRequest } from './validateRequest'
import { ValidationError } from '../domain/errors'

function createReq(partial: Partial<Request> = {}): Request {
  return { body: {}, query: {}, params: {}, ...partial } as any
}

function createRes(): Response {
  return { locals: {} } as any
}

test('validateRequest passes valid body/query/params', () => {
  const req = createReq({ body: { name: 'test' }, query: { page: '1' } })
  const middleware = validateRequest({
    body: z.object({ name: z.string() }),
    query: z.object({ page: z.coerce.number() }),
  })

  let called = false
  const next: NextFunction = () => {
    called = true
  }
  middleware(req, createRes(), next)

  assert.equal(called, true)
  assert.equal(req.body.name, 'test')
  assert.equal(req.query.page, 1)
})

test('validateRequest forwards ValidationError for invalid body', () => {
  const req = createReq({ body: { name: 123 } })
  const middleware = validateRequest({
    body: z.object({ name: z.string() }),
  })

  let forwarded: any = null
  const next: NextFunction = (err: any) => {
    forwarded = err
  }
  middleware(req, createRes(), next)

  assert.ok(forwarded instanceof ValidationError)
  assert.equal(forwarded.message, '请求参数校验失败')
  assert.ok(forwarded.details)
  assert.ok(Array.isArray(forwarded.details.name))
})

test('validateRequest ignores unspecified parts', () => {
  const req = createReq({ body: { a: 1 }, params: { id: 'x' } })
  const middleware = validateRequest({ body: z.object({ a: z.number() }) })

  let called = false
  const next: NextFunction = () => {
    called = true
  }
  middleware(req, createRes(), next)

  assert.equal(called, true)
})
