import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  await prisma.user.update({
    where: { phone: '13123233234' },
    data: { balance: 200000, bonusBalance: 100000, level: 'NORMAL' }
  })
  console.log('Charged user 13123233234: balance=200000, bonusBalance=100000, level=NORMAL')
}
main().catch(console.error).finally(() => prisma.$disconnect())
