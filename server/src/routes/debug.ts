import { Router } from 'express'
import { prisma } from '../utils/prisma'
import { success } from '../utils/response'

const router = Router()

router.get('/exceptions-count', async (_req, res) => {
  const count = await prisma.reconException.count()
  const all = await prisma.reconException.findMany({
    include: { batch: { select: { reconDate: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return success(res, { count, exceptions: all })
})

export default router
