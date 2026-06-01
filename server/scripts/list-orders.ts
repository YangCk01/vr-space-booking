import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const start = new Date('2026-05-27T00:00:00+08:00')
  const end = new Date('2026-05-28T00:00:00+08:00')

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['PAID', 'COMPLETED', 'REFUNDED'] },
      paidAt: { gte: start, lt: end }
    },
    select: {
      orderNo: true,
      status: true,
      paidAt: true,
      principalDeduction: true,
      bonusDeduction: true,
      pointsUsed: true,
    },
    orderBy: { paidAt: 'asc' }
  })

  console.log('27号 PAID/COMPLETED/REFUNDED 订单:')
  for (const o of orders) {
    console.log(`${o.paidAt?.toISOString()} | ${o.orderNo} | ${o.status} | 本金:${o.principalDeduction} | 赠送:${o.bonusDeduction} | 积分:${o.pointsUsed}`)
  }

  console.log('\n27号 CANCELLED 订单:')
  const cancelled = await prisma.order.findMany({
    where: {
      status: 'CANCELLED',
      paidAt: { gte: start, lt: end }
    },
    select: {
      orderNo: true,
      status: true,
      paidAt: true,
      cancelledAt: true,
      principalDeduction: true,
      bonusDeduction: true,
      pointsUsed: true,
    },
    orderBy: { paidAt: 'asc' }
  })
  for (const o of cancelled) {
    console.log(`${o.paidAt?.toISOString()} | ${o.orderNo} | ${o.status} | 取消于:${o.cancelledAt?.toISOString()} | 本金:${o.principalDeduction} | 赠送:${o.bonusDeduction} | 积分:${o.pointsUsed}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
