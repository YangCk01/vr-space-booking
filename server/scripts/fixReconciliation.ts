import { prisma } from '../src/utils/prisma'

async function main() {
  console.log('[FixRecon] 开始修复历史对账数据...\n')

  // ─── 1. 补录在线支付退款流水 ───
  const refundedOrders = await prisma.order.findMany({
    where: {
      status: 'REFUNDED',
      payMethod: { in: ['WECHAT', 'ALIPAY'] },
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      payMethod: true,
      principalDeduction: true,
      bonusDeduction: true,
      updatedAt: true,
    },
  })

  let refundFixed = 0
  for (const order of refundedOrders) {
    const existing = await prisma.balanceTransaction.findFirst({
      where: { orderId: order.id, type: 'REFUND' },
    })
    if (!existing) {
      await prisma.balanceTransaction.create({
        data: {
          userId: order.userId!,
          type: 'REFUND',
          amount: order.amount,
          principalAmount: 0,
          bonusAmount: 0,
          totalAmount: order.amount,
          orderId: order.id,
          remark: `历史数据补录：订单在线支付退款（${order.payMethod} ¥${order.amount / 100}）`,
          createdAt: order.updatedAt,
        },
      })
      refundFixed++
      console.log(`[FixRecon] 补录退款流水: order=${order.id}, amount=¥${order.amount / 100}`)
    }
  }
  console.log(`[FixRecon] 补录退款流水完成: ${refundFixed} 条\n`)

  // ─── 2. 补录积分退货冲正流水 ───
  const cancelledPointsOrders = await prisma.pointsOrder.findMany({
    where: { status: 'CANCELLED' },
    select: {
      id: true,
      userId: true,
      pointsCost: true,
      productName: true,
      updatedAt: true,
    },
  })

  let pointsFixed = 0
  for (const order of cancelledPointsOrders) {
    // 检查是否已有冲正流水（同一天、同金额、POINTS_DEDUCT 正值）
    const existing = await prisma.balanceTransaction.findFirst({
      where: {
        userId: order.userId,
        type: 'POINTS_DEDUCT',
        pointsAmount: order.pointsCost,
        remark: { contains: '冲正' },
        createdAt: {
          gte: new Date(order.updatedAt.setHours(0, 0, 0, 0)),
          lt: new Date(order.updatedAt.setHours(23, 59, 59, 999)),
        },
      },
    })
    if (!existing) {
      await prisma.balanceTransaction.create({
        data: {
          userId: order.userId,
          type: 'POINTS_DEDUCT',
          amount: 0,
          pointsAmount: order.pointsCost,
          remark: `历史数据补录：积分商城退货冲正「${order.productName}」${order.pointsCost} 积分`,
          createdAt: order.updatedAt,
        },
      })
      pointsFixed++
      console.log(`[FixRecon] 补录积分冲正: order=${order.id}, points=${order.pointsCost}`)
    }
  }
  console.log(`[FixRecon] 补录积分冲正流水完成: ${pointsFixed} 条\n`)

  console.log('[FixRecon] 全部修复完成，请刷新对账页面查看结果。')
}

main()
  .catch((e) => {
    console.error('[FixRecon] 修复失败:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
