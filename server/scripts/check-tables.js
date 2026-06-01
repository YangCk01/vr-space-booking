const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const tables = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  console.log('Tables:', tables.map(t => t.tablename).join(', '))

  const batches = await prisma.reconBatch.findMany({ take: 5 })
  console.log('Recon batches:', JSON.stringify(batches, null, 2))

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
