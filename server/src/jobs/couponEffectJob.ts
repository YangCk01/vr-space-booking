import cron from 'node-cron'
import { format, subDays } from 'date-fns'
import { prisma } from '../utils/prisma'

/**
 * 每日 00:15 执行券效果统计
 */
export function startCouponEffectJob() {
  cron.schedule('15 0 * * *', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    console.log(`[CouponEffectJob] 开始统计券效果: ${yesterday}`)
    try {
      await runCouponEffectReport(yesterday)
      console.log(`[CouponEffectJob] 券效果统计完成: ${yesterday}`)
    } catch (e) {
      console.error(`[CouponEffectJob] 统计失败:`, e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[CouponEffectJob] 券效果定时任务已启动 (每日 00:15)')
}

/**
 * 统计指定日期的券效果（可手动触发）
 */
export async function runCouponEffectReport(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))

  // 按 couponType + source 分组统计
  const sources = ['MANUAL_GIFT', 'CAMPAIGN', '积分兑换', 'RECHARGE_BONUS']
  const types = ['DISCOUNT', 'EXPERIENCE_FREE']

  for (const couponType of types) {
    for (const source of sources) {
      // 1. 昨日发放数
      const giftedCount = await prisma.userCoupon.count({
        where: {
          type: couponType as any,
          source,
          createdAt: { gte: start, lte: end },
        },
      })

      // 2. 昨日核销数 + 订单金额
      const usedCoupons = await prisma.userCoupon.findMany({
        where: {
          type: couponType as any,
          source,
          usedAt: { gte: start, lte: end },
        },
        select: { id: true, userId: true, usedOrderId: true },
      })

      // 3. 昨日过期数
      const expiredCount = await prisma.userCoupon.count({
        where: {
          type: couponType as any,
          source,
          status: 'EXPIRED',
          validTo: { gte: start, lte: end },
        },
      })

      // 4. 关联订单金额和折扣成本
      const usedOrderIds = usedCoupons.map((c) => c.usedOrderId).filter(Boolean) as string[]
      let totalOrderAmount = 0
      let couponDiscountCost = 0
      let validUsedCoupons = usedCoupons.filter((c) => !c.usedOrderId)
      if (usedOrderIds.length > 0) {
        const validOrders = await prisma.order.findMany({
          where: {
            id: { in: usedOrderIds },
            status: { in: ['PAID', 'COMPLETED'] },
          },
          select: { id: true, amount: true, couponDiscount: true },
        })
        const validOrderIds = new Set(validOrders.map((order) => order.id))
        validUsedCoupons = usedCoupons.filter((coupon) => !coupon.usedOrderId || validOrderIds.has(coupon.usedOrderId))
        totalOrderAmount = validOrders.reduce((sum, order) => sum + order.amount, 0)
        couponDiscountCost = validOrders.reduce((sum, order) => sum + order.couponDiscount, 0)
      }
      const usedCount = validUsedCoupons.length

      // 5. 复购统计（30 天内再次消费）
      const thirtyDaysLater = new Date(end.getTime() + 30 * 24 * 60 * 60 * 1000)
      const usedUserIds = [...new Set(validUsedCoupons.map((c) => c.userId))]
      let reorderUserCount = 0
      let reorderAmount = 0

      if (usedUserIds.length > 0) {
        // 简化：统计这些用户在未来 30 天内的订单
        const reorderAgg = await prisma.order.aggregate({
          where: {
            userId: { in: usedUserIds },
            status: { in: ['PAID', 'COMPLETED'] },
            createdAt: { gte: start, lte: thirtyDaysLater },
          },
          _count: { userId: true },
          _sum: { amount: true },
        })
        // 这里 _count.userId 不是去重计数，需要另外查
        const reorderUsers = await prisma.order.groupBy({
          by: ['userId'],
          where: {
            userId: { in: usedUserIds },
            status: { in: ['PAID', 'COMPLETED'] },
            createdAt: { gte: start, lte: thirtyDaysLater },
          },
          _count: { userId: true },
        })
        reorderUserCount = reorderUsers.length
        reorderAmount = reorderAgg._sum.amount || 0
      }

      const avgOrderAmount = usedCount > 0 ? Math.round(totalOrderAmount / usedCount) : 0

      await prisma.couponEffectReport.upsert({
        where: {
          date_couponType_source: {
            date: dateStr,
            couponType,
            source,
          },
        },
        update: {
          giftedCount,
          usedCount,
          expiredCount,
          totalOrderAmount,
          avgOrderAmount,
          couponDiscountCost,
          reorderUserCount,
          reorderAmount,
        },
        create: {
          date: dateStr,
          couponType,
          source,
          giftedCount,
          usedCount,
          expiredCount,
          totalOrderAmount,
          avgOrderAmount,
          couponDiscountCost,
          reorderUserCount,
          reorderAmount,
        },
      })
    }
  }
}
