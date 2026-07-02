import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVouchers, computeAuditStatus, resolveAuditDateRange } from './financeController'

test('cancelled audit records with retained payment are over instead of consumed income', () => {
  assert.equal(computeAuditStatus(7480, 0, 'cancelled', 'pending_recon'), 'over')

  const vouchers = buildVouchers({
    consumeStatus: 'cancelled',
    actualRecv: 7480,
    expectedRecv: 0,
    gatewayFee: 0,
  }, 6)

  assert.deepEqual(vouchers, [
    { subject: '银行存款', debit: 7480, credit: 0, summary: '取消单已收款' },
    { subject: '其他应付款-待退款/待处理款', debit: 0, credit: 7480, summary: '取消单未确认收入' },
  ])
})

test('resolveAuditDateRange defaults unbounded audit queries to the latest 31 days', () => {
  const range = resolveAuditDateRange({}, new Date('2026-07-02T12:00:00.000Z'))

  assert.deepEqual(range, {
    startDate: '2026-06-02',
    endDate: '2026-07-02',
  })
})

test('resolveAuditDateRange caps audit queries at 93 days', () => {
  const range = resolveAuditDateRange({
    startDate: '2026-01-01',
    endDate: '2026-07-02',
  })

  assert.deepEqual(range, {
    startDate: '2026-03-31',
    endDate: '2026-07-02',
  })
})
