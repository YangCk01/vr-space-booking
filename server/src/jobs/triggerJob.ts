import cron from 'node-cron'
import { subDays, addDays, format } from 'date-fns'
import { prisma } from '../utils/prisma'
import { pushNotification } from '../controllers/notificationController'
import { executeCampaign, TriggerContext } from '../services/campaignRewardService'

export type TriggerEvent = 'USER_REGISTERED' | 'ORDER_COMPLETED' | 'DORMANT_DETECTED' | 'BIRTHDAY'

interface TriggerPayload {
  userId: string
  orderId?: string
  amount?: number
  [key: string]: any
}

/**
 * 启动触发器定时任务
 */
export function startTriggerJob() {
  // 每日 00:15：过期自动结束 + 预算耗尽自动暂停
  cron.schedule('15 0 * * *', async () => {
    console.log('[TriggerJob] 开始执行日常维护任务...')
    try {
      await autoEndExpiredCampaigns()
      await autoPauseBudgetExhausted()
      console.log('[TriggerJob] 日常维护完成')
    } catch (e) {
      console.error('[TriggerJob] 日常维护失败:', e)
    }
  }, { timezone: 'Asia/Shanghai' })

  // 每日 00:20：扫描沉睡用户和生日用户
  cron.schedule('20 0 * * *', async () => {
    console.log('[TriggerJob] 开始扫描触发事件...')
    try {
      await scanDormantUsers()
      await scanBirthdayUsers()
      console.log('[TriggerJob] 扫描完成')
    } catch (e) {
      console.error('[TriggerJob] 扫描失败:', e)
    }
  }, { timezone: 'Asia/Shanghai' })

  console.log('[TriggerJob] 触发器定时任务已启动 (每日 00:15/00:20)')
}

/* ─── 事件总入口 ─── */
export async function handleEvent(event: TriggerEvent, payload: TriggerPayload) {
  console.log(`[TriggerJob] 收到事件: ${event}, userId=${payload.userId}`)
  await runDynamicRules(event, payload)
}

/* ─── 动态规则引擎 ─── */
async function runDynamicRules(event: TriggerEvent, payload: TriggerPayload) {
  const rules = await prisma.triggerRule.findMany({
    where: { event, enabled: true },
  })

  for (const rule of rules) {
    try {
      // 条件判断
      const conditions = (rule.conditions as any) || {}
      if (conditions.minAmount && (payload.amount || 0) < conditions.minAmount) continue
      if (conditions.maxAmount && (payload.amount || 0) > conditions.maxAmount) continue

      // 所有规则必须关联 Campaign，统一走 executeCampaign 发放
      if (rule.campaignId) {
        const result = await executeCampaign(rule.campaignId, payload.userId, {
          event,
          source: 'REALTIME',
          payload,
        })
        console.log(
          `[TriggerJob] Campaign ${rule.campaignId} 执行结果: ${result.status}` +
            (result.reason ? ` (${result.reason})` : '')
        )
      } else {
        console.warn(`[TriggerJob] 规则 ${rule.id} 未关联 Campaign，已跳过独立执行`)
      }
    } catch (e) {
      console.error(`[TriggerJob] 规则 ${rule.id} 执行失败:`, e)
    }
  }
}

/* ─── 扫描沉睡用户（修复：使用 conditions.dormantDays）─── */
async function scanDormantUsers() {
  const rules = await prisma.triggerRule.findMany({
    where: { event: 'DORMANT_DETECTED', enabled: true },
  })

  let totalTriggered = 0

  for (const rule of rules) {
    const days = (rule.conditions as any)?.dormantDays || 30
    const since = subDays(new Date(), days)

    // 找出 days 天内无付费/完成订单的用户
    const dormantUsers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        orders: {
          none: {
            createdAt: { gte: since },
            status: { in: ['PAID', 'COMPLETED'] },
          },
        },
      },
      select: { id: true },
    })

    for (const u of dormantUsers) {
      if (rule.campaignId) {
        await executeCampaign(rule.campaignId, u.id, {
          event: 'DORMANT_DETECTED',
          source: 'CRON',
          payload: { dormantDays: days },
        })
        totalTriggered++
      }
    }

    console.log(`[TriggerJob] 沉睡扫描: ${days}天, 规则 ${rule.id}, 触发 ${dormantUsers.length} 人`)
  }

  console.log(`[TriggerJob] 沉睡扫描总计触发 ${totalTriggered} 人`)
}

