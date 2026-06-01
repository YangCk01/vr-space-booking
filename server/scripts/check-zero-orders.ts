import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const orderNos = ['VR202605274681', 'VR202605277796']

  for (const no of orderNos) {
    const order = await prisma.order.findUnique({
      where: { orderNo: no },
      include: { transactions: true, payments: true }
    })
    console.log(`\n=== ${no} ===`)
    console.log(JSON.stringify(order, null, 2))
  }

  // 检查用户初始积分
  const user = await prisma.user.findUnique({
    where: { id: '2ffc0008-c8ac-4db9-b7e8-2b822e0c25bb' },
    select: { points: true, createdAt: true }
  })
  console.log(`\n用户注册时间: ${user?.createdAt}, 当前积分: ${user?.points}`)

  // 计算流水累计和实际余额的差异来源
  console.log('\n=== 逐笔核对积分 ===')
  const txs = await prisma.balanceTransaction.findMany({
    where: { userId: '2ffc0008-c8ac-4db9-b7e8-2b822e0c25bb', pointsAmount: { not: 0 } },
    orderBy: { createdAt: 'asc' }
  })

  let running = 0
  for (const tx of txs) {
    running += tx.pointsAmount
    console.log(`${tx.createdAt.toISOString()} | ${tx.type} | ${tx.pointsAmount} | 累计:${running} | ${tx.remark}`)
  }
  console.log(`\n流水累计: ${running}`)
  console.log(`实际余额: ${user?.points}`)
  console.log(`差异: ${(user?.points || 0) - running}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
