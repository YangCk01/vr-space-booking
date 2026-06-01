import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const start = new Date('2026-05-27T00:00:00+08:00')
  const end = new Date('2026-05-28T00:00:00+08:00')

  console.log('=== 2026-05-27 消费对账分析 ===\n')

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['PAID', 'COMPLETED', 'REFUNDED'] },
      paidAt: { gte: start, lt: end }
    },
    select: {
      id: true,
      orderNo: true,
      principalDeduction: true,
      bonusDeduction: true,
      pointsUsed: true,
      paidAt: true,
      status: true
    }
  })

  const orderPrincipal = orders.reduce((s, o) => s + o.principalDeduction, 0)
  const orderBonus = orders.reduce((s, o) => s + o.bonusDeduction, 0)

  console.log(`订单数量: ${orders.length}`)
  console.log(`订单本金扣款合计: ${orderPrincipal}分 = ¥${(orderPrincipal/100).toFixed(2)}`)
  console.log(`订单赠送扣款合计: ${orderBonus}分 = ¥${(orderBonus/100).toFixed(2)}`)

  const txs = await prisma.balanceTransaction.findMany({
    where: {
      type: 'DEDUCT',
      createdAt: { gte: start, lt: end }
    },
    select: {
      id: true,
      orderId: true,
      principalAmount: true,
      bonusAmount: true,
      totalAmount: true,
      createdAt: true,
      remark: true
    }
  })

  const txPrincipal = txs.reduce((s, t) => s + Math.abs(t.principalAmount || 0), 0)
  const txBonus = txs.reduce((s, t) => s + Math.abs(t.bonusAmount || 0), 0)

  console.log(`\n流水数量: ${txs.length}`)
  console.log(`流水本金扣款合计: ${txPrincipal}分 = ¥${(txPrincipal/100).toFixed(2)}`)
  console.log(`流水赠送扣款合计: ${txBonus}分 = ¥${(txBonus/100).toFixed(2)}`)

  console.log(`\n差异:`)
  console.log(`  本金: ${orderPrincipal - txPrincipal}分 = ¥${((orderPrincipal - txPrincipal)/100).toFixed(2)}`)
  console.log(`  赠送: ${orderBonus - txBonus}分 = ¥${((orderBonus - txBonus)/100).toFixed(2)}`)

  console.log(`\n=== 订单 vs 流水 差异明细 ===`)
  for (const order of orders) {
    const relatedTxs = txs.filter(t => t.orderId === order.id)
    const txp = relatedTxs.reduce((s, t) => s + Math.abs(t.principalAmount || 0), 0)
    const txb = relatedTxs.reduce((s, t) => s + Math.abs(t.bonusAmount || 0), 0)

    if (order.principalDeduction !== txp || order.bonusDeduction !== txb) {
      console.log(`\n订单 ${order.orderNo} (${order.status})`)
      console.log(`  paidAt: ${order.paidAt}`)
      console.log(`  订单本金: ${order.principalDeduction}, 流水本金: ${txp}, 差: ${order.principalDeduction - txp}`)
      console.log(`  订单赠送: ${order.bonusDeduction}, 流水赠送: ${txb}, 差: ${order.bonusDeduction - txb}`)
      if (relatedTxs.length === 0) {
        console.log(`  ⚠️ 该订单无任何DEDUCT流水`)
      }
    }
  }

  console.log(`\n=== 流水有记录但找不到对应订单 ===`)
  for (const tx of txs) {
    if (!tx.orderId) {
      console.log(`\n流水无orderId: ${tx.id}`)
      console.log(`  本金: ${Math.abs(tx.principalAmount || 0)}, 赠送: ${Math.abs(tx.bonusAmount || 0)}`)
      console.log(`  备注: ${tx.remark}`)
      continue
    }
    const order = orders.find(o => o.id === tx.orderId)
    if (!order) {
      console.log(`\n流水 ${tx.id} 关联订单 ${tx.orderId} 不存在`)
      console.log(`  本金: ${Math.abs(tx.principalAmount || 0)}, 赠送: ${Math.abs(tx.bonusAmount || 0)}`)
      console.log(`  备注: ${tx.remark}`)
    }
  }

  console.log(`\n\n=== 2026-05-27 积分抵扣分析 ===\n`)

  const orderPoints = orders.reduce((s, o) => s + (o.pointsUsed || 0), 0)

  const pointsTxs = await prisma.balanceTransaction.findMany({
    where: {
      type: 'POINTS_DEDUCT',
      createdAt: { gte: start, lt: end }
    },
    select: {
      id: true,
      orderId: true,
      pointsAmount: true,
      createdAt: true,
      remark: true
    }
  })

  const txPoints = pointsTxs.reduce((s, t) => s + Math.abs(t.pointsAmount || 0), 0)

  console.log(`订单积分使用合计: ${orderPoints}分`)
  console.log(`流水积分抵扣合计: ${txPoints}分`)
  console.log(`差异: ${orderPoints - txPoints}分`)

  console.log(`\n=== 积分差异明细 ===`)
  for (const order of orders) {
    if ((order.pointsUsed || 0) > 0) {
      const relatedTxs = pointsTxs.filter(t => t.orderId === order.id)
      const txp = relatedTxs.reduce((s, t) => s + Math.abs(t.pointsAmount || 0), 0)
      if ((order.pointsUsed || 0) !== txp) {
        console.log(`\n订单 ${order.orderNo}: 订单积分${order.pointsUsed}, 流水积分${txp}, 差${(order.pointsUsed || 0) - txp}`)
      }
    }
  }
  for (const tx of pointsTxs) {
    if (!tx.orderId) {
      console.log(`\n积分流水无orderId: ${tx.id}, 积分${Math.abs(tx.pointsAmount || 0)}`)
      continue
    }
    const order = orders.find(o => o.id === tx.orderId)
    if (!order) {
      console.log(`\n积分流水 ${tx.id} 关联订单 ${tx.orderId} 不存在, 积分${Math.abs(tx.pointsAmount || 0)}`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
