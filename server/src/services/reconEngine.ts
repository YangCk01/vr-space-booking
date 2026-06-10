import { OrderStatus, PrismaClient } from '@prisma/client'
import { format } from 'date-fns'
import { getHardwarePlayerCount, getSystemPlayerCount } from './deviceLogService'

const prisma = new PrismaClient()

const PAID_LIKE_ORDER_STATUSES: OrderStatus[] = ['PAID', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'NO_SHOW']

interface DateRange {
  gte: Date
  lte: Date
}

function getDateRange(dateStr: string): DateRange {
  const [year, month, day] = dateStr.split('-').map(Number)
  return {
    gte: new Date(Date.UTC(year, month - 1, day, 0, 0, 0)),
    lte: new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)),
  }
}

/**
 * 对账引擎主入口
 * @param batchId 对账批次ID
 * @param dateStr 对账日期 YYYY-MM-DD
 */
export async function runMatchingEngine(batchId: string, dateStr: string) {
  const dateRange = getDateRange(dateStr)
  let matchedCount = 0
  let exceptionCount = 0
  let matchedAmount = 0
  let exceptionAmount = 0

  // ========== 1. 订单-支付一致性核对 ==========
  const orderPayResult = await checkOrderPaymentConsistency(batchId, dateRange)
  matchedCount += orderPayResult.matched
  exceptionCount += orderPayResult.exceptions
  matchedAmount += orderPayResult.matchedAmount
  exceptionAmount += orderPayResult.exceptionAmount

  // ========== 2. 订单-余额变动核对（余额支付订单）==========
  const orderTxResult = await checkOrderTransactionConsistency(batchId, dateRange)
  matchedCount += orderTxResult.matched
  exceptionCount += orderTxResult.exceptions
  matchedAmount += orderTxResult.matchedAmount
  exceptionAmount += orderTxResult.exceptionAmount

  // ========== 3. 充值一致性核对 ==========
  const rechargeResult = await checkRechargeConsistency(batchId, dateRange)
  matchedCount += rechargeResult.matched
  exceptionCount += rechargeResult.exceptions
  matchedAmount += rechargeResult.matchedAmount
  exceptionAmount += rechargeResult.exceptionAmount

  // ========== 4. 退款一致性核对 ==========
  const refundResult = await checkRefundConsistency(batchId, dateRange)
  matchedCount += refundResult.matched
  exceptionCount += refundResult.exceptions
  matchedAmount += refundResult.matchedAmount
  exceptionAmount += refundResult.exceptionAmount

  // ========== 5. 用户积分余额核对（全量核对，非当日）==========
  // 注：积分核对是系统健康度检查，不计入 matchedCount（它和当日业务量无关）
  const pointsResult = await checkPointsConsistency(batchId, dateStr)
  // matchedCount 不累加 pointsResult.matched（避免全量用户数干扰日业务统计）
  exceptionCount += pointsResult.exceptions
  exceptionAmount += pointsResult.exceptionAmount

  // ========== 6. 系统账 vs 渠道账 十字交叉核对（Phase 2 预留）==========
  // TODO: 接入 ReconChannelBill 后实现
  // const channelResult = await checkChannelConsistency(batchId, dateRange)

  // ========== 7. 渠道账 vs 银行账 日汇总核对（Phase 3 预留）==========
  // TODO: 接入 ReconBankStatement 后实现
  // const bankResult = await checkBankConsistency(batchId, dateStr)

  // ========== 8. 硬件播控 vs 系统核销 防舞弊核对 ==========
  // 注：硬件核对是门店维度的防舞弊检查，不计入 matchedCount（它和当日订单笔数无关）
  const hardwareResult = await checkHardwareConsistency(batchId, dateStr)
  // matchedCount 不累加 hardwareResult.matched（门店数 ≠ 业务笔数，混一起看不懂）
  exceptionCount += hardwareResult.exceptions
  exceptionAmount += hardwareResult.exceptionAmount

  return {
    matchedCount,
    exceptionCount,
    matchedAmount,
    exceptionAmount,
    // 各维度明细（用于前端分开展示）
    orderPayMatched: orderPayResult.matched,
    orderPayExceptions: orderPayResult.exceptions,
    orderTxMatched: orderTxResult.matched,
    orderTxExceptions: orderTxResult.exceptions,
    rechargeMatched: rechargeResult.matched,
    rechargeExceptions: rechargeResult.exceptions,
    refundMatched: refundResult.matched,
    refundExceptions: refundResult.exceptions,
  }
}

