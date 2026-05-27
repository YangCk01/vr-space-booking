import { prisma } from './prisma'

export interface Wallet {
  principal: number
  bonus: number
}

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
  if (totalFen <= 0) return { principalDeduction: 0, bonusDeduction: 0 }

  const total = wallet.principal + wallet.bonus
  // 精确计算本金扣减：直接用本金/总余额的精确比例，不再中间四舍五入
  let principalDeduction = total === 0 ? totalFen : Math.round(totalFen * wallet.principal / total)
  let bonusDeduction = totalFen - principalDeduction

  // 边界保护：不能超过各自余额
  if (principalDeduction > wallet.principal) {
    const shortfall = principalDeduction - wallet.principal
    principalDeduction = wallet.principal
    bonusDeduction += shortfall
  }
  if (bonusDeduction > wallet.bonus) {
    const shortfall = bonusDeduction - wallet.bonus
    bonusDeduction = wallet.bonus
    principalDeduction += shortfall
  }

  // 最终校验：修正精度误差
  const totalDeducted = principalDeduction + bonusDeduction
  if (totalDeducted !== totalFen) {
    principalDeduction += totalFen - totalDeducted
  }

  return { principalDeduction, bonusDeduction }
}

/**
 * 检查钱包总额是否足够
 */
export function hasEnoughBalance(wallet: Wallet, needFen: number): boolean {
  return wallet.principal + wallet.bonus >= needFen
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
