/**
 * 数据清理脚本：保留游戏、场地、账号基础信息，清理所有业务数据
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function cleanup() {
  console.log('=== 开始数据清理 ===')

  // 1. 删除支付记录（依赖 Order）
  const paymentCount = await prisma.payment.deleteMany({})
  console.log(`  删除 Payment: ${paymentCount.count} 条`)

  // 2. 删除余额变动流水（依赖 Order/User）
  const txCount = await prisma.balanceTransaction.deleteMany({})
  console.log(`  删除 BalanceTransaction: ${txCount.count} 条`)

  // 3. 删除订单（依赖 Booking）
  const orderCount = await prisma.order.deleteMany({})
  console.log(`  删除 Order: ${orderCount.count} 条`)

  // 4. 删除预约排场（依赖 Venue/Game/User）
  const bookingCount = await prisma.booking.deleteMany({})
  console.log(`  删除 Booking: ${bookingCount.count} 条`)

  // 5. 删除充值记录
  const rechargeCount = await prisma.rechargeRecord.deleteMany({})
  console.log(`  删除 RechargeRecord: ${rechargeCount.count} 条`)

  // 6. 删除每日报表
  const reportCount = await prisma.dailyFinancialReport.deleteMany({})
  console.log(`  删除 DailyFinancialReport: ${reportCount.count} 条`)

  // 7. 删除用户通知
  const notifCount = await prisma.notification.deleteMany({})
  console.log(`  删除 Notification: ${notifCount.count} 条`)

  // 8. 删除操作日志
  const logCount = await prisma.operationLog.deleteMany({})
  console.log(`  删除 OperationLog: ${logCount.count} 条`)

  // 9. 重置用户余额相关字段（保留账号基本信息）
  const userCount = await prisma.user.updateMany({
    data: {
      balance: 0,
      principalBalance: 0,
      bonusBalance: 0,
      points: 0,
      totalSpent: 0,
      totalVisits: 0,
      level: 'NORMAL',
    }
  })
  console.log(`  重置 User 余额字段: ${userCount.count} 个用户`)

  // 10. 删除设备维护记录（保留设备本身）
  const maintCount = await prisma.maintenanceRecord.deleteMany({})
  console.log(`  删除 MaintenanceRecord: ${maintCount.count} 条`)

  // 11. 删除场地管理员关系
  const vmCount = await prisma.venueManager.deleteMany({})
  console.log(`  删除 VenueManager: ${vmCount.count} 条`)

  console.log('=== 清理完成 ===')
}

cleanup().catch(e => {
  console.error(e)
  process.exit(1)
}).finally(() => prisma['$disconnect']())