async function createException(
  batchId: string,
  type: string,
  data: {
    bizType?: string
    bizOrderNo?: string
    bizAmount?: number
    bizStatus?: string
    diffAmount: number
    remark?: string
  }
) {
  const { remark, ...rest } = data
  const handled = await prisma.reconException.findFirst({
    where: {
      batchId,
      exceptionType: type as any,
      exceptionStatus: { not: 'PENDING' },
      bizType: data.bizType || null,
      bizOrderNo: data.bizOrderNo || null,
      diffAmount: data.diffAmount,
    },
    orderBy: { handledAt: 'desc' },
  })
  if (handled) return handled

  return prisma.reconException.create({
    data: {
      batchId,
      exceptionType: type as any,
      exceptionStatus: 'PENDING',
      ...rest,
      handleRemark: remark,
    },
  })
}

// ========== 核对 1：订单-支付一致性 ==========
async function checkOrderPaymentConsistency(batchId: string, dateRange: DateRange) {
  let matched = 0, exceptions = 0, matchedAmount = 0, exceptionAmount = 0

  // 只核对外部支付订单（微信/支付宝），余额支付走核对 2
  const orders = await prisma.order.findMany({
    where: {
      paidAt: dateRange,
      status: { in: PAID_LIKE_ORDER_STATUSES },
      payMethod: { in: ['WECHAT', 'ALIPAY'] },
    },
    include: { payments: true },
  })

  for (const order of orders) {
    const paymentSum = order.payments.reduce((s, p) => s + p.amount, 0)
    const expected = order.amount

    if (paymentSum === expected) {
      matched++
      matchedAmount += expected
    } else {
      exceptions++
      exceptionAmount += Math.abs(paymentSum - expected)
      await createException(batchId, 'AMOUNT_MISMATCH', {
        bizType: 'ORDER',
        bizOrderNo: order.orderNo,
        bizAmount: expected,
        bizStatus: order.status,
        diffAmount: Math.abs(paymentSum - expected),
        remark: `订单金额 ¥${expected / 100} 与支付流水合计 ¥${paymentSum / 100} 不符`,
      })
    }
  }

  return { matched, exceptions, matchedAmount, exceptionAmount }
}

