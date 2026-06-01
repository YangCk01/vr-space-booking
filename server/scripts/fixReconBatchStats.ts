/**
 * 修复 ReconBatch 统计数据与实际异常数量不一致的问题
 * 运行: npx tsx scripts/fixReconBatchStats.ts
 */
import { prisma } from '../src/utils/prisma'

async function main() {
  const batches = await prisma.reconBatch.findMany()
  console.log(`Found ${batches.length} batches to fix`)

  for (const batch of batches) {
    const actualExceptions = await prisma.reconException.count({
      where: { batchId: batch.id },
    })

    const actualMatched = await prisma.reconException.count({
      where: { batchId: batch.id, exceptionStatus: { in: ['MANUAL_FIXED', 'AUTO_FIXED'] } },
    })

    const excAmountAgg = await prisma.reconException.aggregate({
      where: { batchId: batch.id },
      _sum: { diffAmount: true },
    })

    const updates: any = {}
    if (batch.exceptionCount !== actualExceptions) {
      updates.exceptionCount = actualExceptions
    }
    if (batch.matchedCount !== actualMatched) {
      updates.matchedCount = actualMatched
    }
    const excAmount = excAmountAgg._sum?.diffAmount || 0
    if (batch.exceptionAmount !== excAmount) {
      updates.exceptionAmount = excAmount
    }

    if (Object.keys(updates).length > 0) {
      await prisma.reconBatch.update({
        where: { id: batch.id },
        data: updates,
      })
      console.log(`Fixed batch ${batch.reconDate}:`, updates)
    } else {
      console.log(`Batch ${batch.reconDate} OK`)
    }
  }

  console.log('Done')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
