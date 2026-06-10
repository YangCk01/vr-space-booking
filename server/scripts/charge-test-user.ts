import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const user = await prisma.user.update({
    where: { phone: '13800138001' },
    data: { balance: 200000, bonusBalance: 100000, level: 'NORMAL' }
  })
  console.log('Updated:', user.phone, 'balance:', user.balance, 'bonusBalance:', user.bonusBalance, 'level:', user.level)
}
main().catch(console.error).finally(() => prisma.$disconnect())
