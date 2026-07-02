import test from 'node:test'
import assert from 'node:assert/strict'
import { type Response } from 'express'
import { success, error, paginated } from './apiResponse'

function mockResponse(): Response {
  let statusCode = 200
  let body: any = null
  return {
    status(code: number) {
      statusCode = code
      return this
    },
    json(b: any) {
      body = b
      return this
    },
    get sentBody() {
      return body
    },
    get sentStatus() {
      return statusCode
    },
  } as any
}

test('success returns unified response with code 0', () => {
  const res: any = mockResponse()
  success(res, { id: 1 }, '创建成功', 201)

  assert.equal(res.sentStatus, 201)
  assert.equal(res.sentBody.code, 0)
  assert.equal(res.sentBody.message, '创建成功')
  assert.deepStrictEqual(res.sentBody.data, { id: 1 })
  assert.ok(res.sentBody.meta.timestamp)
})

test('success attaches requestId from res.locals', () => {
  const res: any = mockResponse()
  ;(res as any).locals = { requestId: 'req_abc123' }
  success(res, {})

  assert.equal(res.sentBody.meta.requestId, 'req_abc123')
})

test('paginated returns list/total/page/pageSize structure', () => {
  const res: any = mockResponse()
  paginated(res, [{ id: 1 }], 1, 20, 100)

  assert.equal(res.sentStatus, 200)
  assert.equal(res.sentBody.code, 0)
  assert.deepStrictEqual(res.sentBody.data, {
    list: [{ id: 1 }],
    total: 100,
    page: 1,
    pageSize: 20,
  })
})

test('paginated preserves extra meta for dashboard counters', () => {
  const res: any = mockResponse()
  paginated(res, [{ id: 1 }], 1, 20, 100, 'OK', {
    statusCounts: { paid: 3 },
  })

  assert.deepStrictEqual(res.sentBody.meta.statusCounts, { paid: 3 })
  assert.equal(res.sentBody.meta.totalPages, 5)
})

test('error returns unified error response', () => {
  const res: any = mockResponse()
  error(res, 1001, '参数错误', 400, { fields: ['name'] })

  assert.equal(res.sentStatus, 400)
  assert.equal(res.sentBody.code, 1001)
  assert.equal(res.sentBody.message, '参数错误')
  assert.deepStrictEqual(res.sentBody.details, { fields: ['name'] })
})
