import { Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'

export const createValidators = [
  body('name').notEmpty().withMessage('设备名称不能为空'),
  body('code').notEmpty().withMessage('设备编号不能为空'),
  body('type').notEmpty().withMessage('设备类型不能为空'),
  body('model').optional(),
]

export const updateValidators = [
  param('id').notEmpty().withMessage('ID 不能为空'),
  body('name').optional().notEmpty().withMessage('设备名称不能为空'),
]

export async function list(req: Request, res: Response) {
  try {
    const status = req.query.status as string | undefined
    const type = req.query.type as string | undefined
    const search = req.query.search as string | undefined
    const venueId = req.query.venueId as string | undefined
    const page = (req.query.page as string) || '1'
    const pageSize = (req.query.pageSize as string) || '20'
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}

    if (status && status !== 'all') {
      where.status = status.toUpperCase()
    }
    if (type && type !== 'all') {
      where.type = type.toUpperCase()
    }
    if (venueId && venueId !== 'all') {
      where.venueId = venueId
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [equipment, total] = await Promise.all([
      prisma.equipment.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        include: { venue: { select: { id: true, name: true } } },
      }),
      prisma.equipment.count({ where }),
    ])

    return paginated(res, equipment, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: {
        venue: { select: { id: true, name: true } },
        maintenances: { orderBy: { date: 'desc' }, take: 10 },
      },
    })

    if (!equipment) {
      return error(res, '设备不存在', 404)
    }

    return success(res, equipment)
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
    const equipment = await prisma.equipment.create({
      data: {
        name: req.body.name,
        code: req.body.code,
        type: req.body.type.toUpperCase(),
        model: req.body.model || null,
        status: req.body.status ? req.body.status.toUpperCase() : 'NORMAL',
        venueId: req.body.venueId || null,
        buyDate: req.body.buyDate ? new Date(req.body.buyDate) : null,
        warranty: req.body.warranty ? new Date(req.body.warranty) : null,
      },
    })
    return success(res, equipment, '设备创建成功', 201)
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
    const id = req.params.id
    const data: any = {}
    if (req.body.name) data.name = req.body.name
    if (req.body.code) data.code = req.body.code
    if (req.body.type) data.type = req.body.type.toUpperCase()
    if (req.body.model !== undefined) data.model = req.body.model || null
    if (req.body.status) data.status = req.body.status.toUpperCase()
    if (req.body.venueId !== undefined) data.venueId = req.body.venueId || null
    if (req.body.buyDate) data.buyDate = new Date(req.body.buyDate)
    if (req.body.warranty) data.warranty = new Date(req.body.warranty)
    if (req.body.lastMaint) data.lastMaint = new Date(req.body.lastMaint)

    const equipment = await prisma.equipment.update({
      where: { id: id as string },
      data,
    })
    return success(res, equipment, '设备更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    await prisma.equipment.delete({ where: { id } })
    return success(res, null, '设备删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Maintenance Records ─── */
export async function listMaintenance(req: Request, res: Response) {
  try {
    const equipmentId = req.params.id as string
    const records = await prisma.maintenanceRecord.findMany({
      where: { equipmentId },
      orderBy: { date: 'desc' },
    })
    return success(res, records)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function createMaintenance(req: Request, res: Response) {
  try {
    const record = await prisma.maintenanceRecord.create({
      data: {
        equipmentId: req.params.id as string,
        date: new Date(req.body.date || new Date()),
        type: req.body.type,
        description: req.body.description,
        operator: req.body.operator || null,
      },
    })
    return success(res, record, '维护记录创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
