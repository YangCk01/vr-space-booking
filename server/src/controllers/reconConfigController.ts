import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'

/**
 * 获取对账配置列表
 * GET /recon/configs
 */
export async function listConfigs(req: AuthenticatedRequest, res: Response) {
  try {
    const configs = await prisma.reconConfig.findMany({
      orderBy: { key: 'asc' },
    })
    return success(res, configs)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取单个配置
 * GET /recon/configs/:key
 */
export async function getConfig(req: AuthenticatedRequest, res: Response) {
  try {
    const key = req.params.key as string
    const config = await prisma.reconConfig.findUnique({ where: { key } })
    if (!config) return error(res, '配置不存在', 404)
    return success(res, config)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 创建或更新配置
 * PUT /recon/configs
 */
export async function upsertConfig(req: AuthenticatedRequest, res: Response) {
  try {
    const { key, value, description } = req.body
    if (!key || value === undefined) {
      return error(res, 'key 和 value 必填', 400)
    }

    const config = await prisma.reconConfig.upsert({
      where: { key },
      create: { key, value: String(value), description },
      update: { value: String(value), description },
    })

    return success(res, config, '配置已保存')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 删除配置
 * DELETE /recon/configs/:key
 */
export async function deleteConfig(req: AuthenticatedRequest, res: Response) {
  try {
    const key = req.params.key as string
    await prisma.reconConfig.delete({ where: { key } })
    return success(res, null, '配置已删除')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
