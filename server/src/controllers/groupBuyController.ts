import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'

const groupBuyVenueSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  openTime: true,
  closeTime: true,
  image: true,
  status: true,
  maintenanceStartDate: true,
  maintenanceEndDate: true,
  maintenanceStartTime: true,
  maintenanceEndTime: true,
} as const

export async function list(req: Request, res: Response) {
  try {
    const { status, type, gameId, page = '1', pageSize = '20' } = req.query
    const where: any = {}
    if (status) where.status = status as string
    if (type) where.type = type as string
    if (gameId) where.gameId = gameId as string

    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const [packages, total] = await Promise.all([
      prisma.groupBuyPackage.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        include: { game: { select: { id: true, title: true, coverImage: true, duration: true } }, venues: { select: groupBuyVenueSelect } },
      }),
      prisma.groupBuyPackage.count({ where }),
    ])

    return success(res, { data: packages, total, page: pageNum, pageSize: sizeNum, totalPages: Math.ceil(total / sizeNum) })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function publicList(req: Request, res: Response) {
  try {
    const { type, gameId } = req.query
    const where: any = { status: 'ACTIVE' }
    if (type && type !== 'all') where.type = type as string
    if (gameId) where.gameId = gameId as string

    const packages = await prisma.groupBuyPackage.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { game: { select: { id: true, title: true, subtitle: true, coverImage: true, duration: true, tags: true } }, venues: { select: groupBuyVenueSelect } },
    })

    return success(res, packages)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const pkg = await prisma.groupBuyPackage.findUnique({
      where: { id },
      include: { game: { select: { id: true, title: true, subtitle: true, coverImage: true, duration: true, tags: true } }, venues: { select: groupBuyVenueSelect } },
    })
    if (!pkg) return error(res, '团购套餐不存在', 404)
    return success(res, pkg)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function publicGetById(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const pkg = await prisma.groupBuyPackage.findFirst({
      where: { id, status: 'ACTIVE' },
      include: {
        game: { select: { id: true, title: true, subtitle: true, coverImage: true, duration: true, tags: true } },
        venues: { select: groupBuyVenueSelect },
      },
    })
    if (!pkg) return error(res, '团购套餐不存在或已下架', 404)
    return success(res, pkg)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function create(req: Request, res: Response) {
  try {
    const data = req.body
    const pkg = await prisma.groupBuyPackage.create({
      data: {
        gameId: data.gameId,
        title: data.title,
        venues: { connect: (data.venueIds || []).map((id: string) => ({ id })) },
        subtitle: data.subtitle || null,
        type: data.type || 'DOUBLE',
        label: data.label || '双人团',
        minPeople: data.minPeople ?? 2,
        maxPeople: data.maxPeople ?? 2,
        originalPricePerPerson: data.originalPricePerPerson ?? 0,
        groupPricePerPerson: data.groupPricePerPerson ?? 0,
        totalGroupPrice: data.totalGroupPrice ?? 0,
        coverImage: data.coverImage || null,
        tags: data.tags || [],
        status: data.status || 'ACTIVE',
        sortOrder: data.sortOrder ?? 0,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        description: data.description || null,
        soldText: data.soldText || '近期售 200+',
        refundTags: data.refundTags || ['随时退', '过期自动退'],
        packageItems: data.packageItems || [],
        processSteps: data.processSteps || ['购买团购券', '选择门店与场次', '到店核销入场'],
        notice: data.notice || null,
        refundNotice: data.refundNotice || null,
        buyButtonText: data.buyButtonText || '立即抢购',
      },
    })
    return success(res, pkg, '创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const data = req.body
    const existing = await prisma.groupBuyPackage.findUnique({ where: { id } })
    if (!existing) return error(res, '团购套餐不存在', 404)

    const pkg = await prisma.groupBuyPackage.update({
      where: { id },
      data: {
        gameId: data.gameId ?? existing.gameId,
        title: data.title ?? existing.title,
        venues: data.venueIds !== undefined ? { set: data.venueIds.map((id: string) => ({ id })) } : undefined,
        subtitle: data.subtitle !== undefined ? data.subtitle : existing.subtitle,
        type: data.type ?? existing.type,
        label: data.label ?? existing.label,
        minPeople: data.minPeople ?? existing.minPeople,
        maxPeople: data.maxPeople ?? existing.maxPeople,
        originalPricePerPerson: data.originalPricePerPerson ?? existing.originalPricePerPerson,
        groupPricePerPerson: data.groupPricePerPerson ?? existing.groupPricePerPerson,
        totalGroupPrice: data.totalGroupPrice ?? existing.totalGroupPrice,
        coverImage: data.coverImage !== undefined ? data.coverImage : existing.coverImage,
        tags: data.tags ?? existing.tags,
        status: data.status ?? existing.status,
        sortOrder: data.sortOrder ?? existing.sortOrder,
        startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : existing.startDate,
        endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : existing.endDate,
        description: data.description !== undefined ? data.description : existing.description,
        soldText: data.soldText !== undefined ? data.soldText : existing.soldText,
        refundTags: data.refundTags !== undefined ? data.refundTags : existing.refundTags,
        packageItems: data.packageItems !== undefined ? data.packageItems : existing.packageItems,
        processSteps: data.processSteps !== undefined ? data.processSteps : existing.processSteps,
        notice: data.notice !== undefined ? data.notice : existing.notice,
        refundNotice: data.refundNotice !== undefined ? data.refundNotice : existing.refundNotice,
        buyButtonText: data.buyButtonText !== undefined ? data.buyButtonText : existing.buyButtonText,
      },
    })
    return success(res, pkg, '更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existing = await prisma.groupBuyPackage.findUnique({ where: { id } })
    if (!existing) return error(res, '团购套餐不存在', 404)
    await prisma.groupBuyPackage.delete({ where: { id } })
    return success(res, null, '删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function batchUpdateStatus(req: Request, res: Response) {
  try {
    const { ids, status } = req.body
    if (!Array.isArray(ids) || ids.length === 0) return error(res, '请选择要更新的套餐', 400)
    if (!status) return error(res, '状态不能为空', 400)
    const result = await prisma.groupBuyPackage.updateMany({
      where: { id: { in: ids } },
      data: { status },
    })
    return success(res, { updated: result.count }, `已更新 ${result.count} 个套餐`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function batchDelete(req: Request, res: Response) {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) return error(res, '请选择要删除的套餐', 400)
    const result = await prisma.groupBuyPackage.deleteMany({
      where: { id: { in: ids } },
    })
    return success(res, { deleted: result.count }, `已删除 ${result.count} 个套餐`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
