import cron from 'node-cron'
import { subDays } from 'date-fns'
import { prisma } from '../utils/prisma'

const ALL_TAGS = ['NEW_CUSTOMER', 'FIRST_ORDER', 'ACTIVE', 'DORMANT', 'CHURN_RISK', 'VIP']

/**
 * 每日 00:10 执行用户标签扫描
 */
export function startUserTagJob() {
  cron.schedule('10 0 * * *', async () => {
    console.log('[UserTagJob] 开始扫描用户标签...')
    try {
      await runUserTagScan()
      console.log('[UserTagJob] 用户标签扫描完成')
    } catch (e) {
      console.error('[UserTagJob] 扫描失败:', e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[UserTagJob] 用户标签定时任务已启动 (每日 00:10)')
}

/**
 * 执行全量用户标签扫描（可手动触发）
 */
export async function runUserTagScan() {
  const now = new Date()
  const sevenDaysAgo = subDays(now, 7)
  const thirtyDaysAgo = subDays(now, 30)
  const ninetyDaysAgo = subDays(now, 90)

  // 拉取全量用户（仅 CUSTOMER）
  const users = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    select: {
      id: true,
      registerDate: true,
      totalSpent: true,
    },
  })

  // 批量获取消费数据
  const userIds = users.map((u) => u.id)

  const [orderGroups, recentOrderGroups] = await Promise.all([
    // 每个用户的订单数、首单时间、最后消费时间
    prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: { in: ['PAID', 'COMPLETED'] } },
      _count: { userId: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    // 30 天内消费次数
    prisma.order.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: { in: ['PAID', 'COMPLETED'] },
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: { userId: true },
    }),
  ])

  const orderCountMap = new Map(orderGroups.map((g) => [g.userId, g._count.userId]))
  const recentCountMap = new Map(recentOrderGroups.map((g) => [g.userId, g._count.userId]))
  const lastOrderMap = new Map(orderGroups.map((g) => [g.userId, g._max.createdAt]))

  // 聚合要写入的标签
  const tagUpserts: { userId: string; tag: string }[] = []

  for (const user of users) {
    const tagsToAdd = new Set<string>()
    const orderCount = orderCountMap.get(user.id) || 0
    const recentCount = recentCountMap.get(user.id) || 0
    const lastOrderAt = lastOrderMap.get(user.id) || null

    // NEW_CUSTOMER: 注册 ≤ 7 天且未消费
    if (user.registerDate >= sevenDaysAgo && orderCount === 0) {
      tagsToAdd.add('NEW_CUSTOMER')
    }

    // FIRST_ORDER: 完成首单
    if (orderCount >= 1) {
      tagsToAdd.add('FIRST_ORDER')
    }

    // ACTIVE: 30 天内有消费
    if (recentCount > 0 || (lastOrderAt && lastOrderAt >= thirtyDaysAgo)) {
      tagsToAdd.add('ACTIVE')
    }

    // DORMANT: 30~90 天无消费
    if (orderCount > 0 && lastOrderAt && lastOrderAt < thirtyDaysAgo && lastOrderAt >= ninetyDaysAgo) {
      tagsToAdd.add('DORMANT')
    }

    // CHURN_RISK: ≥ 90 天无消费
    if (orderCount > 0 && lastOrderAt && lastOrderAt < ninetyDaysAgo) {
      tagsToAdd.add('CHURN_RISK')
    }

    // VIP: 累计消费 ≥ ¥5000 或 30 天内消费 ≥ 3 次
    if (user.totalSpent >= 500000 || recentCount >= 3) {
      tagsToAdd.add('VIP')
    }

    for (const tag of tagsToAdd) {
      tagUpserts.push({ userId: user.id, tag })
    }
  }

  // 使用事务：先删除过期标签，再 upsert 新标签
  await prisma.$transaction(async (tx) => {
    // 删除不应存在的标签
    await tx.userTag.deleteMany({
      where: {
        userId: { in: userIds },
        tag: { in: ALL_TAGS },
      },
    })

    // 批量创建（去重已由 deleteMany + 聚合保证）
    if (tagUpserts.length > 0) {
      // Prisma 不原生支持 createMany 带 skipDuplicates，分批处理
      const batchSize = 1000
      for (let i = 0; i < tagUpserts.length; i += batchSize) {
        const batch = tagUpserts.slice(i, i + batchSize)
        await tx.userTag.createMany({
          data: batch,
          skipDuplicates: true,
        })
      }
    }
  })

  console.log(`[UserTagJob] 处理用户 ${users.length} 人，写入标签 ${tagUpserts.length} 个`)
}
