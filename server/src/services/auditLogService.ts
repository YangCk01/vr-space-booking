import { prisma } from '../utils/prisma'

export interface AuditLogInput {
  operatorId: string
  operatorName: string
  operatorRole: string
  targetType: string
  targetId: string
  targetDesc?: string | null
  action: string
  actionName: string
  beforeValue?: any
  afterValue?: any
  diffValue?: any
  amount?: number | null
  reason: string
  ipAddress?: string | null
  userAgent?: string | null
}

export async function recordAuditLog(data: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        operatorId: data.operatorId,
        operatorName: data.operatorName,
        operatorRole: data.operatorRole,
        targetType: data.targetType,
        targetId: data.targetId,
        targetDesc: data.targetDesc,
        action: data.action,
        actionName: data.actionName,
        beforeValue: data.beforeValue ?? null,
        afterValue: data.afterValue ?? null,
        diffValue: data.diffValue ?? null,
        amount: data.amount ?? null,
        reason: data.reason,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    })
  } catch (err) {
    console.error('[AuditLog] 记录失败:', err)
  }
}

export async function listAuditLogs(options: {
  page: number
  pageSize: number
  operatorId?: string
  operatorName?: string
  action?: string
  targetType?: string
  startDate?: string
  endDate?: string
}) {
  const { page, pageSize, operatorId, operatorName, action, targetType, startDate, endDate } = options

  const where: any = {}
  if (operatorId) where.operatorId = operatorId
  if (operatorName) where.operatorName = { contains: operatorName, mode: 'insensitive' }
  if (action) where.action = action
  if (targetType) where.targetType = targetType
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = new Date(startDate + 'T00:00:00.000Z')
    if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z')
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}
