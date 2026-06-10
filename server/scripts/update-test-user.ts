import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const user = await prisma.user.findFirst({ where: { phone: '13800138001' }, select: { id: true, phone: true, name: true, level: true, balance: true, bonusBalance: true } })
  console.log(JSON.stringify(user, null, 2))
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { level: 'NORMAL', balance: 100000, bonusBalance: 50000 }
    })
    console.log('Updated user: NORMAL level, balance=100000, bonusBalance=50000')
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
