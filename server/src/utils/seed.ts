import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

async function seed() {
  console.log('🌱 开始初始化种子数据...')

  // 清空现有数据（开发环境用）
  await prisma.payment.deleteMany()
  await prisma.order.deleteMany()
  await prisma.booking.deleteMany()
  await prisma.maintenanceRecord.deleteMany()
  await prisma.equipment.deleteMany()
  await prisma.venue.deleteMany()
  await prisma.operationLog.deleteMany()
  await prisma.systemSetting.deleteMany()
  await prisma.user.deleteMany()

  // 创建管理员账户
  const adminPassword = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.create({
    data: {
      phone: '13800000000',
      password: adminPassword,
      name: '系统管理员',
      role: 'SUPER_ADMIN',
      email: 'admin@vrspace.com',
    },
  })
  console.log('✅ 管理员创建成功:', admin.phone)

  // 创建测试用户
  const userPassword = await bcrypt.hash('123456', 12)
  const testUsers = [
    { phone: '13800123456', name: '张明', level: 'NORMAL' as const, totalVisits: 24, totalSpent: 1280000 },
    { phone: '13900123457', name: '李华', level: 'MEMBER' as const, totalVisits: 15, totalSpent: 640000 },
    { phone: '13700123458', name: '王芳', level: 'VIP' as const, totalVisits: 42, totalSpent: 2560000 },
    { phone: '13600123459', name: '赵强', level: 'NORMAL' as const, totalVisits: 5, totalSpent: 180000 },
    { phone: '13500123460', name: '孙丽', level: 'MEMBER' as const, totalVisits: 18, totalSpent: 860000 },
  ]

  for (const u of testUsers) {
    await prisma.user.create({
      data: {
        phone: u.phone,
        password: userPassword,
        name: u.name,
        role: 'CUSTOMER',
        level: u.level,
        totalVisits: u.totalVisits,
        totalSpent: u.totalSpent,
      },
    })
  }
  console.log('✅ 测试用户创建成功')

  // 创建场地
  const venues = [
    { name: '场地A', theme: '科幻主题', status: 'FREE' as const, area: 120, capacity: 6, image: '/venue-a.jpg' },
    { name: '场地B', theme: '丛林冒险', status: 'IN_USE' as const, area: 150, capacity: 8, image: '/venue-b.jpg' },
    { name: '场地C', theme: '未来城市', status: 'FREE' as const, area: 200, capacity: 10, image: '/venue-c.jpg' },
    { name: '场地D', theme: '海底世界', status: 'MAINTENANCE' as const, area: 120, capacity: 6, image: '/venue-d.jpg' },
  ]

  for (const v of venues) {
    await prisma.venue.create({ data: v })
  }
  console.log('✅ 场地创建成功')

  // 创建设备
  const equipments = [
    { name: 'VR头盔-PICO4-A01', model: 'PICO 4', code: 'VR-HEAD-001', type: 'HEADSET' as const, status: 'NORMAL' as const },
    { name: 'VR头盔-PICO4-A02', model: 'PICO 4', code: 'VR-HEAD-002', type: 'HEADSET' as const, status: 'NORMAL' as const },
    { name: '定位基站-B01', model: 'SteamVR 2.0', code: 'BASE-001', type: 'TRACKER' as const, status: 'NORMAL' as const },
    { name: '体感手柄-C01', model: 'Quest Controller', code: 'CTRL-001', type: 'CONTROLLER' as const, status: 'MAINTENANCE' as const },
    { name: '主机设备-D01', model: 'RTX 4090 PC', code: 'HOST-001', type: 'COMPUTER' as const, status: 'ERROR' as const },
  ]

  for (const e of equipments) {
    await prisma.equipment.create({ data: e })
  }
  console.log('✅ 设备创建成功')

  // 系统设置默认值
  const defaultSettings = [
    /* ── basic ── */
    { key: 'venue_name', value: { value: 'VR大空间体验馆' }, category: 'basic' },
    { key: 'venue_address', value: { value: '北京市朝阳区xxx' }, category: 'basic' },
    { key: 'venue_phone', value: { value: '400-888-0000' }, category: 'basic' },
    { key: 'venue_hours', value: { value: '09:00-22:00' }, category: 'basic' },
    { key: 'venue_description', value: { value: 'VR大空间体验馆提供沉浸式虚拟现实体验，支持多人联机互动。' }, category: 'basic' },
    { key: 'logo', value: { value: '' }, category: 'basic' },
    { key: 'service_qr', value: { value: '' }, category: 'basic' },
    { key: 'announcement', value: { value: '' }, category: 'basic' },
    { key: 'max_venues', value: { value: 10 }, category: 'basic' },
    /* ── booking ── */
    { key: 'booking_interval', value: { value: 30 }, category: 'booking' },
    { key: 'booking_min_duration', value: { value: 30 }, category: 'booking' },
    { key: 'booking_max_duration', value: { value: 240 }, category: 'booking' },
    { key: 'booking_advance_days', value: { value: 7 }, category: 'booking' },
    { key: 'booking_cancel_hours', value: { value: 2 }, category: 'booking' },
    { key: 'booking_refund_rate', value: { value: 50 }, category: 'booking' },
    {
      key: 'booking_refund_tiers',
      value: {
        value: [
          { hours: 24, rate: 100, label: '开场24小时前' },
          { hours: 2, rate: 50, label: '开场2-24小时' },
          { hours: 0, rate: 0, label: '开场2小时内' },
        ],
      },
      category: 'booking',
    },
    { key: 'booking_allow_overtime', value: { value: false }, category: 'booking' },
    { key: 'booking_overtime_minutes', value: { value: 10 }, category: 'booking' },
    { key: 'verify_advance_minutes', value: { value: 15 }, category: 'booking' },
    { key: 'late_buffer_minutes', value: { value: 10 }, category: 'booking' },
    { key: 'no_show_deadline_minutes', value: { value: 15 }, category: 'booking' },
    { key: 'no_show_penalty_rate', value: { value: 100 }, category: 'booking' },
    { key: 'enable_auto_no_show', value: { value: true }, category: 'booking' },
    { key: 'reschedule_fee_rate', value: { value: 10 }, category: 'booking' },
    { key: 'reschedule_deadline_hours', value: { value: 2 }, category: 'booking' },
    { key: 'reschedule_max_count', value: { value: 1 }, category: 'booking' },
    { key: 'reschedule_allow_after_start', value: { value: true }, category: 'booking' },
    { key: 'reschedule_after_start_minutes', value: { value: 15 }, category: 'booking' },
    /* ── payment ── */
    { key: 'payment_wechat', value: { value: true }, category: 'payment' },
    { key: 'payment_alipay', value: { value: true }, category: 'payment' },
    { key: 'payment_cash', value: { value: true }, category: 'payment' },
    { key: 'payment_wechat_rate', value: { value: 0.6 }, category: 'payment' },
    { key: 'payment_alipay_rate', value: { value: 0.6 }, category: 'payment' },
    { key: 'payment_full_refund_hours', value: { value: 24 }, category: 'payment' },
    { key: 'payment_partial_refund_rate', value: { value: 50 }, category: 'payment' },
    { key: 'wechat_mchid', value: { value: '' }, category: 'payment' },
    { key: 'wechat_api_key', value: { value: '' }, category: 'payment' },
    { key: 'alipay_appid', value: { value: '' }, category: 'payment' },
    { key: 'alipay_private_key', value: { value: '' }, category: 'payment' },
    { key: 'sms_access_key', value: { value: '' }, category: 'payment' },
    { key: 'sms_secret', value: { value: '' }, category: 'payment' },
    { key: 'wxmini_appid', value: { value: '' }, category: 'payment' },
    /* ── notification ── */
    { key: 'notify_sms', value: { value: true }, category: 'notification' },
    { key: 'notify_wx', value: { value: true }, category: 'notification' },
    { key: 'notify_email', value: { value: false }, category: 'notification' },
    { key: 'notify_site', value: { value: true }, category: 'notification' },
    { key: 'scene_booking_success', value: { value: true }, category: 'notification' },
    { key: 'scene_booking_remind', value: { value: true }, category: 'notification' },
    { key: 'scene_booking_cancel', value: { value: true }, category: 'notification' },
    { key: 'scene_pay_success', value: { value: true }, category: 'notification' },
    { key: 'scene_marketing', value: { value: false }, category: 'notification' },
    { key: 'scene_admin_product_sold', value: { value: true }, category: 'notification' },
    { key: 'scene_admin_low_stock', value: { value: true }, category: 'notification' },
    { key: 'scene_admin_new_order', value: { value: true }, category: 'notification' },
    { key: 'scene_admin_refund_request', value: { value: true }, category: 'notification' },
    /* ── member ── */
    { key: 'recharge_tiers', value: { value: [{ amount: 500, bonus: 0, level: 'NORMAL' }, { amount: 1000, bonus: 100, level: 'MEMBER' }, { amount: 2000, bonus: 300, level: 'VIP' }, { amount: 5000, bonus: 1000, level: 'VIP+' }] }, category: 'member' },
    { key: 'member_levels', value: { value: [{ key: 'NORMAL', name: '普通会员', discount: 100, threshold: 0 }, { key: 'MEMBER', name: '银卡会员', discount: 95, threshold: 1000 }, { key: 'VIP', name: '金卡会员', discount: 90, threshold: 2000 }, { key: 'VIP+', name: '钻石会员', discount: 85, threshold: 5000 }] }, category: 'member' },
    { key: 'points_earn_rate', value: { value: 1 }, category: 'member' },
    { key: 'points_deduct_rate', value: { value: 100 }, category: 'member' },
  ]

  for (const s of defaultSettings) {
    await prisma.systemSetting.create({ data: s })
  }
  console.log('✅ 系统设置初始化成功')

  console.log('🎉 种子数据初始化完成！')
  console.log('')
  console.log('登录信息：')
  console.log('  管理员: 13800000000 / admin123')
  console.log('  测试用户: 13800123456 / 123456')
}

seed()
  .catch((e) => {
    console.error('❌ 种子数据初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
