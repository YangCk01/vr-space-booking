import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()
async function main() {
  const user = await prisma.user.findUnique({ where: { phone: '13123233234' } })
  console.log('User exists:', !!user)
  if (user) {
    console.log('Name:', user.name, 'Level:', user.level)
    console.log('Password hash:', user.password?.substring(0, 30) + '...')
    const isValid = await bcrypt.compare('test123', user.password)
    console.log('test123 valid:', isValid)
    const isValid2 = await bcrypt.compare('123456', user.password)
    console.log('123456 valid:', isValid2)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
