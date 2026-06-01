import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== 检查每个用户的积分余额 vs 流水累计 ===\n')

  const users = await prisma.user.findMany({
    select: { id: true, name: true, phone: true, points: true }
  })

  const txSums = await prisma.balanceTransaction.groupBy({
    by: ['userId'],
    _sum: { pointsAmount: true }
  })

  const txMap = new Map(txSums.map(t => [t.userId, t._sum.pointsAmount || 0]))

  let totalDiff = 0
  for (const user of users) {
    const txSum = txMap.get(user.id) || 0
    const diff = user.points - txSum
    if (diff !== 0) {
      console.log(`用户 ${user.name} (${user.phone})`)
      console.log(`  当前积分: ${user.points}`)
      console.log(`  流水累计: ${txSum}`)
      console.log(`  差异: ${diff}`)
      totalDiff += diff

      // 查看该用户的积分流水明细
      const txs = await prisma.balanceTransaction.findMany({
        where: { userId: user.id, pointsAmount: { not: 0 } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, type: true, pointsAmount: true, createdAt: true, remark: true, orderId: true
        }
      })
      console.log(`  积分流水明细 (${txs.length}条):`)
      for (const tx of txs) {
        console.log(`    ${tx.createdAt.toISOString()} | ${tx.type} | ${tx.pointsAmount} | ${tx.remark || ''}`)
      }
    }
  }

  console.log(`\n总差异: ${totalDiff}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
