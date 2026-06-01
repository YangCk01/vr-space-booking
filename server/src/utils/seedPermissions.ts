import { prisma } from './prisma'

const BUILTIN_PERMISSIONS = [
  { code: 'order:read', name: '订单查看', module: 'order' },
  { code: 'order:refund', name: '订单退款', module: 'order' },
  { code: 'order:verify', name: '订单核销', module: 'order' },
  { code: 'order:export', name: '订单导出', module: 'order' },
  { code: 'finance:read', name: '财务查看', module: 'finance' },
  { code: 'finance:adjust', name: '财务调整', module: 'finance' },
  { code: 'finance:report', name: '财务报表', module: 'finance' },
  { code: 'user:read', name: '用户查看', module: 'user' },
  { code: 'user:edit', name: '用户编辑', module: 'user' },
  { code: 'user:gift', name: '用户赠送', module: 'user' },
  { code: 'user:export', name: '用户导出', module: 'user' },
  { code: 'venue:read', name: '场地查看', module: 'venue' },
  { code: 'venue:manage', name: '场地管理', module: 'venue' },
  { code: 'marketing:campaign', name: '营销活动', module: 'marketing' },
  { code: 'marketing:rule', name: '营销规则', module: 'marketing' },
  { code: 'setting:read', name: '配置查看', module: 'setting' },
  { code: 'setting:write', name: '配置修改', module: 'setting' },
  { code: 'audit:read', name: '审计查看', module: 'audit' },
]

const BUILTIN_ROLES = [
  {
    name: 'SUPER_ADMIN',
    description: '超级管理员',
    isSystem: true,
    permissions: BUILTIN_PERMISSIONS.map((p) => p.code),
  },
  {
    name: 'ADMIN',
    description: '管理员',
    isSystem: true,
    permissions: BUILTIN_PERMISSIONS.map((p) => p.code),
  },
  {
    name: 'OPERATOR',
    description: '运营',
    isSystem: true,
    permissions: ['order:read', 'order:verify', 'user:read', 'user:edit', 'user:gift', 'marketing:campaign', 'marketing:rule'],
  },
  {
    name: 'FINANCE',
    description: '财务',
    isSystem: true,
    permissions: ['order:read', 'order:export', 'finance:read', 'finance:report', 'audit:read'],
  },
  {
    name: 'MANAGER',
    description: '店长',
    isSystem: true,
    permissions: ['order:read', 'order:verify', 'venue:read'],
  },
]

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

  console.log('[Seed] Seeding completed')
}
