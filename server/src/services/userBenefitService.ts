import { prisma } from '../utils/prisma'
import { getMemberLevels } from '../utils/memberConfig'
import type { PrismaClient } from '@prisma/client'

function getPeriodStart(): Date {
  const now = new Date()
  return new Date(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
}

function getPeriodEnd(): Date {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  return nextMonth
}

function getBenefitQuota(benefitType: string, levelConfig?: { freeRescheduleQuota?: number }): number {
  if (benefitType === 'FREE_RESCHEDULE') {
    return levelConfig?.freeRescheduleQuota || 0
  }
  return 0
}

/**
 * 消耗用户权益（自动根据用户等级获取配额）
 */
export async function consumeBenefit(
  userId: string,
  benefitType: string,
  tx?: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
): Promise<{ success: boolean; remaining: number; totalQuota: number; usedQuota: number; message?: string }> {
  const db = tx || prisma
  const user = await db.user.findUnique({ where: { id: userId }, select: { level: true } })
  const levels = await getMemberLevels()
  const levelConfig = levels.find((l) => l.key === user?.level)
  const totalQuota = getBenefitQuota(benefitType, levelConfig)

  if (totalQuota <= 0) {
    return { success: false, remaining: 0, totalQuota: 0, usedQuota: 0, message: '当前等级无此权益' }
  }

  const periodStart = getPeriodStart()
  const periodEnd = getPeriodEnd()

  const usage = await db.userBenefitUsage.upsert({
    where: {
      userId_benefitType_periodStart: {
        userId,
        benefitType,
        periodStart,
      },
    },
    update: {},
    create: {
      userId,
      benefitType,
      periodStart,
      periodEnd,
      totalQuota,
      usedQuota: 0,
    },
  })

  if (usage.usedQuota >= totalQuota) {
    return { success: false, remaining: 0, totalQuota, usedQuota: usage.usedQuota, message: '本月免费次数已用完' }
  }

  await db.userBenefitUsage.update({
    where: { id: usage.id },
    data: { usedQuota: { increment: 1 } },
  })

  return {
    success: true,
    remaining: totalQuota - usage.usedQuota - 1,
    totalQuota,
    usedQuota: usage.usedQuota + 1,
  }
}

/**
 * 查询用户权益使用情况
 */
export async function getBenefitUsage(userId: string, benefitType: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } })
  const levels = await getMemberLevels()
  const levelConfig = levels.find((l) => l.key === user?.level)
  const totalQuota = getBenefitQuota(benefitType, levelConfig)

  const periodStart = getPeriodStart()
  const periodEnd = getPeriodEnd()

  const usage = await prisma.userBenefitUsage.findUnique({
    where: {
      userId_benefitType_periodStart: {
        userId,
        benefitType,
        periodStart,
      },
    },
  })

  const usedQuota = usage?.usedQuota || 0
  return {
    totalQuota,
    usedQuota,
    remaining: Math.max(0, totalQuota - usedQuota),
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
  }
}
