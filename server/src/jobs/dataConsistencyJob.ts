import cron from 'node-cron'
import { format } from 'date-fns'
import { prisma } from '../utils/prisma'
import { pushAdminNotification } from '../controllers/notificationController'
import { runTrackedJob } from './jobRunner'

/**
 * 每日 03:00 执行数据一致性校验
 */
export function startDataConsistencyJob() {
  cron.schedule('0 3 * * *', async () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    console.log(`[DataConsistencyJob] 开始数据一致性校验: ${today}`)
    try {
      await runTrackedJob('data-consistency', () => runDataConsistencyCheck(today))
      console.log(`[DataConsistencyJob] 数据一致性校验完成: ${today}`)
    } catch (e) {
      console.error(`[DataConsistencyJob] 数据一致性校验失败: ${today}`, e)
    }
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[DataConsistencyJob] 数据一致性校验定时任务已启动 (每日 03:00)')
}

export async function runDataConsistencyCheck(checkDate: string) {
  const errors: any[] = []
  let totalChecked = 0

  // 1. 检查用户余额一致性（本金 + 赠送 = 流水累计）
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      principalBalance: true,
      bonusBalance: true,
      points: true,
    },
  })

  const txSums = await prisma.balanceTransaction.groupBy({
    by: ['userId'],
    _sum: {
      principalAmount: true,
      bonusAmount: true,
      pointsAmount: true,
    },
  })

  const txMap = new Map(
    txSums.map((t) => [
      t.userId,
      {
        principalAmount: t._sum.principalAmount || 0,
        bonusAmount: t._sum.bonusAmount || 0,
        pointsAmount: t._sum.pointsAmount || 0,
      },
    ])
  )

  for (const user of users) {
    totalChecked++
    const txSum = txMap.get(user.id) || { principalAmount: 0, bonusAmount: 0, pointsAmount: 0 }

    const principalDiff = user.principalBalance - txSum.principalAmount
    if (principalDiff !== 0) {
      errors.push({
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        field: 'principalBalance',
        actual: user.principalBalance,
        expected: txSum.principalAmount,
        diff: principalDiff,
      })
    }

    const bonusDiff = user.bonusBalance - txSum.bonusAmount
    if (bonusDiff !== 0) {
      errors.push({
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        field: 'bonusBalance',
        actual: user.bonusBalance,
        expected: txSum.bonusAmount,
        diff: bonusDiff,
      })
    }

    const pointsDiff = user.points - txSum.pointsAmount
    if (pointsDiff !== 0) {
      errors.push({
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        field: 'points',
        actual: user.points,
        expected: txSum.pointsAmount,
        diff: pointsDiff,
      })
    }
  }

  // 写入检查结果
  const errorCount = errors.length
  const status = errorCount === 0 ? 'PASS' : 'FAIL'

  await prisma.dataCheckResult.create({
    data: {
      checkType: 'BALANCE_CONSISTENCY',
      checkDate,
      totalChecked,
      errorCount,
      errors: errors.slice(0, 100) as any, // 限制写入数量
      status,
    },
  })

  // 如果有异常，推送通知给 SUPER_ADMIN
  if (errorCount > 0) {
    await pushAdminNotification(
      'SYSTEM_ALERT',
      '数据一致性校验异常',
      `日期 ${checkDate} 共检查 ${totalChecked} 位用户，发现 ${errorCount} 条余额/积分不一致记录，请尽快排查。`
    )
  }

  return { totalChecked, errorCount, errors }
}
