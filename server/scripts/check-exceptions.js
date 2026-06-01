const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const exc = await prisma.reconException.findMany({ include: { batch: true } })
  console.log('Exceptions count:', exc.length)
  exc.forEach((e, i) => {
    console.log(`\n[${i + 1}] ${e.exceptionType} | ${e.bizOrderNo} | diff: ¥${e.diffAmount / 100}`)
    console.log(`    remark: ${e.handleRemark}`)
    console.log(`    batch: ${e.batch.reconDate}`)
  })
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
