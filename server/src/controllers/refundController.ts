import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'

/**
 * 会员卡退款清算审计
 * GET /users/:id/refund-audit
 * 权限：ADMIN / SUPER_ADMIN / FINANCE
 */
export async function auditRefund(req: AuthenticatedRequest, res: Response) {
  const userId = req.params.id as string

  try {
    // 1. 查询用户历史累计充值本金
    const rechargeAgg = await prisma.rechargeRecord.aggregate({
      where: { userId, status: 'PAID' },
      _sum: { amount: true }
    })
    const totalRechargedPrincipal = rechargeAgg._sum?.amount || 0

    // 2. 查询用户已核销场次 × 单场散客原价
    const consumedOrders = await prisma.order.findMany({
      where: {
        userId,
        status: { in: ['PAID', 'COMPLETED'] },
        payMethod: { in: ['BALANCE', 'BALANCE_POINTS'] }
      },
      select: { originalAmount: true }
    })
    const totalConsumedValue = consumedOrders.reduce((sum, o) => sum + o.originalAmount, 0)

    // 3. 计算应退本金
    const refundPrincipal = totalRechargedPrincipal - totalConsumedValue

    // 4. 查询用户当前账户状态
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, phone: true,
        principalBalance: true, bonusBalance: true, points: true,
        level: true, totalSpent: true
      }
    })
    if (!user) return error(res, '用户不存在', 404)

    return success(res, {
      user,
      audit: {
        totalRechargedPrincipal,
        totalConsumedValue,
        refundPrincipal,
        refundPrincipalYuan: refundPrincipal / 100,
      },
      willClear: {
        principalBalance: user.principalBalance,
        bonusBalance: user.bonusBalance,
        points: user.points,
      },
      canRefund: refundPrincipal > 0,
    }, '退款审计完成')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 执行退款清算
 * POST /users/:id/refund-clear
 */
export async function executeRefundClear(req: AuthenticatedRequest, res: Response) {
  const userId = req.params.id as string

  try {
    // 前置审计
    const rechargeAgg = await prisma.rechargeRecord.aggregate({
      where: { userId, status: 'PAID' },
      _sum: { amount: true }
    })
    const consumedOrders = await prisma.order.findMany({
      where: {
        userId,
        status: { in: ['PAID', 'COMPLETED'] },
        payMethod: { in: ['BALANCE', 'BALANCE_POINTS'] }
      },
      select: { originalAmount: true }
    })
    const totalConsumedValue = consumedOrders.reduce((sum, o) => sum + o.originalAmount, 0)
    const refundPrincipal = (rechargeAgg._sum?.amount || 0) - totalConsumedValue

    if (refundPrincipal <= 0) {
      return error(res, '无可退本金', 400)
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { principalBalance: true, bonusBalance: true, points: true }
    })
    if (!user) return error(res, '用户不存在', 404)

    // 事务执行清零
    await prisma.$transaction(async (tx) => {
      // 1. 记录清零流水
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'REFUND',
          amount: refundPrincipal,
          principalAmount: -user.principalBalance,
          bonusAmount: -user.bonusBalance,
          totalAmount: -refundPrincipal,
          remark: `会员卡退款清算，退回本金¥${refundPrincipal / 100}，清零赠送¥${user.bonusBalance / 100}、积分${user.points}`,
        }
      })

      // 2. 清零用户所有账户
      await tx.user.update({
        where: { id: userId },
        data: {
          principalBalance: 0,
          bonusBalance: 0,
          points: 0,
        }
      })

      // 3. 恢复所有未完成订单使用的优惠券
      const pendingOrders = await tx.order.findMany({
        where: { userId, status: { in: ['PENDING', 'PAID'] } },
        select: { userCouponId: true }
      })
      for (const order of pendingOrders) {
        if (order.userCouponId) {
          await tx.userCoupon.update({
            where: { id: order.userCouponId },
            data: { status: 'UNUSED', usedAt: null, usedOrderId: null }
          })
        }
      }

      // 4. 取消所有未完成订单
      await tx.order.updateMany({
        where: { userId, status: { in: ['PENDING', 'PAID'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() }
      })
    })

    return success(res, {
      refundPrincipal,
      refundPrincipalYuan: refundPrincipal / 100,
      cleared: {
        principalBalance: user.principalBalance,
        bonusBalance: user.bonusBalance,
        points: user.points,
      }
    }, '退款清算执行成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
