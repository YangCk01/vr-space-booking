const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // 直接清空对账相关表，重新对账时会重建
  const delExc = await prisma.reconException.deleteMany()
  console.log('Deleted exceptions:', delExc.count)

  const delBatch = await prisma.reconBatch.deleteMany()
  console.log('Deleted batches:', delBatch.count)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
