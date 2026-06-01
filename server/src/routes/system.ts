import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'

const router = Router()

router.use(authenticate, requireRole('SUPER_ADMIN'))

/**
 * GET /system/health-checks
 * 查看历史数据一致性校验记录
 */
router.get('/health-checks', async (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const checkType = (req.query.checkType as string) || undefined
    const status = (req.query.status as string) || undefined
    const startDate = (req.query.startDate as string) || undefined
    const endDate = (req.query.endDate as string) || undefined

    const where: any = {}
    if (checkType) where.checkType = checkType
    if (status) where.status = status
    if (startDate || endDate) {
      where.checkDate = {}
      if (startDate) where.checkDate.gte = startDate
      if (endDate) where.checkDate.lte = endDate
    }

    const [data, total] = await Promise.all([
      prisma.dataCheckResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dataCheckResult.count({ where }),
    ])

    return paginated(res, data, page, pageSize, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
})

export default router
