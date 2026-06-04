import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../utils/prisma'
import { UserRole } from '@prisma/client'
import { distributeAutoGifts } from './campaignRewardService'
import { handleEvent } from '../jobs/triggerJob'

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
  birthday?: string
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
  // 过滤掉旧格式权限（兜底保护，确保只返回 code 包含 : 的新格式权限）
  return Array.from(permissionSet).filter((p) => p.includes(':'))
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
      birthday: input.birthday ? new Date(input.birthday) : null,
    },
  })

  // 给新用户打上 NEW_CUSTOMER 标签（用于营销活动人群定向）
  try {
    await prisma.userTag.create({
      data: { userId: user.id, tag: 'NEW_CUSTOMER' },
    })
  } catch (e) {
    // 标签已存在，忽略错误
  }

  // 自动发放 AUTO_GIFT 活动奖励
  try {
    await distributeAutoGifts(user.id)
  } catch (e) {
    console.error('[AutoGift] 注册自动发放失败:', e)
  }

  // 触发条件规则（USER_REGISTERED 事件）
  try {
    await handleEvent('USER_REGISTERED', { userId: user.id })
  } catch (e) {
    console.error('[TriggerJob] 注册事件触发失败:', e)
  }

  // 重新查询用户以获取更新后的积分（如果有发放）
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })

  const tokens = await generateTokens(user.id, user.phone, user.role, user.name)

  return {
    user: {
      id: updatedUser!.id,
      phone: updatedUser!.phone,
      name: updatedUser!.name,
      role: updatedUser!.role,
      level: updatedUser!.level,
      principalBalance: updatedUser!.principalBalance,
      bonusBalance: updatedUser!.bonusBalance,
      balance: updatedUser!.principalBalance + updatedUser!.bonusBalance,
      points: updatedUser!.points,
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
      birthday: true,
      registerDate: true,
      lastLogin: true,
    },
  })

  if (!user) {
    throw new Error('用户不存在')
  }

  const permissions = await getUserPermissions(userId)

  // balance 为兼容字段，实时计算确保与 principalBalance + bonusBalance 一致
  const totalBalance = (user.principalBalance || 0) + (user.bonusBalance || 0)
  return { ...user, balance: totalBalance, permissions }
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

export async function updateProfile(userId: string, data: { name?: string; avatar?: string; email?: string; birthday?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new Error('用户不存在')
  }

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.avatar !== undefined) updateData.avatar = data.avatar
  if (data.email !== undefined) updateData.email = data.email
  if (data.birthday !== undefined) updateData.birthday = data.birthday ? new Date(data.birthday) : null

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