// ========== 核对 8：硬件播控 vs 系统核销 防舞弊核对 ==========
async function checkHardwareConsistency(batchId: string, dateStr: string) {
  let matched = 0, exceptions = 0, matchedAmount = 0, exceptionAmount = 0

  // 读取配置
  const [thresholdCfg, testStartCfg, testEndCfg] = await Promise.all([
    prisma.reconConfig.findUnique({ where: { key: 'HARDWARE_MISMATCH_THRESHOLD' } }),
    prisma.reconConfig.findUnique({ where: { key: 'HARDWARE_TEST_START' } }),
    prisma.reconConfig.findUnique({ where: { key: 'HARDWARE_TEST_END' } }),
  ])

  const threshold = parseFloat(thresholdCfg?.value || '0.05')
  const testStart = testStartCfg?.value || '09:00'
  const testEnd = testEndCfg?.value || '10:00'

  // 遍历所有门店
  const venues = await prisma.venue.findMany({
    where: { status: { not: 'DISABLED' } },
    select: { id: true, name: true },
  })

  for (const venue of venues) {
    const [systemCount, hardwareCount] = await Promise.all([
      getSystemPlayerCount(venue.id, dateStr),
      getHardwarePlayerCount(venue.id, dateStr, testStart, testEnd),
    ])

    // 如果硬件没有日志，跳过（无法核对）
    if (hardwareCount === 0 && systemCount === 0) {
      matched++
      continue
    }

    // 查询该门店当日所有已完成的订单（用于按订单展开）
    const [year, month, day] = dateStr.split('-').map(Number)
    const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))

    const orders = await prisma.order.findMany({
      where: {
        venueId: venue.id,
        status: { in: ['PAID', 'COMPLETED', 'REFUNDED'] },
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        orderNo: true,
        amount: true,
        status: true,
        createdAt: true,
        paidAt: true,
        updatedAt: true,
        payMethod: true,
        booking: { select: { personCount: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (hardwareCount === 0 && systemCount > 0) {
      // 系统有记录但硬件无日志：严重异常（可能设备未接入或日志丢失）
      // 按订单展开，每条订单一条异常记录
      for (const order of orders) {
        exceptions++
        exceptionAmount += order.booking?.personCount || 1
        await createException(batchId, 'HARDWARE_MISMATCH', {
          bizType: 'HARDWARE',
          bizOrderNo: order.orderNo,
          bizAmount: order.amount,
          diffAmount: order.booking?.personCount || 1,
          remark: JSON.stringify({
            venueName: venue.name,
            venueId: venue.id,
            orderCreatedAt: order.createdAt,
            orderPaidAt: order.paidAt,
            orderUpdatedAt: order.updatedAt,
            personCount: order.booking?.personCount,
            payMethod: order.payMethod,
            status: order.status,
            summary: `门店「${venue.name}」系统确权 ${systemCount} 人次，但硬件无日志（设备可能未接入）`,
          }),
        })
      }
      continue
    }

    // 计算核销差异率
    const diffRate = (systemCount - hardwareCount) / hardwareCount

    if (Math.abs(diffRate) <= threshold) {
      matched++
      matchedAmount += systemCount
    } else {
      // 差异率超过阈值，按订单展开异常记录
      const risk = diffRate < 0
        ? '门店可能存在私收现金未入系统（硬件播控 > 系统确权）'
        : '系统确权人次显著多于硬件实际播控（可能存在虚单）'

      for (const order of orders) {
        exceptions++
        exceptionAmount += order.booking?.personCount || 1
        await createException(batchId, 'HARDWARE_MISMATCH', {
          bizType: 'HARDWARE',
          bizOrderNo: order.orderNo,
          bizAmount: order.amount,
          diffAmount: order.booking?.personCount || 1,
          remark: JSON.stringify({
            venueName: venue.name,
            venueId: venue.id,
            orderCreatedAt: order.createdAt,
            orderPaidAt: order.paidAt,
            orderUpdatedAt: order.updatedAt,
            personCount: order.booking?.personCount,
            payMethod: order.payMethod,
            status: order.status,
            systemCount,
            hardwareCount,
            diffRate: `${(diffRate * 100).toFixed(1)}%`,
            summary: `门店「${venue.name}」核销差异率 ${(diffRate * 100).toFixed(1)}%（系统${systemCount}人 vs 硬件${hardwareCount}人）。${risk}`,
          }),
        })
      }
    }
  }

  return { matched, exceptions, matchedAmount, exceptionAmount }
}

// ========== 核对 2：订单-余额变动一致性（余额支付订单）==========
async function checkOrderTransactionConsistency(batchId: string, dateRange: DateRange) {
  let matched = 0, exceptions = 0, matchedAmount = 0, exceptionAmount = 0

  const orders = await prisma.order.findMany({
    where: {
      paidAt: dateRange,
      status: { in: PAID_LIKE_ORDER_STATUSES },
      payMethod: { in: ['BALANCE', 'BALANCE_POINTS'] },
    },
    include: {
      transactions: {
        where: { type: 'DEDUCT' },
      },
    },
  })

  for (const order of orders) {
    const txSum = Math.abs(order.transactions.reduce((s: number, t: { totalAmount: number }) => s + t.totalAmount, 0))
    const expected = order.principalDeduction + order.bonusDeduction

    if (txSum === expected) {
      matched++
      matchedAmount += expected
    } else {
      exceptions++
      exceptionAmount += Math.abs(txSum - expected)
      await createException(batchId, 'AMOUNT_MISMATCH', {
        bizType: 'ORDER',
        bizOrderNo: order.orderNo,
        bizAmount: expected,
        bizStatus: order.status,
        diffAmount: Math.abs(txSum - expected),
        remark: `订单扣减金额 ¥${expected / 100} 与余额流水合计 ¥${txSum / 100} 不符`,
      })
    }
  }

  return { matched, exceptions, matchedAmount, exceptionAmount }
}

// ========== 核对 3：充值一致性 ==========
async function checkRechargeConsistency(batchId: string, dateRange: DateRange) {
  let matched = 0, exceptions = 0, matchedAmount = 0, exceptionAmount = 0

  const recharges = await prisma.rechargeRecord.findMany({
    where: {
      paidAt: dateRange,
      status: 'PAID',
    },
    include: {
      user: {
        include: {
          transactions: {
            where: {
              type: 'RECHARGE',
              createdAt: dateRange,
            },
          },
        },
      },
    },
  })

  for (const recharge of recharges) {
    // 通过 rechargeId 关联更准确
    const txs = await prisma.balanceTransaction.findMany({
      where: {
        rechargeId: recharge.id,
        type: 'RECHARGE',
      },
    })
    const txSum = txs.reduce((s, t) => s + t.totalAmount, 0)
    const expected = recharge.amount + recharge.bonus

    if (txSum === expected) {
      matched++
      matchedAmount += expected
    } else {
      exceptions++
      exceptionAmount += Math.abs(txSum - expected)
      await createException(batchId, 'AMOUNT_MISMATCH', {
        bizType: 'RECHARGE',
        bizOrderNo: recharge.id,
        bizAmount: expected,
        bizStatus: 'PAID',
        diffAmount: Math.abs(txSum - expected),
        remark: `充值到账金额 ¥${expected / 100} 与余额流水合计 ¥${txSum / 100} 不符`,
      })
    }
  }

  return { matched, exceptions, matchedAmount, exceptionAmount }
}

// ========== 核对 4：退款一致性 ==========
async function checkRefundConsistency(batchId: string, dateRange: DateRange) {
  let matched = 0, exceptions = 0, matchedAmount = 0, exceptionAmount = 0

  const refundTxs = await prisma.balanceTransaction.findMany({
    where: {
      type: { in: ['REFUND', 'CANCEL_RESTORE'] },
      createdAt: dateRange,
    },
    select: {
      id: true,
      orderId: true,
      totalAmount: true,
      remark: true,
    },
  })

  const txOrderIds = refundTxs.map((tx) => tx.orderId).filter(Boolean) as string[]
  const updatedRefundOrders = await prisma.order.findMany({
    where: {
      status: { in: ['REFUNDED', 'CANCELLED'] },
      updatedAt: dateRange,
    },
    select: { id: true },
  })
  const orderIds = Array.from(new Set([...txOrderIds, ...updatedRefundOrders.map((order) => order.id)]))

  if (orderIds.length === 0 && refundTxs.length === 0) {
    return { matched, exceptions, matchedAmount, exceptionAmount }
  }

  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderIds.length ? orderIds : ['__never__'] },
      status: { in: ['REFUNDED', 'CANCELLED'] },
    },
    select: {
      id: true,
      orderNo: true,
      amount: true,
      refundAmount: true,
      status: true,
    },
  })

  const knownOrderIds = new Set(orders.map((order) => order.id))
  const txByOrder = new Map<string, number>()
  for (const tx of refundTxs) {
    if (!tx.orderId) {
      exceptions++
      exceptionAmount += Math.abs(tx.totalAmount || 0)
      await createException(batchId, 'LONG', {
        bizType: 'REFUND',
        bizOrderNo: tx.id,
        bizAmount: 0,
        bizStatus: 'UNLINKED',
        diffAmount: Math.abs(tx.totalAmount || 0),
        remark: `退款流水未关联订单，金额 ¥${Math.abs(tx.totalAmount || 0) / 100}，需要人工定位来源`,
      })
      continue
    }
    txByOrder.set(tx.orderId, (txByOrder.get(tx.orderId) || 0) + Math.abs(tx.totalAmount || 0))
  }

  for (const tx of refundTxs) {
    if (tx.orderId && !knownOrderIds.has(tx.orderId)) {
      exceptions++
      exceptionAmount += Math.abs(tx.totalAmount || 0)
      await createException(batchId, 'LONG', {
        bizType: 'REFUND',
        bizOrderNo: tx.id,
        bizAmount: 0,
        bizStatus: 'ORDER_NOT_REFUNDED',
        diffAmount: Math.abs(tx.totalAmount || 0),
        remark: `退款流水已发生，但关联订单未处于已退款/已取消状态，金额 ¥${Math.abs(tx.totalAmount || 0) / 100}`,
      })
    }
  }

  for (const order of orders) {
    const txSum = txByOrder.get(order.id) || 0
    const expected = order.refundAmount || order.amount

    if (txSum === expected) {
      matched++
      matchedAmount += expected
    } else {
      exceptions++
      exceptionAmount += Math.abs(txSum - expected)
      await createException(batchId, 'AMOUNT_MISMATCH', {
        bizType: 'ORDER',
        bizOrderNo: order.orderNo,
        bizAmount: expected,
        bizStatus: order.status,
        diffAmount: Math.abs(txSum - expected),
        remark: `订单退款金额 ¥${expected / 100} 与当日退款流水合计 ¥${txSum / 100} 不符`,
      })
    }
  }

  return { matched, exceptions, matchedAmount, exceptionAmount }
}

// ========== 核对 5：用户积分余额核对（全量）==========
async function checkPointsConsistency(batchId: string, _dateStr: string) {
  let matched = 0, exceptions = 0, matchedAmount = 0, exceptionAmount = 0

  const users = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    select: {
      id: true,
      name: true,
      phone: true,
      points: true,
    },
  })

  for (const user of users) {
    const txAgg = await prisma.balanceTransaction.aggregate({
      where: { userId: user.id },
      _sum: { pointsAmount: true },
    })
    const txSum = txAgg._sum?.pointsAmount || 0

    if (txSum === user.points) {
      matched++
    } else {
      exceptions++
      exceptionAmount += Math.abs(txSum - user.points)
      await createException(batchId, 'STATUS_MISMATCH', {
        bizType: 'USER',
        bizOrderNo: user.id,
        bizAmount: user.points,
        diffAmount: Math.abs(txSum - user.points),
        remark: `用户 ${user.name}(${user.phone}) 积分余额 ${user.points} 与流水合计 ${txSum} 不符`,
      })
    }
  }

  return { matched, exceptions, matchedAmount, exceptionAmount }
}
