import { describe, it } from 'node:test'
import assert from 'node:assert'
import { normalizeQueryLimits } from './queryGuards'

describe('normalizeQueryLimits', () => {
  it('caps pageSize and limit on inbound requests', () => {
    const req = { query: { pageSize: '5000', limit: '999' } } as any
    let nextCalled = false

    normalizeQueryLimits(req, {} as any, () => {
      nextCalled = true
    })

    assert.strictEqual(req.query.pageSize, '100')
    assert.strictEqual(req.query.limit, '100')
    assert.strictEqual(nextCalled, true)
  })

  it('normalizes invalid numeric query params to the minimum', () => {
    const req = { query: { pageSize: 'abc', limit: '-10' } } as any

    normalizeQueryLimits(req, {} as any, () => undefined)

    assert.strictEqual(req.query.pageSize, '1')
    assert.strictEqual(req.query.limit, '1')
  })
})
