import cron from 'node-cron'
import { prisma } from '../utils/prisma'
import { releaseEquipment } from '../services/equipmentService'

/**
 * 关闭已超过支付时限的待支付订单。
 * 该函数可被定时任务调用，也可在订单列表/详情等入口做兜底同步。
 */
export async function expirePendingOrders(now = new Date()) {
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      expireAt: { lt: now },
    },
    select: { id: true, orderNo: true, userCouponId: true, bookingId: true },
  })

  if (expiredOrders.length === 0) return 0

  let processed = 0
  for (const order of expiredOrders) {
    try {
      let shouldReleaseEquipment = false
      await prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: {
            id: order.id,
            status: 'PENDING',
            expireAt: { lt: now },
          },
          data: { status: 'CANCELLED', cancelledAt: now },
        })

        if (updated.count === 0) return

        // 同步取消该订单下的子订单（团购父订单过期时同步处理）
        await tx.order.updateMany({
          where: { parentOrderId: order.id, status: 'PENDING' },
          data: { status: 'CANCELLED', cancelledAt: now },
        })

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

        if (order.bookingId) {
          await tx.booking.update({
            where: { id: order.bookingId },
            data: { status: 'CANCELLED' },
          })
          shouldReleaseEquipment = true
        }

        processed += 1
      })

      if (shouldReleaseEquipment && order.bookingId) {
        await releaseEquipment(order.bookingId)
      }
    } catch (e) {
      console.error(`[OrderTimeoutJob] 取消订单 ${order.orderNo || order.id} 失败:`, e)
    }
  }

  return processed
}

/**
 * 每分钟执行一次：自动取消过期的待支付订单
 */
export function startOrderTimeoutJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const processed = await expirePendingOrders()
      if (processed > 0) {
        console.log(`[OrderTimeoutJob] 自动取消 ${processed} 个过期待支付订单`)
      }
    } catch (e) {
      console.error('[OrderTimeoutJob] 执行失败:', e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[OrderTimeoutJob] 订单超时自动取消任务已启动 (每分钟检查)')
}
