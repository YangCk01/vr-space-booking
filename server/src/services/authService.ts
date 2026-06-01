import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../utils/prisma'
import { UserRole } from '@prisma/client'

const JWT_SECRET = process.env.JWT_SECRET || 'vr-space-secret-key-change-in-production'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'vr-space-refresh-secret-key-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'

export interface LoginInput {
  phone: string
  password: string
}

export interface RegisterInput {
  phone: string
  password: string
  name: string
  role?: UserRole
}

async function getUserPermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  })

  if (!user) return []

  const permissionSet = new Set<string>()
  for (const role of user.roles) {
    for (const rp of role.permissions) {
      if (rp.permission?.code) {
        permissionSet.add(rp.permission.code)
      }
    }
  }
  return Array.from(permissionSet)
}

async function generateTokens(userId: string, phone: string, role: UserRole, name: string, managedVenueIds?: string[]) {
  const permissions = await getUserPermissions(userId)
  const payload: any = { userId, phone, role, name, permissions }
  if (managedVenueIds && managedVenueIds.length > 0) {
    payload.managedVenueIds = managedVenueIds
  }
  const accessToken = jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  )
  const refreshToken = jwt.sign(
    payload,
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  )
  return { accessToken, refreshToken, permissions }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { phone: input.phone },
  })

  if (!user) {
    throw new Error('用户不存在')
  }

  const isValid = await bcrypt.compare(input.password, user.password)
  if (!isValid) {
    throw new Error('密码错误')
  }

  // 更新最后登录时间
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  })

  // 查询店长分配的场地
  let managedVenueIds: string[] | undefined
  if (user.role === 'MANAGER') {
    const vms = await prisma.venueManager.findMany({
      where: { userId: user.id },
      select: { venueId: true },
    })
    managedVenueIds = vms.map((v) => v.venueId)
  }

  const tokens = await generateTokens(user.id, user.phone, user.role, user.name, managedVenueIds)

  return {
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      level: user.level,
      principalBalance: user.principalBalance,
      bonusBalance: user.bonusBalance,
      balance: user.principalBalance + user.bonusBalance, // 兼容旧前端
      points: user.points,
      managedVenueIds,
      permissions: tokens.permissions,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  }
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { phone: input.phone },
  })

  if (existing) {
    throw new Error('手机号已被注册')
  }

  const hashedPassword = await bcrypt.hash(input.password, 12)

  const user = await prisma.user.create({
    data: {
      phone: input.phone,
      password: hashedPassword,
      name: input.name,
      role: input.role || UserRole.CUSTOMER,
    },
  })

  const tokens = await generateTokens(user.id, user.phone, user.role, user.name)

  return {
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      level: user.level,
      principalBalance: user.principalBalance,
      bonusBalance: user.bonusBalance,
      balance: user.principalBalance + user.bonusBalance,
      points: user.points,
      permissions: tokens.permissions,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  }
}

export async function refreshToken(refreshToken: string) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as {
      userId: string
      phone: string
      role: UserRole
      name: string
      managedVenueIds?: string[]
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user || user.status !== 'ACTIVE') {
      throw new Error('用户不存在或已被禁用')
    }

    let managedVenueIds = decoded.managedVenueIds
    if (user.role === 'MANAGER') {
      const vms = await prisma.venueManager.findMany({
        where: { userId: user.id },
        select: { venueId: true },
      })
      managedVenueIds = vms.map((v) => v.venueId)
    }

    const tokens = await generateTokens(user.id, user.phone, user.role, user.name, managedVenueIds)
    return tokens
  } catch {
    throw new Error('刷新令牌无效或已过期')
  }
}

// 默认角色权限配置（与前端硬编码保持一致）
const defaultRolePermissions: Record<string, string[]> = {
  SUPER_ADMIN: ['home','venues','games','booking','orders','users','analytics','finance','accounts','member-marketing','settings'],
  ADMIN:       ['home','venues','games','booking','orders','users','analytics','finance','accounts','member-marketing','settings'],
  OPERATOR:    ['home','venues','booking','orders','users','member-marketing'],
  FINANCE:     ['home','orders','analytics','finance'],
  MANAGER:     ['home','venues','booking','orders'],
}

async function getRolePermissions(): Promise<Record<string, string[]>> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'role_permissions' } })
  let saved: Record<string, string[]> = {}
  if (setting?.value) {
    const raw = setting.value as any
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) saved = raw
  }
  // 合并：以数据库保存的为基础，补全新增的默认权限 key（向后兼容）
  const merged: Record<string, string[]> = {}
  for (const role of Object.keys(defaultRolePermissions)) {
    const savedPerms = saved[role] || []
    const defaultPerms = defaultRolePermissions[role]
    // 保留用户自定义关闭的权限（saved 中有的），同时补充新增默认权限
    merged[role] = Array.from(new Set([...savedPerms, ...defaultPerms]))
  }
  // 保留数据库中有但默认配置中没有的角色
  for (const role of Object.keys(saved)) {
    if (!merged[role]) merged[role] = saved[role]
  }
  return merged
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      level: true,
      status: true,
      totalVisits: true,
      totalSpent: true,
      principalBalance: true,
      bonusBalance: true,
      balance: true,       // 兼容旧前端
      points: true,
      registerDate: true,
      lastLogin: true,
    },
  })

  if (!user) {
    throw new Error('用户不存在')
  }

  const rolePermissions = await getRolePermissions()
  const permissions = rolePermissions[user.role] || defaultRolePermissions[user.role] || []

  return { ...user, permissions }
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new Error('用户不存在')
  }

  const isValid = await bcrypt.compare(oldPassword, user.password)
  if (!isValid) {
    throw new Error('原密码错误')
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  })
}

export async function updateProfile(userId: string, data: { name?: string; avatar?: string; email?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new Error('用户不存在')
  }

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.avatar !== undefined) updateData.avatar = data.avatar
  if (data.email !== undefined) updateData.email = data.email

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true, phone: true, name: true, email: true, avatar: true,
      role: true, level: true,
      principalBalance: true, bonusBalance: true, balance: true, points: true,
    },
  })

  return updated
}

export async function updatePhone(userId: string, newPhone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new Error('用户不存在')
  }

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) {
    throw new Error('密码错误')
  }

  if (newPhone === user.phone) {
    throw new Error('新手机号与当前手机号相同')
  }

  const existing = await prisma.user.findUnique({ where: { phone: newPhone } })
  if (existing) {
    throw new Error('该手机号已被其他账号绑定')
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { phone: newPhone },
    select: {
      id: true, phone: true, name: true, email: true, avatar: true,
      role: true, level: true,
      principalBalance: true, bonusBalance: true, balance: true, points: true,
    },
  })

  return updated
}
