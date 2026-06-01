import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const userId = '2ffc0008-c8ac-4db9-b7e8-2b822e0c25bb'

  console.log('=== 用户所有历史订单 ===\n')
  const orders = await prisma.order.findMany({
    where: { userId },
    select: {
      orderNo: true,
      status: true,
      paidAt: true,
      cancelledAt: true,
      pointsUsed: true,
      pointsDeduction: true,
      principalDeduction: true,
      bonusDeduction: true,
      amount: true,
    },
    orderBy: { createdAt: 'asc' }
  })

  for (const o of orders) {
    const txs = await prisma.balanceTransaction.findMany({
      where: { orderId: o.orderNo ? undefined : undefined },
      select: { id: true, type: true, pointsAmount: true, remark: true }
    })
    // 通过 orderNo 查找 orderId 再查流水
    const order = await prisma.order.findUnique({
      where: { orderNo: o.orderNo },
      select: { id: true }
    })
    const orderTxs = order ? await prisma.balanceTransaction.findMany({
      where: { orderId: order.id, pointsAmount: { not: 0 } },
      select: { type: true, pointsAmount: true, remark: true }
    }) : []

    console.log(`${o.orderNo} | ${o.status} | paid:${o.paidAt?.toISOString().slice(0,16)} | pointsUsed:${o.pointsUsed} | 流水积分:${orderTxs.reduce((s,t)=>s+t.pointsAmount,0)} | ${orderTxs.map(t=>t.type+':'+t.pointsAmount).join(', ')}`)
  }

  console.log('\n=== 用户积分余额 ===')
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true, createdAt: true } })
  console.log(`当前积分: ${user?.points}, 注册时间: ${user?.createdAt}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
