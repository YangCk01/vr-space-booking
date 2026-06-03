import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { format } from 'date-fns'
import { getRechargeConfig, compareLevel, normalizeLevelKey } from '../utils/memberConfig'

function generateRechargeNo(): string {
  const dateStr = format(new Date(), 'yyyyMMdd')
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `CZ${dateStr}${time}${random}`
}

/** 获取充值配置 */
export async function getConfig(req: Request, res: Response) {
  try {
    const config = await getRechargeConfig()
    return success(res, config.map(c => ({
      amount: c.amount,
      bonus: c.bonus,
      total: c.total,
      level: c.level,
    })))
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 创建充值订单 */
export async function create(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id
    if (!userId) return error(res, '未登录', 401)

    const { amount, payMethod } = req.body
    const configList = await getRechargeConfig()
    const config = configList.find(c => c.amount === parseInt(amount))
    if (!config) return error(res, '无效的充值金额', 400)

    const recharge = await prisma.rechargeRecord.create({
      data: {
        userId,
        amount: config.amount,
        bonus: config.bonus,
        total: config.total,
        payMethod: payMethod?.toUpperCase() || 'WECHAT',
        status: 'PENDING',
      },
    })

    return success(res, { rechargeNo: recharge.id, ...recharge }, '充值订单创建成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 支付回调 / 确认到账 */
export async function confirm(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id
    if (!userId) return error(res, '未登录', 401)

    const { rechargeId } = req.body

    const recharge = await prisma.rechargeRecord.findFirst({
      where: { id: rechargeId, userId },
    })
    if (!recharge) return error(res, '充值订单不存在', 404)
    if (recharge.status === 'PAID') return error(res, '该订单已处理', 400)

    // 事务：更新充值状态 + 增加双钱包 + 升级等级 + 记录流水
    const result = await prisma.$transaction(async (tx) => {
      // 1. 更新充值记录为已支付
      const updated = await tx.rechargeRecord.update({
        where: { id: rechargeId },
        data: { status: 'PAID', paidAt: new Date() },
      })

      // 2. 双钱包分别增加（本金 + 赠送），同步更新兼容字段 balance
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          principalBalance: { increment: updated.amount },
          bonusBalance: { increment: updated.bonus },
          balance: { increment: updated.total },
        },
      })

      // 3. 升级会员等级（只升不降）—— 使用配置匹配
      const configList = await getRechargeConfig()
      const matched = configList.find(c => c.amount === updated.amount)
      if (matched && compareLevel(matched.level, user.level) > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { level: normalizeLevelKey(matched.level) as any },
        })
      }

      // 4. 记录余额变动流水（拆分明细）
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'RECHARGE',
          amount: updated.total,
          principalAmount: updated.amount,
          bonusAmount: updated.bonus,
          totalAmount: updated.total,
          rechargeId: updated.id,
          remark: `充值${updated.amount / 100}元，赠送${updated.bonus / 100}元`,
        },
      })

      return updated
    })

    return success(res, result, '充值成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 查询充值记录（管理端支持按 userId 筛选） */
export async function list(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id
    if (!userId) return error(res, '未登录', 401)

    const targetUserId = (req.query.userId as string) || userId

    const records = await prisma.rechargeRecord.findMany({
      where: { userId: targetUserId, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
    })

    return success(res, records)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** C端：查询我的充值记录 */
export async function listMy(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id
    if (!userId) return error(res, '未登录', 401)

    const records = await prisma.rechargeRecord.findMany({
      where: { userId, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
    })

    return success(res, records)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** C端：查询我的资金流水（含积分变动） */
export async function listMyTransactions(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id
    if (!userId) return error(res, '未登录', 401)

    const transactions = await prisma.balanceTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return success(res, transactions)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