/* ─── 扫描生日用户（修复：使用真实 birthday 字段 + birthdayAdvanceDays）─── */
async function scanBirthdayUsers() {
  const rules = await prisma.triggerRule.findMany({
    where: { event: 'BIRTHDAY', enabled: true },
  })

  let totalTriggered = 0

  for (const rule of rules) {
    const advanceDays = (rule.conditions as any)?.birthdayAdvanceDays || 0
    const targetDate = addDays(new Date(), advanceDays)
    const month = targetDate.getMonth() + 1
    const day = targetDate.getDate()

    // 使用真实 birthday 字段（而非 registerDate）
    const allUsers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        birthday: { not: null },
      },
      select: { id: true, birthday: true },
    })

    const birthdayUsers = allUsers.filter((u) => {
      const b = new Date(u.birthday!)
      return b.getMonth() + 1 === month && b.getDate() === day
    })

    for (const u of birthdayUsers) {
      if (rule.campaignId) {
        await executeCampaign(rule.campaignId, u.id, {
          event: 'BIRTHDAY',
          source: 'CRON',
          payload: { advanceDays, targetMonth: month, targetDay: day },
        })
        totalTriggered++
      }
    }

    console.log(`[TriggerJob] 生日扫描: 提前${advanceDays}天, 规则 ${rule.id}, 触发 ${birthdayUsers.length} 人`)
  }

  console.log(`[TriggerJob] 生日扫描总计触发 ${totalTriggered} 人`)
}

/* ─── 定时任务：过期自动结束 ─── */
async function autoEndExpiredCampaigns() {
  const expired = await prisma.campaign.findMany({
    where: {
      status: 'RUNNING',
      endAt: { lt: new Date() },
      autoEndOnExpire: true,
    },
  })

  for (const c of expired) {
    await prisma.campaign.update({
      where: { id: c.id },
      data: { status: 'ENDED' },
    })
    console.log(`[TriggerJob] 活动已自动结束: ${c.name} (${c.id})`)
  }

  if (expired.length > 0) {
    console.log(`[TriggerJob] 自动结束 ${expired.length} 个过期活动`)
  }
}

/* ─── 定时任务：预算耗尽自动暂停 ─── */
async function autoPauseBudgetExhausted() {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: 'RUNNING',
      budget: { not: null },
      autoPauseOnBudgetExhausted: true,
    },
    include: { rewards: true },
  })

  let pausedCount = 0
  for (const c of campaigns) {
    if (c.budget && c.spent >= c.budget) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { status: 'PAUSED' },
      })
      pausedCount++
      console.log(`[TriggerJob] 活动预算耗尽已自动暂停: ${c.name} (${c.id}), spent=${c.spent}, budget=${c.budget}`)
    }
  }

  if (pausedCount > 0) {
    console.log(`[TriggerJob] 自动暂停 ${pausedCount} 个预算耗尽活动`)
  }
}

/* ─── Helpers（保留兼容） ─── */
async function giftPoints(userId: string, points: number, remark: string) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { points: { increment: points } },
    }),
    prisma.balanceTransaction.create({
      data: {
        userId,
        type: 'POINTS_GIFT',
        amount: 0,
        pointsAmount: points,
        principalAmount: 0,
        bonusAmount: 0,
        totalAmount: 0,
        remark,
      },
    }),
  ])
}

async function giftCoupon(
  userId: string,
  name: string,
  type: 'EXPERIENCE_FREE' | 'DISCOUNT',
  validDays: number,
  reason: string,
  discountRate?: number
) {
  const now = new Date()
  const validTo = addDays(now, validDays)
  await prisma.userCoupon.create({
    data: {
      userId,
      name,
      type,
      discountRate: type === 'DISCOUNT' && discountRate ? discountRate : null,
      status: 'UNUSED',
      validFrom: now,
      validTo,
      source: 'CAMPAIGN',
      giftReason: reason,
    },
  })
}

async function createTrack(
  campaignId: string | null,
  userId: string,
  step: string,
  orderId: string | null,
  amount: number | null
) {
  if (!campaignId) return
  await prisma.campaignTrack.create({
    data: {
      campaignId,
      userId,
      step,
      orderId,
      amount: amount || 0,
    },
  })
}
