import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const txs = await prisma.balanceTransaction.findMany({
    where: { type: 'POINTS_GIFT' },
    select: { remark: true, pointsAmount: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20
  })
  for (const tx of txs) {
    console.log(tx.createdAt.toISOString(), tx.pointsAmount, tx.remark)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
