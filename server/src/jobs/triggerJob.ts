import cron from 'node-cron'
import { subDays, format } from 'date-fns'
import { prisma } from '../utils/prisma'
import { pushNotification } from '../controllers/notificationController'
import { addDays } from 'date-fns'

export type TriggerEvent = 'USER_REGISTERED' | 'ORDER_COMPLETED' | 'DORMANT_DETECTED' | 'BIRTHDAY'

interface TriggerPayload {
  userId: string
  orderId?: string
  amount?: number
  [key: string]: any
}

/**
 * 启动触发器定时任务（每日 00:20 扫描沉睡用户和生日用户）
 */
export function startTriggerJob() {
  cron.schedule('20 0 * * *', async () => {
    console.log('[TriggerJob] 开始扫描触发事件...')
    try {
      await scanDormantUsers()
      await scanBirthdayUsers()
      console.log('[TriggerJob] 扫描完成')
    } catch (e) {
      console.error('[TriggerJob] 扫描失败:', e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[TriggerJob] 触发器定时任务已启动 (每日 00:20)')
}

/* ─── 事件总入口 ─── */
export async function handleEvent(event: TriggerEvent, payload: TriggerPayload) {
  console.log(`[TriggerJob] 收到事件: ${event}, userId=${payload.userId}`)

  // 1. 执行内置规则
  await runBuiltinRule(event, payload)

  // 2. 执行动态规则
  await runDynamicRules(event, payload)
}

/* ─── 内置规则引擎 ─── */
async function runBuiltinRule(event: TriggerEvent, payload: TriggerPayload) {
  const { userId, orderId, amount } = payload

  if (event === 'USER_REGISTERED') {
    // 新客注册：赠送 100 积分 + 体验券
    await giftPoints(userId, 100, '新客注册礼')
    await giftCoupon(userId, '新客体验券', 'EXPERIENCE_FREE', 30, 'WELCOME')
    await createTrack(null, userId, 'ISSUED', null, null)
    await pushNotification(userId, 'COUPON_GIFT', '欢迎礼', '欢迎加入 VR Space，赠送您 100 积分和一张体验券')
    return
  }

  if (event === 'ORDER_COMPLETED') {
    // 首单礼：如果这是用户第一笔已完成订单
    const completedCount = await prisma.order.count({
      where: { userId, status: 'COMPLETED' },
    })
    if (completedCount === 1) {
      await giftPoints(userId, 200, '首单礼')
      await giftCoupon(userId, '首单折扣券', 'DISCOUNT', 30, 'FIRST_ORDER', 85)
      await createTrack(null, userId, 'ISSUED', orderId || null, null)
      await pushNotification(userId, 'COUPON_GIFT', '首单礼', '恭喜完成首单，赠送您 200 积分和一张 85 折券')
    }
    return
  }

  if (event === 'DORMANT_DETECTED') {
    // 沉睡唤醒：赠送折扣券
    await giftCoupon(userId, '老客召回券', 'DISCOUNT', 14, 'DORMANT_WAKE', 90)
    await createTrack(null, userId, 'ISSUED', null, null)
    await pushNotification(userId, 'COUPON_GIFT', '专属优惠', '好久不见，送您一张 9 折券，期待您的光临')
    return
  }

  if (event === 'BIRTHDAY') {
    // 生日祝福：赠送 500 积分
    await giftPoints(userId, 500, '生日祝福')
    await createTrack(null, userId, 'ISSUED', null, null)
    await pushNotification(userId, 'POINTS_GIFT', '生日快乐', 'VR Space 祝您生日快乐，赠送 500 积分')
    return
  }
}

/* ─── 动态规则引擎 ─── */
async function runDynamicRules(event: TriggerEvent, payload: TriggerPayload) {
  const rules = await prisma.triggerRule.findMany({
    where: { event, enabled: true },
  })

  for (const rule of rules) {
    try {
      // runOnce 检查
      if (rule.runOnce) {
        const existing = await prisma.campaignTrack.findFirst({
          where: {
            userId: payload.userId,
            campaignId: rule.id, // 复用 campaignId 字段存储 ruleId
            step: 'RULE_EXECUTED',
          },
        })
        if (existing) continue
      }

      // 条件判断（简单实现）
      const conditions = (rule.conditions as any) || {}
      if (conditions.minAmount && (payload.amount || 0) < conditions.minAmount) continue
      if (conditions.maxAmount && (payload.amount || 0) > conditions.maxAmount) continue

      // 执行动作
      const actions = (rule.actions as any[]) || []
      for (const action of actions) {
        if (action.type === 'GIFT_POINTS') {
          await giftPoints(payload.userId, action.points || 0, `规则:${rule.name}`)
        } else if (action.type === 'GIFT_COUPON') {
          await giftCoupon(
            payload.userId,
            action.couponName || '优惠券',
            action.couponType || 'DISCOUNT',
            action.validityDays || 7,
            `RULE_${rule.name}`,
            action.discountRate
          )
        } else if (action.type === 'PUSH_NOTIFICATION') {
          await pushNotification(payload.userId, 'MARKETING', action.title || '通知', action.content || '')
        }
      }

      // 记录执行
      await createTrack(rule.id, payload.userId, 'RULE_EXECUTED', payload.orderId || null, null)
    } catch (e) {
      console.error(`[TriggerJob] 规则 ${rule.id} 执行失败:`, e)
    }
  }
}

/* ─── 扫描沉睡用户 ─── */
async function scanDormantUsers() {
  const thirtyDaysAgo = subDays(new Date(), 30)
  const ninetyDaysAgo = subDays(new Date(), 90)

  // 找出有 DORMANT 标签但还没触发过唤醒的用户（简化：直接查标签）
  const dormantTags = await prisma.userTag.findMany({
    where: { tag: 'DORMANT' },
    select: { userId: true },
  })

  for (const tag of dormantTags) {
    await handleEvent('DORMANT_DETECTED', { userId: tag.userId })
  }

  console.log(`[TriggerJob] 扫描沉睡用户 ${dormantTags.length} 人`)
}

/* ─── 扫描生日用户（以注册日期的月日作为生日）─── */
async function scanBirthdayUsers() {
  const today = new Date()
  const todayMonth = today.getMonth() + 1
  const todayDate = today.getDate()

  const users = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    select: { id: true, registerDate: true },
  })

  const birthdayUsers = users.filter((u) => {
    const d = new Date(u.registerDate)
    return d.getMonth() + 1 === todayMonth && d.getDate() === todayDate
  })

  for (const u of birthdayUsers) {
    await handleEvent('BIRTHDAY', { userId: u.id })
  }

  console.log(`[TriggerJob] 扫描生日用户 ${birthdayUsers.length} 人`)
}

/* ─── Helpers ─── */
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
  await prisma.campaignTrack.create({
    data: {
      campaignId: campaignId || 'builtin',
      userId,
      step,
      orderId,
      amount: amount || 0,
    },
  })
}
