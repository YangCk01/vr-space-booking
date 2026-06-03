import cron from 'node-cron'
import { prisma } from '../utils/prisma'

/**
 * 每分钟执行一次：自动取消过期的待支付订单
 */
export function startOrderTimeoutJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date()
      // 查找已过期且仍为 PENDING 的订单
      const expiredOrders = await prisma.order.findMany({
        where: {
          status: 'PENDING',
          expireAt: { lt: now },
        },
        select: { id: true, userCouponId: true },
      })

      if (expiredOrders.length === 0) return

      console.log(`[OrderTimeoutJob] 发现 ${expiredOrders.length} 个过期订单，开始自动取消`)

      for (const order of expiredOrders) {
        try {
          await prisma.$transaction(async (tx) => {
            // 恢复优惠券（如果已被预占）
            if (order.userCouponId) {
              const coupon = await tx.userCoupon.findUnique({ where: { id: order.userCouponId } })
              if (coupon && coupon.status === 'USED') {
                await tx.userCoupon.update({
                  where: { id: order.userCouponId },
                  data: { status: 'UNUSED', usedAt: null, usedOrderId: null },
                })
              }
            }

            // 同步取消关联排场
            const o = await tx.order.findUnique({ where: { id: order.id }, select: { bookingId: true } })
            if (o?.bookingId) {
              await tx.booking.update({
                where: { id: o.bookingId },
                data: { status: 'CANCELLED' },
              })
            }

            // 取消订单
            await tx.order.update({
              where: { id: order.id },
              data: { status: 'CANCELLED', cancelledAt: now },
            })
          })
        } catch (e) {
          console.error(`[OrderTimeoutJob] 取消订单 ${order.id} 失败:`, e)
        }
      }

      console.log(`[OrderTimeoutJob] 自动取消完成`)
    } catch (e) {
      console.error('[OrderTimeoutJob] 执行失败:', e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[OrderTimeoutJob] 订单超时自动取消任务已启动 (每分钟检查)')
}
