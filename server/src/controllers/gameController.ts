import { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'

export const createValidators = [
  body('title').notEmpty().withMessage('标题不能为空'),
  body('price').optional().isInt({ min: 0 }).withMessage('价格必须为非负整数'),
  body('duration').optional().isInt({ min: 1 }).withMessage('时长必须为正整数'),
  body('sortOrder').optional().isInt().withMessage('排序必须为整数'),
]

export async function list(req: Request, res: Response) {
  try {
    const { status } = req.query
    const where: any = {}
    if (status) {
      where.status = status as string
    }

    const games = await prisma.game.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return success(res, games)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const game = await prisma.game.findUnique({ where: { id } })
    if (!game) {
      return error(res, '游戏内容不存在', 404)
    }
    return success(res, game)
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
    const { title, subtitle, description, notice, coverImage, price, duration, tags, detailImages, status, sortOrder } = req.body
    const game = await prisma.game.create({
      data: {
        title,
        subtitle: subtitle || null,
        description: description || null,
        notice: notice || null,
        coverImage: coverImage || null,
        price: price !== undefined ? parseInt(price) : 0,
        duration: duration !== undefined ? parseInt(duration) : 30,
        tags: tags || [],
        detailImages: detailImages || [],
        status: status || 'ACTIVE',
        sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0,
      },
    })
    return success(res, game, '创建成功', 201)
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
    const { title, subtitle, description, notice, coverImage, price, duration, tags, detailImages, status, sortOrder } = req.body

    const existing = await prisma.game.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '游戏内容不存在', 404)
    }

    const game = await prisma.game.update({
      where: { id: id as string },
      data: {
        title,
        subtitle: subtitle !== undefined ? subtitle : existing.subtitle,
        description: description !== undefined ? description : existing.description,
        notice: notice !== undefined ? notice : existing.notice,
        coverImage: coverImage !== undefined ? coverImage : existing.coverImage,
        price: price !== undefined ? parseInt(price) : existing.price,
        duration: duration !== undefined ? parseInt(duration) : existing.duration,
        tags: tags !== undefined ? tags : existing.tags,
        detailImages: detailImages !== undefined ? detailImages : existing.detailImages,
        status: status !== undefined ? status : existing.status,
        sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : existing.sortOrder,
      },
    })
    return success(res, game, '更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existing = await prisma.game.findUnique({ where: { id } })
    if (!existing) {
      return error(res, '游戏内容不存在', 404)
    }
    await prisma.game.delete({ where: { id } })
    return success(res, null, '删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
