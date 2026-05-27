import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { getMemberLevels, getPointsConfig } from '../utils/memberConfig'

/** 公开接口：返回会员相关配置（供C端使用） */
export async function memberPublic(req: Request, res: Response) {
  try {
    const [levels, points] = await Promise.all([
      getMemberLevels(),
      getPointsConfig(),
    ])
    return success(res, { levels, points })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function list(req: Request, res: Response) {
  try {
    const category = req.query.category as string | undefined
    const where: any = {}
    if (category) where.category = category

    const settings = await prisma.systemSetting.findMany({
      where,
      orderBy: { key: 'asc' },
    })

    const result: Record<string, any> = {}
    for (const s of settings) {
      const raw = s.value as any
      // 兼容：如果 value 是原始值，包装为 { value: raw } 以便前端统一读取
      if (raw !== null && typeof raw === 'object' && 'value' in raw) {
        result[s.key] = raw
      } else {
        result[s.key] = { value: raw }
      }
    }

    return success(res, result)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getByKey(req: Request, res: Response) {
  try {
    const key = req.params.key as string
    const setting = await prisma.systemSetting.findUnique({ where: { key } })

    if (!setting) {
      return error(res, '设置项不存在', 404)
    }

    return success(res, setting.value)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  try {
    const { key, value, category } = req.body

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value, category: category || 'general' },
      create: { key, value, category: category || 'general' },
    })

    return success(res, setting, '设置保存成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function bulkUpdate(req: Request, res: Response) {
  try {
    const settings = req.body as Array<{ key: string; value: any; category?: string }>

    for (const s of settings) {
      await prisma.systemSetting.upsert({
        where: { key: s.key },
        update: { value: s.value, category: s.category || 'general' },
        create: { key: s.key, value: s.value, category: s.category || 'general' },
      })
    }

    return success(res, null, '设置批量保存成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
