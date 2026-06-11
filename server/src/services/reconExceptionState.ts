import { prisma } from '../utils/prisma'

export type ReconExceptionInput = {
  exceptionType: string
  bizType?: string
  bizOrderNo?: string
  diffAmount: number
}

export async function findHandledReconException(dateStr: string, input: ReconExceptionInput) {
  return prisma.reconException.findFirst({
    where: {
      exceptionType: input.exceptionType as any,
      exceptionStatus: { not: 'PENDING' },
      bizType: input.bizType || null,
      bizOrderNo: input.bizOrderNo || null,
      diffAmount: input.diffAmount,
      batch: { reconDate: dateStr },
    },
    orderBy: { handledAt: 'desc' },
  })
}

export async function summarizePendingReconExceptions(batchId: string) {
  const [count, amount] = await Promise.all([
    prisma.reconException.count({
      where: { batchId, exceptionStatus: 'PENDING' },
    }),
    prisma.reconException.aggregate({
      where: { batchId, exceptionStatus: 'PENDING' },
      _sum: { diffAmount: true },
    }),
  ])

  return {
    count,
    amount: amount._sum?.diffAmount || 0,
  }
}
