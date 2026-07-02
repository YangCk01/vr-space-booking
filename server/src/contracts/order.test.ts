import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { payOrderSchema, refundOrderSchema } from './order'

describe('order contracts', () => {
  it('accepts balance payment while real channel payment is not integrated', () => {
    const parsed = payOrderSchema.parse({ method: 'balance' })
    assert.deepStrictEqual(parsed, { method: 'BALANCE' })
  })

  it('accepts legacy payMethod alias and requires an explicit payment method', () => {
    assert.deepStrictEqual(payOrderSchema.parse({ payMethod: 'cash' }), { method: 'CASH' })
    assert.throws(() => payOrderSchema.parse({}), /请选择收款方式/)
  })

  it('rejects unsupported payment methods before channel integration', () => {
    assert.throws(() => payOrderSchema.parse({ method: 'WECHAT' }), /暂未接入/)
  })

  it('requires a refund reason and positive optional amount', () => {
    assert.throws(() => refundOrderSchema.parse({ reason: '  ' }), /退款原因不能为空/)
    assert.throws(() => refundOrderSchema.parse({ reason: '客户取消', amount: 0 }), /退款金额必须大于0/)
  })
})
