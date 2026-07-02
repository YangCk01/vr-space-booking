import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateBalanceDebit,
  calculateRefundSplitFromDeduction,
} from './walletLedger'

test('calculateBalanceDebit splits a debit proportionally between principal and bonus', () => {
  const debit = calculateBalanceDebit({
    wallet: { principal: 8000, bonus: 2000 },
    amount: 2500,
  })

  assert.deepEqual(debit, {
    amount: 2500,
    principalAmount: 2000,
    bonusAmount: 500,
    totalAmount: 2500,
  })
})

test('calculateBalanceDebit uses the other wallet pocket when proportional split exceeds one pocket', () => {
  const debit = calculateBalanceDebit({
    wallet: { principal: 100, bonus: 10000 },
    amount: 5000,
  })

  assert.equal(debit.principalAmount + debit.bonusAmount, 5000)
  assert.equal(debit.principalAmount, 50)
  assert.equal(debit.bonusAmount, 4950)
})

test('calculateBalanceDebit rejects insufficient balance', () => {
  assert.throws(
    () => calculateBalanceDebit({
      wallet: { principal: 100, bonus: 200 },
      amount: 301,
    }),
    /余额不足/
  )
})

test('calculateRefundSplitFromDeduction refunds by original principal and bonus ratio', () => {
  const refund = calculateRefundSplitFromDeduction({
    originalPrincipalDeduction: 7000,
    originalBonusDeduction: 3000,
    refundAmount: 2500,
  })

  assert.deepEqual(refund, {
    amount: 2500,
    principalAmount: 1750,
    bonusAmount: 750,
    totalAmount: 2500,
  })
})

test('calculateRefundSplitFromDeduction never refunds more than the original pocket deductions', () => {
  const refund = calculateRefundSplitFromDeduction({
    originalPrincipalDeduction: 100,
    originalBonusDeduction: 0,
    refundAmount: 250,
  })

  assert.deepEqual(refund, {
    amount: 100,
    principalAmount: 100,
    bonusAmount: 0,
    totalAmount: 100,
  })
})

test('calculateRefundSplitFromDeduction falls back to principal when original split is missing', () => {
  const refund = calculateRefundSplitFromDeduction({
    originalPrincipalDeduction: 0,
    originalBonusDeduction: 0,
    refundAmount: 500,
  })

  assert.deepEqual(refund, {
    amount: 500,
    principalAmount: 500,
    bonusAmount: 0,
    totalAmount: 500,
  })
})
