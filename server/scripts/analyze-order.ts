import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const orderId = 'ca78aff3-454d-46ff-b380-ab2b38966aaf'
  const orderId2 = 'VR202605278010'

  console.log('=== 问题订单 ca78aff3-454d-46ff-b380-ab2b38966aaf ===\n')
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true, transactions: true }
  })
  console.log(JSON.stringify(order, null, 2))

  console.log('\n=== 订单 VR202605278010 ===\n')
  const order2 = await prisma.order.findUnique({
    where: { orderNo: orderId2 },
    include: { payments: true, transactions: true }
  })
  console.log(JSON.stringify(order2, null, 2))

  console.log('\n=== 27号所有DEDUCT流水 ===\n')
  const start = new Date('2026-05-27T00:00:00+08:00')
  const end = new Date('2026-05-28T00:00:00+08:00')
  const txs = await prisma.balanceTransaction.findMany({
    where: {
      type: 'DEDUCT',
      createdAt: { gte: start, lt: end }
    },
    orderBy: { createdAt: 'asc' }
  })
  for (const tx of txs) {
    console.log(`${tx.createdAt.toISOString()} | ${tx.id} | order:${tx.orderId} | 本金:${tx.principalAmount} | 赠送:${tx.bonusAmount} | 积分:${tx.pointsAmount} | ${tx.remark}`)
  }

  console.log('\n=== 27号所有POINTS_DEDUCT流水 ===\n')
  const ptxs = await prisma.balanceTransaction.findMany({
    where: {
      type: 'POINTS_DEDUCT',
      createdAt: { gte: start, lt: end }
    },
    orderBy: { createdAt: 'asc' }
  })
  for (const tx of ptxs) {
    console.log(`${tx.createdAt.toISOString()} | ${tx.id} | order:${tx.orderId} | 积分:${tx.pointsAmount} | ${tx.remark}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
