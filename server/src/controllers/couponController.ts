import { Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { AuthenticatedRequest } from '../types'
import { normalizeThirdPartyCouponCode } from '../utils/thirdPartyCoupon'
import { getPlatformConfig, isPlatformEnabled } from '../utils/platformConfig'

const sourceLabels: Record<string, string> = {
  MEITUAN: '美团',
  DOUYIN: '抖音',
  DIANPING: '大众点评',
}

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

    if (!isPlatformEnabled(source)) {
      return error(res, '该平台已停用，无法绑定券码', 400)
    }

    const trimmedCode = normalizeThirdPartyCouponCode(code)

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
    const configSources = Object.entries(getPlatformConfig())
      .filter(([, cfg]) => cfg.enabled)
      .map(([key]) => key)

    const coupons = await prisma.thirdPartyCoupon.findMany({
      where: { userId, source: { in: configSources } },
      orderBy: { createdAt: 'desc' },
    })

    return success(res, coupons)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * B 端扫码/输入券码时查询本地第三方券
 */
export async function lookup(req: AuthenticatedRequest, res: Response) {
  try {
    const code = normalizeThirdPartyCouponCode(req.query.code || req.body?.code)
    if (!code) return error(res, '请输入券码', 400)

    const coupon = await prisma.thirdPartyCoupon.findUnique({
      where: { code },
      include: { user: { select: { id: true, name: true, phone: true } } },
    })

    if (!coupon) {
      return error(res, '未找到该第三方券，请先让顾客在 C 端完成兑换绑定', 404)
    }

    if (coupon.status === 'USED') {
      return error(res, '平台优惠券已使用，不能重复抵扣', 400)
    }

    if (!isPlatformEnabled(coupon.source)) {
      return error(res, '该平台已停用，券码不可用', 400)
    }

    return success(res, {
      id: coupon.id,
      code: coupon.code,
      source: coupon.source,
      name: coupon.name,
      description: coupon.description,
      discountAmount: coupon.discountAmount,
      minOrderAmount: coupon.minOrderAmount,
      status: coupon.status,
      userId: coupon.userId,
      user: coupon.user,
      createdAt: coupon.createdAt,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * B 端平台管理概览：先基于本地券码数据汇总，后续可替换为平台 API 同步结果。
 */
export async function adminOverview(req: AuthenticatedRequest, res: Response) {
  try {
    const [coupons, recentCoupons] = await Promise.all([
      prisma.thirdPartyCoupon.findMany({
        include: { user: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.thirdPartyCoupon.findMany({
        take: 20,
        include: { user: { select: { id: true, name: true, phone: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const sources = ['MEITUAN', 'DOUYIN', 'DIANPING']
    const platforms = sources.map((source) => {
      const list = coupons.filter((coupon) => coupon.source === source)
      const used = list.filter((coupon) => coupon.status === 'USED')
      const unused = list.filter((coupon) => coupon.status === 'UNUSED')
      const expired = list.filter((coupon) => coupon.status === 'EXPIRED')
      const locked = list.filter((coupon) => !['UNUSED', 'USED', 'EXPIRED'].includes(coupon.status))

      return {
        source,
        label: sourceLabels[source] || source,
        total: list.length,
        unused: unused.length,
        used: used.length,
        expired: expired.length,
        locked: locked.length,
        userCount: new Set(list.map((coupon) => coupon.userId).filter(Boolean)).size,
        totalDiscountAmount: list.reduce((sum, coupon) => sum + coupon.discountAmount, 0),
        usedDiscountAmount: used.reduce((sum, coupon) => sum + coupon.discountAmount, 0),
        lastSyncedAt: new Date().toISOString(),
      }
    })

    return success(res, {
      summary: {
        total: coupons.length,
        unused: coupons.filter((coupon) => coupon.status === 'UNUSED').length,
        used: coupons.filter((coupon) => coupon.status === 'USED').length,
        expired: coupons.filter((coupon) => coupon.status === 'EXPIRED').length,
        totalDiscountAmount: coupons.reduce((sum, coupon) => sum + coupon.discountAmount, 0),
        usedDiscountAmount: coupons
          .filter((coupon) => coupon.status === 'USED')
          .reduce((sum, coupon) => sum + coupon.discountAmount, 0),
      },
      platforms,
      recentCoupons,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
