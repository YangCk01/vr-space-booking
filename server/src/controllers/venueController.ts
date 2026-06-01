import { Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'

export const createValidators = [
  body('name').notEmpty().withMessage('场地名称不能为空'),
  body('area').isInt({ min: 1 }).withMessage('面积必须是正整数'),
  body('capacity').isInt({ min: 1 }).withMessage('容量必须是正整数'),
  body('deviceCount').optional().isInt({ min: 1 }).withMessage('设备数量必须是正整数'),
]

export const updateValidators = [
  param('id').notEmpty().withMessage('ID 不能为空'),
  body('name').optional().notEmpty().withMessage('场地名称不能为空'),
  body('area').optional().isInt({ min: 1 }).withMessage('面积必须是正整数'),
  body('capacity').optional().isInt({ min: 1 }).withMessage('容量必须是正整数'),
  body('deviceCount').optional().isInt({ min: 1 }).withMessage('设备数量必须是正整数'),
]

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined
    const page = (req.query.page as string) || '1'
    const pageSize = (req.query.pageSize as string) || '20'
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}

    // MANAGER 只能查看被分配的场地
    if (req.user?.role === 'MANAGER' && req.user.managedVenueIds?.length) {
      where.id = { in: req.user.managedVenueIds }
    } else if (req.user?.role === 'MANAGER') {
      return paginated(res, [], pageNum, sizeNum, 0)
    }

    if (status && status !== 'all') {
      const statusMap: Record<string, string> = {
        free: 'FREE',
        'in-use': 'IN_USE',
        'in_use': 'IN_USE',
        maintenance: 'MAINTENANCE',
        disabled: 'DISABLED',
      }
      where.status = statusMap[status.toLowerCase()] || status.toUpperCase()
    }

    if (search) {
      where.AND = where.AND || []
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { theme: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.venue.count({ where }),
    ])

    return paginated(res, venues, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    
    // MANAGER 只能查看被分配的场地
    if (req.user?.role === 'MANAGER' && !req.user.managedVenueIds?.includes(id)) {
      return error(res, '无权访问该场地', 403)
    }
    
    const venue = await prisma.venue.findUnique({ where: { id } })

    if (!venue) {
      return error(res, '场地不存在', 404)
    }

    return success(res, venue)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function create(req: Request, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const venue = await prisma.venue.create({
      data: {
        name: req.body.name,
        theme: req.body.theme || '',
        status: req.body.status || 'FREE',
        area: parseInt(req.body.area),
        capacity: parseInt(req.body.capacity),
        deviceCount: parseInt(req.body.deviceCount) || 1,
        image: req.body.image || null,
        description: req.body.description || null,
        address: req.body.address || null,
        phone: req.body.phone || null,
        openTime: req.body.openTime || '09:00',
        closeTime: req.body.closeTime || '22:00',
        maintenanceStartDate: req.body.maintenanceStartDate ? new Date(req.body.maintenanceStartDate) : null,
        maintenanceEndDate: req.body.maintenanceEndDate ? new Date(req.body.maintenanceEndDate) : null,
        maintenanceStartTime: req.body.maintenanceStartTime || null,
        maintenanceEndTime: req.body.maintenanceEndTime || null,
      },
    })
    return success(res, venue, '场地创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const id = req.params.id as string
    const existing = await prisma.venue.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '场地不存在', 404)
    }

    const data: any = {}
    if (req.body.name !== undefined) data.name = req.body.name
    if (req.body.theme !== undefined) data.theme = req.body.theme
    if (req.body.status !== undefined) data.status = req.body.status
    if (req.body.area !== undefined) data.area = parseInt(req.body.area)
    if (req.body.capacity !== undefined) data.capacity = parseInt(req.body.capacity)
    if (req.body.deviceCount !== undefined) data.deviceCount = parseInt(req.body.deviceCount)
    if (req.body.image !== undefined) data.image = req.body.image
    if (req.body.description !== undefined) data.description = req.body.description
    if (req.body.address !== undefined) data.address = req.body.address
    if (req.body.phone !== undefined) data.phone = req.body.phone
    if (req.body.openTime !== undefined) data.openTime = req.body.openTime || '09:00'
    if (req.body.closeTime !== undefined) data.closeTime = req.body.closeTime || '22:00'
    if (req.body.maintenanceStartDate !== undefined) data.maintenanceStartDate = req.body.maintenanceStartDate ? new Date(req.body.maintenanceStartDate) : null
    if (req.body.maintenanceEndDate !== undefined) data.maintenanceEndDate = req.body.maintenanceEndDate ? new Date(req.body.maintenanceEndDate) : null
    if (req.body.maintenanceStartTime !== undefined) data.maintenanceStartTime = req.body.maintenanceStartTime || null
    if (req.body.maintenanceEndTime !== undefined) data.maintenanceEndTime = req.body.maintenanceEndTime || null

    const venue = await prisma.venue.update({
      where: { id },
      data,
    })
    return success(res, venue, '场地更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existing = await prisma.venue.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '场地不存在', 404)
    }

    await prisma.venue.delete({ where: { id } })
    return success(res, null, '场地删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
