import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { logAudit } from '../middleware/auditLog'

function formatRole(role: any) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: (role.permissions || []).map((rp: any) => rp.permission).filter(Boolean),
    userCount: role._count?.users ?? 0,
  }
}

export const createRoleValidators = [
  body('name').notEmpty().withMessage('角色名称不能为空'),
  body('permissionIds').optional().isArray().withMessage('权限ID必须为数组'),
]

export const updateRoleValidators = [
  body('name').optional().notEmpty().withMessage('角色名称不能为空'),
  body('permissionIds').optional().isArray().withMessage('权限ID必须为数组'),
]

export const updateRolePermissionsValidators = [
  body('permissionIds').isArray().withMessage('权限ID必须为数组'),
]

export const assignRoleValidators = [
  body('roleIds').isArray({ min: 1 }).withMessage('角色ID不能为空数组'),
]

async function validatePermissionIds(permissionIds: string[]) {
  const uniqueIds = Array.from(new Set(permissionIds))
  if (uniqueIds.length === 0) return uniqueIds

  const count = await prisma.permission.count({
    where: { id: { in: uniqueIds } },
  })

  if (count !== uniqueIds.length) {
    throw new Error('部分权限不存在')
  }

  return uniqueIds
}

export async function createRole(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const { name, description, permissionIds = [] } = req.body
    const pids = await validatePermissionIds(permissionIds)

    const existing = await prisma.role.findUnique({ where: { name } })
    if (existing) {
      return error(res, '角色名称已存在', 400)
    }

    const role = await prisma.role.create({
      data: {
        name,
        description,
        permissions: {
          create: pids.map((pid: string) => ({
            permission: { connect: { id: pid } },
          })),
        },
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    })

    await logAudit(req, {
      targetType: 'ROLE',
      targetId: role.id,
      targetDesc: `角色 ${role.name}`,
      action: 'POST',
      actionName: '创建角色',
      afterValue: {
        name: role.name,
        description: role.description,
        permissionIds: pids,
      },
      reason: '角色权限管理',
    })

    return success(res, formatRole(role), '角色创建成功', 201)
  } catch (err) {
    const message = (err as Error).message
    return error(res, message, message.includes('权限不存在') ? 400 : 500)
  }
}

export async function listRoles(req: AuthenticatedRequest, res: Response) {
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    })

    return success(res, roles.map(formatRole))
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function listPermissions(req: AuthenticatedRequest, res: Response) {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    })
    return success(res, permissions)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function updateRole(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const id = req.params.id as string
    const { name, description, permissionIds } = req.body
    const pids: string[] | undefined = permissionIds

    const existing = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    })
    if (!existing) {
      return error(res, '角色不存在', 404)
    }

    if (existing.isSystem) {
      return error(res, '系统内置角色不可编辑', 403)
    }

    if (name !== undefined) {
      const nameConflict = await prisma.role.findFirst({
        where: { name, id: { not: id } },
      })
      if (nameConflict) {
        return error(res, '角色名称已存在', 400)
      }
    }

    const data: any = {}
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description

    const normalizedPermissionIds = Array.isArray(pids) ? await validatePermissionIds(pids) : undefined

    await prisma.$transaction(async (tx) => {
      // Update role basic info
      const updated = await tx.role.update({
        where: { id },
        data,
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      })

      // Update permissions if provided
      if (Array.isArray(normalizedPermissionIds)) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } })
        if (normalizedPermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: normalizedPermissionIds.map((pid: string) => ({
              roleId: id,
              permissionId: pid,
            })),
            skipDuplicates: true,
          })
        }
      }

      return updated
    })

    // Re-fetch with updated permissions
    const refreshed = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    })

    await logAudit(req, {
      targetType: 'ROLE',
      targetId: id,
      targetDesc: `角色 ${refreshed?.name || existing.name}`,
      action: 'PUT',
      actionName: Array.isArray(normalizedPermissionIds) && name === undefined && description === undefined ? '更新角色权限' : '编辑角色',
      beforeValue: {
        name: existing.name,
        description: existing.description,
        permissionIds: existing.permissions.map((p) => p.permissionId),
      },
      afterValue: {
        name: refreshed?.name,
        description: refreshed?.description,
        permissionIds: refreshed?.permissions.map((p) => p.permissionId),
      },
      reason: '角色权限管理',
    })

    return success(res, refreshed ? formatRole(refreshed) : null, '角色更新成功')
  } catch (err) {
    const message = (err as Error).message
    return error(res, message, message.includes('权限不存在') ? 400 : 500)
  }
}

export async function deleteRole(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string

    const existing = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    })
    if (!existing) {
      return error(res, '角色不存在', 404)
    }

    if (existing.isSystem) {
      return error(res, '系统内置角色不可删除', 403)
    }

    if (existing._count.users > 0) {
      return error(res, `该角色已分配给 ${existing._count.users} 位用户，请先移除关联用户后再删除`, 400)
    }

    await prisma.role.delete({ where: { id } })

    await logAudit(req, {
      targetType: 'ROLE',
      targetId: id,
      targetDesc: `角色 ${existing.name}`,
      action: 'DELETE',
      actionName: '删除角色',
      beforeValue: {
        name: existing.name,
        description: existing.description,
        userCount: existing._count.users,
      },
      reason: '角色权限管理',
    })

    return success(res, null, '角色删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function assignRolesToUser(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg, 400)
  }

  try {
    const userId = req.params.id as string
    const { roleIds } = req.body as { roleIds: string[] }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return error(res, '用户不存在', 404)
    }

    // Verify all roleIds exist
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
    })
    if (roles.length !== (roleIds as string[]).length) {
      return error(res, '部分角色不存在', 400)
    }
    if (roles.some((role) => role.name === 'SUPER_ADMIN') && req.user?.role !== 'SUPER_ADMIN') {
      return error(res, '只有主账号可以分配主账号角色', 403)
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          set: roleIds.map((id: string) => ({ id })),
        },
      },
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

    return success(res, { userId, roleIds }, '角色分配成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getUserRoles(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.params.id as string

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

    if (!user) {
      return error(res, '用户不存在', 404)
    }

    return success(res, user.roles)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
