import { prisma } from '../src/utils/prisma'
import { validateBalanceConsistency } from '../src/domain/storeBalance'

async function main() {
  const result = await validateBalanceConsistency(prisma)
  console.log(JSON.stringify(result, null, 2))
  if (!result.valid) {
    console.error('门店余额与全局余额不一致')
    process.exit(1)
  }
  console.log('门店余额与全局余额一致')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
