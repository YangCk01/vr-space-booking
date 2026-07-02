import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertPaymentMethodAllowedForRole } from './paymentPolicy'

describe('assertPaymentMethodAllowedForRole', () => {
  it('allows customers to pay with balance', () => {
    assert.doesNotThrow(() => assertPaymentMethodAllowedForRole('CUSTOMER', 'BALANCE'))
  })

  it('blocks customers from marking cash or card as received', () => {
    assert.throws(
      () => assertPaymentMethodAllowedForRole('CUSTOMER', 'CASH'),
      /现金\/刷卡收款只能由门店员工操作/,
    )
    assert.throws(
      () => assertPaymentMethodAllowedForRole('CUSTOMER', 'CARD'),
      /现金\/刷卡收款只能由门店员工操作/,
    )
  })

  it('allows staff roles to collect cash or card payments', () => {
    assert.doesNotThrow(() => assertPaymentMethodAllowedForRole('OPERATOR', 'CASH'))
    assert.doesNotThrow(() => assertPaymentMethodAllowedForRole('ADMIN', 'CARD'))
  })
})
