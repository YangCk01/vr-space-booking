export interface WalletBalance {
  principal: number
  bonus: number
}

export interface WalletSplit {
  amount: number
  principalAmount: number
  bonusAmount: number
  totalAmount: number
}

export interface BalanceDebitInput {
  wallet: WalletBalance
  amount: number
}

export interface RefundSplitInput {
  originalPrincipalDeduction: number
  originalBonusDeduction: number
  refundAmount: number
}

export function hasSufficientBalance(wallet: WalletBalance, amount: number): boolean {
  return wallet.principal + wallet.bonus >= amount
}

export function calculateBalanceDebit(input: BalanceDebitInput): WalletSplit {
  const amount = Math.max(0, input.amount)
  if (amount === 0) {
    return { amount: 0, principalAmount: 0, bonusAmount: 0, totalAmount: 0 }
  }

  if (!hasSufficientBalance(input.wallet, amount)) {
    throw new Error(`余额不足，当前总余额 ¥${(input.wallet.principal + input.wallet.bonus) / 100}`)
  }

  const total = input.wallet.principal + input.wallet.bonus
  let principalAmount = total === 0
    ? amount
    : Math.round(amount * input.wallet.principal / total)
  let bonusAmount = amount - principalAmount

  if (principalAmount > input.wallet.principal) {
    const shortfall = principalAmount - input.wallet.principal
    principalAmount = input.wallet.principal
    bonusAmount += shortfall
  }

  if (bonusAmount > input.wallet.bonus) {
    const shortfall = bonusAmount - input.wallet.bonus
    bonusAmount = input.wallet.bonus
    principalAmount += shortfall
  }

  const totalSplit = principalAmount + bonusAmount
  if (totalSplit !== amount) {
    principalAmount += amount - totalSplit
  }

  return {
    amount,
    principalAmount,
    bonusAmount,
    totalAmount: amount,
  }
}

export function calculateRefundSplitFromDeduction(input: RefundSplitInput): WalletSplit {
  const originalPrincipal = Math.max(0, input.originalPrincipalDeduction)
  const originalBonus = Math.max(0, input.originalBonusDeduction)
  const maxRefundAmount = originalPrincipal + originalBonus

  if (input.refundAmount <= 0) {
    return { amount: 0, principalAmount: 0, bonusAmount: 0, totalAmount: 0 }
  }

  if (maxRefundAmount === 0) {
    return {
      amount: input.refundAmount,
      principalAmount: input.refundAmount,
      bonusAmount: 0,
      totalAmount: input.refundAmount,
    }
  }

  const amount = Math.min(input.refundAmount, maxRefundAmount)
  const principalRatio = originalPrincipal / maxRefundAmount
  let principalAmount = Math.floor(amount * principalRatio)
  let bonusAmount = amount - principalAmount

  if (principalAmount > originalPrincipal) {
    const shortfall = principalAmount - originalPrincipal
    principalAmount = originalPrincipal
    bonusAmount += shortfall
  }

  if (bonusAmount > originalBonus) {
    const shortfall = bonusAmount - originalBonus
    bonusAmount = originalBonus
    principalAmount += shortfall
  }

  return {
    amount,
    principalAmount,
    bonusAmount,
    totalAmount: amount,
  }
}
