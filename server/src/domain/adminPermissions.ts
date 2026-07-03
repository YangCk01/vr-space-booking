export type BuiltinRoleName = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'FINANCE' | 'MANAGER'

export type BuiltinPermission = {
  code: string
  name: string
  module: string
}

export type BuiltinRole = {
  name: BuiltinRoleName
  description: string
  isSystem: true
  permissions: string[]
}

export const BUILTIN_PERMISSIONS: BuiltinPermission[] = [
  { code: 'order:read', name: '订单查看', module: 'order' },
  { code: 'order:refund', name: '订单退款', module: 'order' },
  { code: 'order:verify', name: '订单核销', module: 'order' },
  { code: 'order:export', name: '订单导出', module: 'order' },
  { code: 'order:reschedule', name: '订单改签', module: 'order' },
  { code: 'booking:read', name: '排场查看', module: 'booking' },
  { code: 'booking:manage', name: '排场管理', module: 'booking' },
  { code: 'approval:request', name: '审批发起', module: 'approval' },
  { code: 'approval:approve', name: '审批处理', module: 'approval' },
  { code: 'approval:read', name: '审批查看', module: 'approval' },
  { code: 'finance:read', name: '财务查看', module: 'finance' },
  { code: 'finance:adjust', name: '财务调整', module: 'finance' },
  { code: 'finance:report', name: '财务报表', module: 'finance' },
  { code: 'finance:reconcile', name: '财务对账', module: 'finance' },
  { code: 'user:read', name: '会员查看', module: 'user' },
  { code: 'user:edit', name: '会员编辑', module: 'user' },
  { code: 'user:gift', name: '会员赠送', module: 'user' },
  { code: 'user:export', name: '会员导出', module: 'user' },
  { code: 'member:marketing', name: '会员营销配置', module: 'member' },
  { code: 'points:mall', name: '积分商城管理', module: 'points' },
  { code: 'recharge:staff', name: '员工代充值', module: 'recharge' },
  { code: 'account:read', name: '账号查看', module: 'account' },
  { code: 'account:manage', name: '账号管理', module: 'account' },
  { code: 'role:read', name: '角色查看', module: 'role' },
  { code: 'role:manage', name: '角色管理', module: 'role' },
  { code: 'venue:read', name: '场地查看', module: 'venue' },
  { code: 'venue:manage', name: '场地管理', module: 'venue' },
  { code: 'venue:maintenance', name: '场地维护', module: 'venue' },
  { code: 'content:read', name: '内容查看', module: 'content' },
  { code: 'content:manage', name: '内容管理', module: 'content' },
  { code: 'group-buy:read', name: '团购查看', module: 'group-buy' },
  { code: 'group-buy:manage', name: '团购管理', module: 'group-buy' },
  { code: 'marketing:campaign', name: '营销活动管理', module: 'marketing' },
  { code: 'marketing:rule', name: '营销规则管理', module: 'marketing' },
  { code: 'setting:read', name: '配置查看', module: 'setting' },
  { code: 'setting:write', name: '配置修改', module: 'setting' },
  { code: 'audit:read', name: '审计查看', module: 'audit' },
  { code: 'upload:content', name: '内容上传', module: 'upload' },
  { code: 'monitor:read', name: '实时监控查看', module: 'monitor' },
]

const allPermissionCodes = BUILTIN_PERMISSIONS.map((p) => p.code)

export const BUILTIN_ROLES: BuiltinRole[] = [
  {
    name: 'SUPER_ADMIN',
    description: '超级管理员',
    isSystem: true,
    permissions: allPermissionCodes,
  },
  {
    name: 'ADMIN',
    description: '管理员',
    isSystem: true,
    permissions: allPermissionCodes,
  },
  {
    name: 'OPERATOR',
    description: '运营',
    isSystem: true,
    permissions: [
      'order:read',
      'order:verify',
      'order:reschedule',
      'booking:read',
      'booking:manage',
      'approval:request',
      'user:read',
      'user:edit',
      'user:gift',
      'member:marketing',
      'points:mall',
      'recharge:staff',
      'venue:read',
      'content:read',
      'content:manage',
      'group-buy:read',
      'group-buy:manage',
      'marketing:campaign',
      'marketing:rule',
      'upload:content',
    ],
  },
  {
    name: 'FINANCE',
    description: '财务',
    isSystem: true,
    permissions: [
      'order:read',
      'order:export',
      'approval:read',
      'approval:approve',
      'finance:read',
      'finance:report',
      'finance:reconcile',
      'audit:read',
    ],
  },
  {
    name: 'MANAGER',
    description: '店长',
    isSystem: true,
    permissions: [
      'order:read',
      'order:verify',
      'order:reschedule',
      'booking:read',
      'approval:read',
      'approval:request',
      'approval:approve',
      'venue:read',
      'venue:maintenance',
      'content:read',
      'group-buy:read',
    ],
  },
]

const uploadPermissionMap: Record<string, string[]> = {
  venues: ['venue:manage'],
  logos: ['setting:write'],
  avatars: ['user:edit'],
  games: ['content:manage'],
  products: ['points:mall'],
  pages: ['content:manage'],
  'group-buys': ['group-buy:manage'],
}

export function isRoleGranted(roleName: string, permissionCode: string) {
  const role = BUILTIN_ROLES.find((item) => item.name === roleName)
  return role?.permissions.includes(permissionCode) ?? false
}

export function getRequiredUploadPermissions(type: string) {
  return uploadPermissionMap[type] || []
}
