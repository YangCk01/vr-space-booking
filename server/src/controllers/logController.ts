import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'

export async function list(req: Request, res: Response) {
  try {
    const { type, operator, startDate, endDate, page = '1', pageSize = '20' } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}

    if (type && type !== 'all') {
      where.type = type as string
    }

    if (operator) {
      where.operator = { contains: operator as string, mode: 'insensitive' }
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string)
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string + 'T23:59:59.999Z')
      }
    }

    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        include: {
          user: { select: { id: true, name: true, phone: true, role: true } },
        },
      }),
      prisma.operationLog.count({ where }),
    ])

    return paginated(res, logs, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getTypes(req: Request, res: Response) {
  try {
    const types = await prisma.operationLog.groupBy({
      by: ['type'],
      _count: { type: true },
      orderBy: { _count: { type: 'desc' } },
    })

    return success(res, types.map((t) => ({ type: t.type, count: t._count.type })))
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
