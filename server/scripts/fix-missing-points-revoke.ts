import { PrismaClient } from '@prisma/client'
import { getPointsConfig } from '../src/utils/memberConfig'

const prisma = new PrismaClient()

async function main() {
  const { earnRate } = await getPointsConfig()
  console.log(`积分赠送率: ${earnRate}`)

  // 找出所有 CANCELLED 或 REFUNDED 的订单
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['CANCELLED', 'REFUNDED'] },
      principalDeduction: { gt: 0 },
      userId: { not: null },
    },
    select: {
      id: true,
      orderNo: true,
      userId: true,
      principalDeduction: true,
      status: true,
      cancelledAt: true,
      updatedAt: true,
    },
  })

  console.log(`\n找到 ${orders.length} 笔取消/退款且本金扣款>0的订单`)

  let fixedCount = 0
  let skippedCount = 0
  let totalFixedPoints = 0

  for (const order of orders) {
    const earned = Math.floor(order.principalDeduction / 100 * earnRate)
    if (earned <= 0) {
      skippedCount++
      continue
    }

    // 检查是否已有 POINTS_REVOKE 流水
    const existingRevoke = await prisma.balanceTransaction.findFirst({
      where: {
        orderId: order.id,
        type: 'POINTS_REVOKE',
      },
    })

    if (existingRevoke) {
      console.log(`  [跳过] ${order.orderNo} 已有 POINTS_REVOKE 流水 (${existingRevoke.pointsAmount}分)`)
      skippedCount++
      continue
    }

    // 检查是否已有其他形式的收回流水（比如旧代码可能用 POINTS_EARN 负值）
    const existingNegativeEarn = await prisma.balanceTransaction.findFirst({
      where: {
        orderId: order.id,
        type: 'POINTS_EARN',
        pointsAmount: { lt: 0 },
      },
    })

    if (existingNegativeEarn) {
      console.log(`  [跳过] ${order.orderNo} 已有负值 POINTS_EARN 流水 (${existingNegativeEarn.pointsAmount}分)`)
      skippedCount++
      continue
    }

    // 补录缺失的 POINTS_REVOKE 流水
    const revokeTx = await prisma.balanceTransaction.create({
      data: {
        userId: order.userId!,
        type: 'POINTS_REVOKE',
        amount: 0,
        pointsAmount: -earned,
        orderId: order.id,
        remark: `订单${order.status === 'CANCELLED' ? '取消' : '退款'}收回赠送积分 ${earned}`,
        createdAt: order.status === 'CANCELLED' ? order.cancelledAt! : order.updatedAt,
      },
    })

    console.log(`  [补录] ${order.orderNo} | ${order.status} | 本金¥${(order.principalDeduction / 100).toFixed(2)} | 收回积分:${earned} | 流水ID:${revokeTx.id}`)
    fixedCount++
    totalFixedPoints += earned
  }

  console.log(`\n修复完成:`)
  console.log(`  补录流水: ${fixedCount} 笔`)
  console.log(`  跳过(已有流水): ${skippedCount} 笔`)
  console.log(`  合计补录积分: ${totalFixedPoints} 分`)

  // 验证修复后的总对账
  console.log(`\n=== 验证修复后积分总账 ===`)
  const [users, txSum] = await Promise.all([
    prisma.user.findMany({ select: { points: true } }),
    prisma.balanceTransaction.aggregate({ _sum: { pointsAmount: true } }),
  ])
  const totalPoints = users.reduce((s, u) => s + u.points, 0)
  const expectedPoints = txSum._sum?.pointsAmount || 0
  console.log(`用户积分余额合计: ${totalPoints}`)
  console.log(`流水积分累计合计: ${expectedPoints}`)
  console.log(`差异: ${totalPoints - expectedPoints}`)
}

main()
  .catch((err) => {
    console.error('修复失败:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
