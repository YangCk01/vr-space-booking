import { format } from 'date-fns'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * 生成订单号
 * 规则：前缀(3位) + 日期(8位) + 当日自增序号(5位)
 *   - 普通订单：VRN + yyyyMMdd + 00001
 *   - 团购订单：VRG + yyyyMMdd + 00001
 *   - 改签费订单：VRS + yyyyMMdd + 00001
 * 使用当日自增序号替代随机数字，便于识别与管理。
 */
export async function generateOrderNo(
  type: 'normal' | 'group' | 'reschedule' = 'normal',
  tx?: Prisma.TransactionClient,
  maxRetries = 3
): Promise<string> {
  const prefixMap: Record<string, string> = {
    normal: 'VRN',
    group: 'VRG',
    reschedule: 'VRS',
  }
  const prefix = prefixMap[type] || 'VRN'
  const dateStr = format(new Date(), 'yyyyMMdd')
  const client = tx || prisma

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastOrder = await client.order.findFirst({
      where: { orderNo: { startsWith: `${prefix}${dateStr}` } },
      orderBy: { orderNo: 'desc' },
    })

    let seq = 1
    if (lastOrder?.orderNo) {
      const match = lastOrder.orderNo.match(new RegExp(`^${prefix}\\d{8}(\\d{5})$`))
      if (match) {
        seq = parseInt(match[1], 10) + 1
      }
    }

    const seqStr = seq.toString().padStart(5, '0')
    const orderNo = `${prefix}${dateStr}${seqStr}`

    // 非事务场景下，先校验唯一性再返回，避免并发生成重复单号
    if (!tx) {
      const exists = await client.order.findUnique({ where: { orderNo } })
      if (!exists) return orderNo
      continue
    }

    return orderNo
  }

  throw new Error('生成订单号失败，请稍后重试')
}
