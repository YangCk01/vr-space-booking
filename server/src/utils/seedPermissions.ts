import { prisma } from './prisma'
import { BUILTIN_PERMISSIONS, BUILTIN_ROLES } from '../domain/adminPermissions'

const INITIAL_SYSTEM_CONFIGS = [
  { key: 'member_level_thresholds', value: JSON.stringify([0, 10000, 50000, 100000]), type: 'JSON', description: '会员等级消费阈值（分）' },
  { key: 'member_discount_rates', value: JSON.stringify([100, 95, 90, 85]), type: 'JSON', description: '会员等级折扣率（%）' },
  { key: 'points_earn_ratio', value: '100', type: 'NUMBER', description: '积分获取比例（消费多少分获得1积分）' },
  { key: 'points_deduct_ratio', value: '100', type: 'NUMBER', description: '积分抵扣比例（多少积分抵扣1元）' },
  { key: 'points_gift_daily_limit', value: '10000', type: 'NUMBER', description: '单日积分赠送上限' },
  { key: 'coupon_gift_daily_limit', value: '10', type: 'NUMBER', description: '单日优惠券赠送上限' },
  { key: 'dormant_days', value: '90', type: 'NUMBER', description: '沉默用户天数' },
  { key: 'recon_alert_enabled', value: 'true', type: 'BOOLEAN', description: '对账异常告警开关' },
  { key: 'recon_alert_amount_threshold', value: '10000', type: 'NUMBER', description: '对账异常金额阈值（分）' },
  {
    key: 'third_party_platform_config',
    value: JSON.stringify({
      MEITUAN: { enabled: true, autoVerify: true, settlementCycle: 'T+1', serviceRate: 6, merchantId: 'MT-local-demo', contact: '未接入真实平台' },
      DOUYIN: { enabled: true, autoVerify: true, settlementCycle: 'T+1', serviceRate: 5, merchantId: 'DY-local-demo', contact: '未接入真实平台' },
      DIANPING: { enabled: true, autoVerify: false, settlementCycle: 'T+7', serviceRate: 6, merchantId: 'DP-local-demo', contact: '未接入真实平台' },
    }),
    type: 'JSON',
    description: '第三方平台接入配置（启用/停用、自动核销、结算周期、服务费率等）',
  },
]

export async function seedPermissions() {
  console.log('[Seed] Start seeding permissions...')

  // 1. Seed permissions
  for (const perm of BUILTIN_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      create: perm,
      update: { name: perm.name, module: perm.module },
    })
  }
  console.log(`[Seed] Seeded ${BUILTIN_PERMISSIONS.length} permissions`)

  // 2. Seed roles with permissions
  for (const roleDef of BUILTIN_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
      },
      update: {
        description: roleDef.description,
        isSystem: roleDef.isSystem,
      },
    })

    // Clear existing permissions and re-assign
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })

    const permissions = await prisma.permission.findMany({
      where: { code: { in: roleDef.permissions } },
    })

    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    })
  }
  console.log(`[Seed] Seeded ${BUILTIN_ROLES.length} roles`)

  // 3. Seed system configs
  for (const cfg of INITIAL_SYSTEM_CONFIGS) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      create: cfg,
      update: { value: cfg.value, type: cfg.type, description: cfg.description },
    })
  }
  console.log(`[Seed] Seeded ${INITIAL_SYSTEM_CONFIGS.length} system configs`)

  // 4. Sync legacy role enum to new Role model for existing users
  const allUsers = await prisma.user.findMany({ select: { id: true, role: true } })
  for (const user of allUsers) {
    const role = await prisma.role.findUnique({ where: { name: user.role } })
    if (role) {
      const existing = await prisma.user.findUnique({
        where: { id: user.id },
        select: { roles: { where: { id: role.id } } },
      })
      if (!existing?.roles.length) {
        await prisma.user.update({
          where: { id: user.id },
          data: { roles: { connect: { id: role.id } } },
        })
      }
    }
  }
  console.log('[Seed] Synced user legacy roles')

  // 5. 清理旧格式权限（菜单 key 格式），这些不应再出现在数据库中
  const OLD_MENU_KEYS = ['home', 'venues', 'games', 'booking', 'orders', 'users', 'analytics', 'finance', 'accounts', 'settings', 'audit-logs']
  const deletedPerms = await prisma.permission.deleteMany({
    where: { code: { in: OLD_MENU_KEYS } },
  })
  if (deletedPerms.count > 0) {
    console.log(`[Seed] Cleaned ${deletedPerms.count} legacy permissions`)
  }

  console.log('[Seed] Seeding completed')
}
