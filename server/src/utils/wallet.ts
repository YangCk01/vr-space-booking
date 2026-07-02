import { prisma } from './prisma'
import {
  calculateBalanceDebit,
  hasSufficientBalance,
  type WalletBalance,
} from '../domain/walletLedger'

export type Wallet = WalletBalance

/**
 * 计算本金系数 = 本金 / (本金 + 赠送)
 * 返回 0~1 之间的小数，保留两位
 */
export function getPrincipalRatio(wallet: Wallet): number {
  const total = wallet.principal + wallet.bonus
  if (total === 0) return 1
  return Math.round((wallet.principal / total) * 100) / 100
}

/**
 * 等比扣除：按本金系数从两个钱包中扣除指定金额
 * 返回各自扣减金额，保证 principalDeduction + bonusDeduction = totalFen
 */
export function deductProportional(
  wallet: Wallet,
  totalFen: number
): { principalDeduction: number; bonusDeduction: number } {
  const debit = calculateBalanceDebit({ wallet, amount: totalFen })
  return {
    principalDeduction: debit.principalAmount,
    bonusDeduction: debit.bonusAmount,
  }
}

/**
 * 检查钱包总额是否足够
 */
export function hasEnoughBalance(wallet: Wallet, needFen: number): boolean {
  return hasSufficientBalance(wallet, needFen)
}

/**
 * 获取用户钱包（便捷函数）
 */
export async function getUserWallet(userId: string): Promise<Wallet> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { principalBalance: true, bonusBalance: true }
  })
  if (!user) throw new Error('用户不存在')
  return {
    principal: user.principalBalance,
    bonus: user.bonusBalance,
  }
}
