import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()
async function main() {
  const hash = await bcrypt.hash('test123', 10)
  await prisma.user.update({
    where: { phone: '13123233234' },
    data: { password: hash }
  })
  console.log('Reset password for 13123233234 to test123')
}
main().catch(console.error).finally(() => prisma.$disconnect())
