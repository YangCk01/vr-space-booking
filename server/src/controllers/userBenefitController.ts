import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { success, error } from '../utils/response'
import { getBenefitUsage } from '../services/userBenefitService'

/**
 * 获取用户权益使用情况
 */
export async function getBenefits(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) return error(res, '未登录', 401)

    const usage = await getBenefitUsage(userId, 'FREE_RESCHEDULE')

    return success(res, {
      freeReschedule: usage,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
