import { Router } from 'express'
import { prisma } from '../utils/prisma'

const router = Router()

router.get('/exceptions-count', async (_req, res) => {
  const count = await prisma.reconException.count()
  const all = await prisma.reconException.findMany({
    include: { batch: { select: { reconDate: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  res.json({ count, exceptions: all })
})

export default router
