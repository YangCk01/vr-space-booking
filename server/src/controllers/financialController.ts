import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { startOfDay, endOfDay, subDays } from 'date-fns'

/**
 * 获取每日财务报表
 * GET /finance/daily-report?date=YYYY-MM-DD
 */
export async function getDailyReport(req: AuthenticatedRequest, res: Response) {
  const dateStr = req.query.date as string
  if (!dateStr) return error(res, '请指定日期参数 date', 400)

  try {
    const report = await prisma.dailyFinancialReport.findUnique({
      where: { date: dateStr }
    })

    if (!report) {
      return success(res, null, '该日期暂无报表数据')
    }

    return success(res, report)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取财务报表列表（支持日期范围）
 * GET /finance/daily-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function listDailyReports(req: AuthenticatedRequest, res: Response) {
  const { startDate, endDate } = req.query

  try {
    const where: any = {}
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = startDate as string
      if (endDate) where.date.lte = endDate as string
    }

    const reports = await prisma.dailyFinancialReport.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    return success(res, reports)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 手动触发跑批（用于补录历史数据）
 * POST /finance/generate-report
 */
export async function generateReport(req: AuthenticatedRequest, res: Response) {
  const { date } = req.body
  if (!date) return error(res, '请指定日期', 400)

  try {
    await runDailyReport(date as string)
    return success(res, null, `报表生成成功: ${date}`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 对账校验
 * GET /finance/reconcile?date=YYYY-MM-DD
 * 
 * 基于流水汇总对账：Σ(流水本金) == Σ(用户本金余额)，Σ(流水赠送) == Σ(用户赠送余额)
 * 此方法天然支持退款、部分退款等复杂场景
 */
export async function reconcile(req: AuthenticatedRequest, res: Response) {
  try {
    // 校验1：当前余额一致性
    const users = await prisma.user.findMany({
      select: { id: true, principalBalance: true, bonusBalance: true }
    })
    const totalPrincipal = users.reduce((s, u) => s + u.principalBalance, 0)
    const totalBonus = users.reduce((s, u) => s + u.bonusBalance, 0)

    // 校验2：基于流水汇总（更可靠，支持退款/部分退款场景）
    const txSum = await prisma.balanceTransaction.aggregate({
      _sum: { principalAmount: true, bonusAmount: true }
    })
    const expectedPrincipal = txSum._sum?.principalAmount || 0
    const expectedBonus = txSum._sum?.bonusAmount || 0

    // 校验3：旧逻辑（充值-消费）作为参考对比
    const rechargeSum = await prisma.rechargeRecord.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true, bonus: true }
    })
    const consumeSum = await prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'COMPLETED'] },
        payMethod: { in: ['BALANCE', 'BALANCE_POINTS'] }
      },
      _sum: { principalDeduction: true, bonusDeduction: true }
    })
    const oldExpectedPrincipal = (rechargeSum._sum?.amount || 0) - (consumeSum._sum?.principalDeduction || 0)
    const oldExpectedBonus = (rechargeSum._sum?.bonus || 0) - (consumeSum._sum?.bonusDeduction || 0)

    return success(res, {
      actual: { totalPrincipal, totalBonus, total: totalPrincipal + totalBonus },
      expected: { principal: expectedPrincipal, bonus: expectedBonus, total: expectedPrincipal + expectedBonus },
      diff: {
        principal: totalPrincipal - expectedPrincipal,
        bonus: totalBonus - expectedBonus,
      },
      isBalanced: totalPrincipal === expectedPrincipal && totalBonus === expectedBonus,
      reference: {
        oldLogic: { principal: oldExpectedPrincipal, bonus: oldExpectedBonus },
        oldLogicDiff: {
          principal: totalPrincipal - oldExpectedPrincipal,
          bonus: totalBonus - oldExpectedBonus,
        },
      }
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 用户资金流水查询（支持分页）
 * GET /finance/transactions?userId=&page=&pageSize=
 */
export async function listTransactions(req: AuthenticatedRequest, res: Response) {
  const { userId, page = '1', pageSize = '20' } = req.query
  const pageNum = parseInt(page as string, 10)
  const sizeNum = parseInt(pageSize as string, 10)

  try {
    const where: any = {}
    if (userId) where.userId = userId as string

    const [transactions, total] = await Promise.all([
      prisma.balanceTransaction.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          order: { select: { orderNo: true, amount: true, status: true } },
        }
      }),
      prisma.balanceTransaction.count({ where })
    ])

    return success(res, {
      data: transactions,
      meta: { page: pageNum, pageSize: sizeNum, total, totalPages: Math.ceil(total / sizeNum) }
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

// ========== 内部跑批逻辑 ==========
export async function runDailyReport(dateStr: string) {
  const start = startOfDay(new Date(dateStr + 'T00:00:00'))
  const end = endOfDay(new Date(dateStr + 'T00:00:00'))

  // 5.1 现金解缴表
  const rechargePrincipalIn = await prisma.rechargeRecord.aggregate({
    where: { status: 'PAID', paidAt: { gte: start, lte: end } },
    _sum: { amount: true }
  })

  const directPayIn = await prisma.payment.aggregate({
    where: {
      method: { in: ['WECHAT', 'ALIPAY'] },
      status: 'SUCCESS',
      createdAt: { gte: start, lte: end }
    },
    _sum: { amount: true }
  })

  const refundOut = await prisma.balanceTransaction.aggregate({
    where: {
      type: 'REFUND',
      createdAt: { gte: start, lte: end }
    },
    _sum: { totalAmount: true }
  })

  // 5.2 确权营收表
  const directRevenue = await prisma.order.aggregate({
    where: {
      status: { in: ['PAID', 'COMPLETED'] },
      payMethod: { in: ['WECHAT', 'ALIPAY'] },
      paidAt: { gte: start, lte: end }
    },
    _sum: { amount: true }
  })

  const memberPrincipalRevenue = await prisma.order.aggregate({
    where: {
      status: { in: ['PAID', 'COMPLETED'] },
      principalDeduction: { gt: 0 },
      paidAt: { gte: start, lte: end }
    },
    _sum: { principalDeduction: true }
  })

  const pointsDiscountCost = await prisma.order.aggregate({
    where: {
      status: { in: ['PAID', 'COMPLETED'] },
      pointsDeduction: { gt: 0 },
      paidAt: { gte: start, lte: end }
    },
    _sum: { pointsDeduction: true }
  })

  // 5.3 负债存量
  const principalLiability = await prisma.user.aggregate({
    _sum: { principalBalance: true }
  })
  const bonusLiability = await prisma.user.aggregate({
    _sum: { bonusBalance: true }
  })

  // 沉睡本金（90天无流水）
  const ninetyDaysAgo = subDays(start, 90)
  const dormantUsers = await prisma.user.findMany({
    where: {
      principalBalance: { gt: 0 },
      transactions: { none: { createdAt: { gte: ninetyDaysAgo } } }
    },
    select: { principalBalance: true }
  })
  const dormantPrincipal = dormantUsers.reduce((s, u) => s + u.principalBalance, 0)

  const rpi = rechargePrincipalIn._sum.amount || 0
  const dpi = directPayIn._sum.amount || 0
  const ro = refundOut._sum.totalAmount || 0
  const dr = directRevenue._sum.amount || 0
  const mpr = memberPrincipalRevenue._sum.principalDeduction || 0
  const pdc = pointsDiscountCost._sum.pointsDeduction || 0
  const tpl = principalLiability._sum.principalBalance || 0
  const tbl = bonusLiability._sum.bonusBalance || 0

  await prisma.dailyFinancialReport.upsert({
    where: { date: dateStr },
    update: {
      rechargePrincipalIn: rpi,
      directPayIn: dpi,
      refundOut: ro,
      netCashFlow: rpi + dpi - ro,
      directRevenue: dr,
      memberPrincipalRevenue: mpr,
      totalRecognizedRevenue: dr + mpr,
      pointsDiscountCost: pdc,
      totalPrincipalLiability: tpl,
      totalBonusLiability: tbl,
      dormantPrincipal,
    },
    create: {
      date: dateStr,
      rechargePrincipalIn: rpi,
      directPayIn: dpi,
      refundOut: ro,
      netCashFlow: rpi + dpi - ro,
      directRevenue: dr,
      memberPrincipalRevenue: mpr,
      totalRecognizedRevenue: dr + mpr,
      pointsDiscountCost: pdc,
      totalPrincipalLiability: tpl,
      totalBonusLiability: tbl,
      dormantPrincipal,
    }
  })
}
