import { format } from 'date-fns'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

const prefixMap: Record<'normal' | 'group' | 'reschedule', string> = {
  normal: 'VRN',
  group: 'VRG',
  reschedule: 'VRS',
}

const sequenceMap: Record<'normal' | 'group' | 'reschedule', string> = {
  normal: 'order_no_normal_seq',
  group: 'order_no_group_seq',
  reschedule: 'order_no_reschedule_seq',
}

export function getOrderNoSequenceName(type: 'normal' | 'group' | 'reschedule'): string {
  return sequenceMap[type] || sequenceMap.normal
}

export function formatOrderNoFromSequence(
  type: 'normal' | 'group' | 'reschedule',
  sequence: number,
  date = new Date()
): string {
  const prefix = prefixMap[type] || prefixMap.normal
  const dateStr = format(date, 'yyyyMMdd')
  const seq = ((Math.max(1, sequence) - 1) % 99999) + 1
  return `${prefix}${dateStr}${seq.toString().padStart(5, '0')}`
}

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
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma
  const sequenceName = getOrderNoSequenceName(type)
  const rows = await client.$queryRawUnsafe<{ nextval: bigint | number }[]>(
    `SELECT nextval('${sequenceName}'::regclass) AS nextval`
  )
  const value = rows[0]?.nextval
  if (value == null) {
    throw new Error('生成订单号失败，请稍后重试')
  }
  return formatOrderNoFromSequence(type, Number(value))
}
