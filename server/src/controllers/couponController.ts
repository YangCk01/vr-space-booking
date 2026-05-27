import { Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { AuthenticatedRequest } from '../types'

/**
 * 验证并绑定第三方兑换码（假实现）
 * 后续接入真实平台时，根据 source 调用对应开放 API
 */
export async function verify(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id
    const { code, source } = req.body

    if (!code || typeof code !== 'string' || code.trim().length < 6) {
      return error(res, '兑换码格式不正确，至少需要6位字符', 400)
    }

    const validSources = ['MEITUAN', 'DOUYIN', 'DIANPING']
    if (!source || !validSources.includes(source)) {
      return error(res, '请选择正确的券来源平台', 400)
    }

    const trimmedCode = code.trim().toUpperCase()

    // 检查是否已被其他用户绑定
    const existing = await prisma.thirdPartyCoupon.findUnique({
      where: { code: trimmedCode },
    })

    if (existing) {
      if (existing.userId && existing.userId !== userId) {
        return error(res, '该兑换码已被其他用户绑定', 409)
      }
      if (existing.status === 'USED') {
        return error(res, '该兑换码已被使用', 409)
      }
      if (existing.userId === userId) {
        return error(res, '您已绑定过该兑换码', 409)
      }
    }

    // 假实现：随机生成券面额和门槛
    // 真实接入时，此处调用平台 API 查询券信息
    const discountAmount = [1000, 2000, 3000, 5000][Math.floor(Math.random() * 4)] // 10~50元
    const minOrderAmount = [5000, 10000, 15000, 20000][Math.floor(Math.random() * 4)] // 50~200元
    const names: Record<string, string> = {
      MEITUAN: '美团优惠券',
      DOUYIN: '抖音团购券',
      DIANPING: '大众点评券',
    }
    const name = `${names[source]} · 满${minOrderAmount / 100}减${discountAmount / 100}`

    const coupon = await prisma.thirdPartyCoupon.upsert({
      where: { code: trimmedCode },
      update: {
        userId,
        source,
        name,
        discountAmount,
        minOrderAmount,
        status: 'UNUSED',
      },
      create: {
        code: trimmedCode,
        source,
        name,
        description: '第三方平台兑换券，到店核销使用',
        discountAmount,
        minOrderAmount,
        status: 'UNUSED',
        userId,
      },
    })

    return success(res, {
      id: coupon.id,
      code: coupon.code,
      source: coupon.source,
      name: coupon.name,
      discountAmount: coupon.discountAmount,
      minOrderAmount: coupon.minOrderAmount,
      status: coupon.status,
      createdAt: coupon.createdAt,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取当前用户已绑定的第三方优惠券
 */
export async function listMy(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id
    const coupons = await prisma.thirdPartyCoupon.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return success(res, coupons)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 标记券为已使用（假核销）
 * 真实接入时，此处需先调用平台核销 API，再更新本地状态
 */
export async function useCoupon(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id
    const id = req.params.id as string

    const coupon = await prisma.thirdPartyCoupon.findFirst({
      where: { id, userId },
    })

    if (!coupon) {
      return error(res, '优惠券不存在', 404)
    }

    if (coupon.status === 'USED') {
      return error(res, '该优惠券已被使用', 400)
    }

    const updated = await prisma.thirdPartyCoupon.update({
      where: { id },
      data: { status: 'USED', usedAt: new Date() },
    })

    return success(res, updated)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
