import { prisma } from '../utils/prisma'
import { getConfig } from './configService'

const giftFrequencyMap = new Map<string, number[]>() // operatorId -> timestamps

function cleanupFrequencyMap(operatorId: string, windowMs: number) {
  const now = Date.now()
  const entries = giftFrequencyMap.get(operatorId) || []
  const filtered = entries.filter((t) => now - t < windowMs)
  if (filtered.length === 0) {
    giftFrequencyMap.delete(operatorId)
  } else {
    giftFrequencyMap.set(operatorId, filtered)
  }
}

export function recordGiftOperation(operatorId: string) {
  const entries = giftFrequencyMap.get(operatorId) || []
  entries.push(Date.now())
  giftFrequencyMap.set(operatorId, entries)
}

export async function checkGiftRisk(userId: string, operatorId: string, points: number) {
  // 1. 单日赠送上限检查
  const dailyLimit = getConfig<number>('points_gift_daily_limit', 10000)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const todayGifts = await prisma.balanceTransaction.aggregate({
    _sum: { pointsAmount: true },
    where: {
      type: 'POINTS_GIFT',
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  })

  const todayTotal = todayGifts._sum.pointsAmount || 0
  if (dailyLimit !== undefined && todayTotal + points > dailyLimit) {
    throw new Error(`单日积分赠送上限为 ${dailyLimit}，今日已赠送 ${todayTotal}，超出限制`)
  }

  // 2. 异常频率检测（1分钟内同一操作人赠送 > 5次）
  cleanupFrequencyMap(operatorId, 60 * 1000)
  const entries = giftFrequencyMap.get(operatorId) || []
  if (entries.length >= 5) {
    throw new Error('操作过于频繁，请稍后再试')
  }
}

export async function checkCouponGiftRisk(count: number) {
  const dailyLimit = getConfig<number>('coupon_gift_daily_limit', 10)
  if (dailyLimit === undefined || dailyLimit <= 0) return

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const todayTotal = await prisma.userCoupon.count({
    where: {
      source: 'MANUAL_GIFT',
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  })

  if (todayTotal + count > dailyLimit) {
    throw new Error(`单日优惠券赠送上限为 ${dailyLimit} 张，今日已赠送 ${todayTotal} 张，超出限制`)
  }
}

export function checkBatchLimit(count: number, maxCount: number) {
  if (count > maxCount) {
    throw new Error(`批量操作数量超出限制，单次最多 ${maxCount} 条`)
  }
  if (count <= 0) {
    throw new Error('批量操作数量必须大于0')
  }
}
