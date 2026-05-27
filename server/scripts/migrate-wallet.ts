/**
 * 数据迁移脚本：将单一 balance 拆分为 principalBalance + bonusBalance
 * 执行方式：npx ts-node scripts/migrate-wallet.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrate() {
  console.log('=== 开始双钱包数据迁移 ===')

  // Step 1: 为每个用户拆分余额
  const users = await prisma.user.findMany({
    include: { recharges: { where: { status: 'PAID' } } }
  })

  let migratedCount = 0
  for (const user of users) {
    // 如果已经迁移过（principalBalance > 0 或 bonusBalance > 0），跳过
    if (user.principalBalance > 0 || user.bonusBalance > 0) {
      console.log(`  [跳过] ${user.phone}: 已迁移`)
      continue
    }

    // 计算累计充值本金和赠送
    const totalRechargedPrincipal = user.recharges.reduce((sum, r) => sum + r.amount, 0)
    const totalRechargedBonus = user.recharges.reduce((sum, r) => sum + r.bonus, 0)
    const totalRecharged = totalRechargedPrincipal + totalRechargedBonus

    // 当前余额（旧字段）
    const currentBalance = user.balance

    let principalBalance: number
    let bonusBalance: number

    // 如果用户从未充值（balance 可能来自手动调整或其他途径）
    if (totalRecharged === 0) {
      // 全部视为本金
      principalBalance = currentBalance
      bonusBalance = 0
    } else {
      // 计算本金比例
      const principalRatio = totalRechargedPrincipal / totalRecharged
      // 按本金比例拆分当前余额（四舍五入到分）
      principalBalance = Math.round(currentBalance * principalRatio)
      bonusBalance = currentBalance - principalBalance
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        principalBalance,
        bonusBalance,
      }
    })

    console.log(`  [迁移] ${user.phone}: balance=${currentBalance} -> principal=${principalBalance}, bonus=${bonusBalance}`)
    migratedCount++
  }
  console.log(`Step 1 完成: ${migratedCount} 个用户已迁移`)

  // Step 2: 回填历史 Order 的 originalAmount
  const ordersToUpdate = await prisma.order.findMany({
    where: { originalAmount: 0 }
  })
  for (const order of ordersToUpdate) {
    // 策略：originalAmount = amount（因为没有原价记录，历史订单用 amount 作为原价）
    // 后续退款清算时，这部分历史订单会有偏差，需在 B 端标注
    await prisma.order.update({
      where: { id: order.id },
      data: { originalAmount: order.amount }
    })
  }
  console.log(`Step 2 完成: ${ordersToUpdate.length} 条历史订单的 originalAmount 已回填`)

  // Step 3: 回填历史 BalanceTransaction 的 principalAmount/bonusAmount
  const transactions = await prisma.balanceTransaction.findMany({
    include: { user: true }
  })
  let txUpdated = 0
  for (const tx of transactions) {
    // 如果已经有 principalAmount 或 bonusAmount（非默认值），跳过
    if (tx.principalAmount !== 0 || tx.bonusAmount !== 0) {
      continue
    }

    const user = await prisma.user.findUnique({ where: { id: tx.userId } })
    if (!user) continue

    if (tx.type === 'RECHARGE') {
      // 查找关联的充值记录
      const recharge = tx.rechargeId
        ? await prisma.rechargeRecord.findUnique({ where: { id: tx.rechargeId } })
        : null
      if (recharge) {
        await prisma.balanceTransaction.update({
          where: { id: tx.id },
          data: {
            principalAmount: recharge.amount,
            bonusAmount: recharge.bonus,
            totalAmount: recharge.total,
          }
        })
      } else {
        // 无关联充值记录，按用户当前比例拆分
        const total = user.principalBalance + user.bonusBalance
        const ratio = total > 0 ? user.principalBalance / total : 1
        const principal = Math.round(tx.amount * ratio)
        const bonus = tx.amount - principal
        await prisma.balanceTransaction.update({
          where: { id: tx.id },
          data: {
            principalAmount: principal,
            bonusAmount: bonus,
            totalAmount: tx.amount,
          }
        })
      }
    } else if (tx.type === 'DEDUCT') {
      // 消费扣款：按用户当前本金比例拆分
      const total = user.principalBalance + user.bonusBalance
      const ratio = total > 0 ? user.principalBalance / total : 1
      const principal = Math.round(tx.amount * ratio)
      const bonus = tx.amount - principal
      await prisma.balanceTransaction.update({
        where: { id: tx.id },
        data: {
          principalAmount: -principal,
          bonusAmount: -bonus,
          totalAmount: -tx.amount,
        }
      })
    } else if (tx.type === 'REFUND') {
      // 退款：按用户当前本金比例拆分
      const total = user.principalBalance + user.bonusBalance
      const ratio = total > 0 ? user.principalBalance / total : 1
      const principal = Math.round(tx.amount * ratio)
      const bonus = tx.amount - principal
      await prisma.balanceTransaction.update({
        where: { id: tx.id },
        data: {
          principalAmount: principal,
          bonusAmount: bonus,
          totalAmount: tx.amount,
        }
      })
    }
    txUpdated++
  }
  console.log(`Step 3 完成: ${txUpdated} 条历史流水已回填`)

  console.log('=== 迁移完成 ===')
}

migrate().catch(e => {
  console.error(e)
  process.exit(1)
}).finally(() => prisma['$disconnect']())
