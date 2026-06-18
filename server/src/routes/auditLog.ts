import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { listAuditLogs } from '../services/auditLogService'
import { success, error } from '../utils/response'
import { prisma } from '../utils/prisma'

const router = Router()

router.use(authenticate, requirePermission('audit:read'))

router.get('/', async (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const operatorId = (req.query.operatorId as string) || undefined
    const operatorName = (req.query.operatorName as string) || undefined
    const action = (req.query.action as string) || undefined
    const targetType = (req.query.targetType as string) || undefined
    const startDate = (req.query.startDate as string) || undefined
    const endDate = (req.query.endDate as string) || undefined

    const result = await listAuditLogs({
      page,
      pageSize,
      operatorId,
      operatorName,
      action,
      targetType,
      startDate,
      endDate,
    })

    return success(res, { data: result.data, meta: result.meta }, '查询成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
})

router.get('/actions', async (req, res) => {
  try {
    const actions = await prisma.auditLog.groupBy({ by: ['action'], _count: true })
    return success(res, actions.map(a => a.action))
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
})

router.get('/target-types', async (req, res) => {
  try {
    const types = await prisma.auditLog.groupBy({ by: ['targetType'], _count: true })
    return success(res, types.map(t => t.targetType))
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
})

export default router
