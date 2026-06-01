import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { body, validationResult } from 'express-validator'
import { success, error } from '../utils/response'
import { getAllConfigs, updateConfig } from '../services/configService'

export const updateConfigValidators = [
  body('value').exists().withMessage('配置值不能为空'),
]

export async function listConfigs(req: AuthenticatedRequest, res: Response) {
  try {
    const configs = getAllConfigs()
    return success(res, configs)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function updateConfigByKey(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const key = req.params.key as string
    const { value } = req.body
    const operatorId = req.user?.id

    const updated = await updateConfig(key, value, operatorId)
    return success(res, { key, value: updated }, '配置更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
