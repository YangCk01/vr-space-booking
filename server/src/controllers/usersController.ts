import { Request, Response } from 'express'
import { param, body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'

export const updateValidators = [
  param('id').notEmpty().withMessage('ID 不能为空'),
  body('name').optional().notEmpty().withMessage('姓名不能为空'),
]

export async function list(req: Request, res: Response) {
  try {
    const level = req.query.level as string | undefined
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined
    const page = (req.query.page as string) || '1'
    const pageSize = (req.query.pageSize as string) || '20'
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = { role: 'CUSTOMER' }

    if (level && level !== 'all') {
      where.level = level.toUpperCase()
    }
    if (status && status !== 'all') {
      where.status = status.toUpperCase()
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // 查询列表、总数、各等级统计
    const [users, total, levelGroups] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          avatar: true,
          level: true,
          totalVisits: true,
          totalSpent: true,
          balance: true,
          principalBalance: true,
          bonusBalance: true,
          points: true,
          status: true,
          registerDate: true,
          lastLogin: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
      prisma.user.groupBy({
        by: ['level'],
        where: { role: 'CUSTOMER' },
        _count: { level: true },
      }),
    ])

    // 统计每个用户的真实消费金额和预约次数
    const enrichedUsers = await Promise.all(
      users.map(async (u) => {
        const [orderAgg, bookingCount] = await Promise.all([
          prisma.order.aggregate({
            where: {
              userId: u.id,
              status: { in: ['PAID', 'COMPLETED'] },
            },
            _sum: { amount: true },
          }),
          prisma.booking.count({ where: { userId: u.id, status: 'COMPLETED' } }),
        ])
        return {
          ...u,
          totalSpent: orderAgg._sum.amount || 0,
          totalVisits: bookingCount,
        }
      })
    )

    // 构建各等级数量映射（基于全部用户，不受当前筛选影响）
    const levelCounts: Record<string, number> = {}
    for (const g of levelGroups) {
      levelCounts[g.level.toLowerCase()] = g._count.level
    }

    const response: any = {
      success: true,
      data: enrichedUsers,
      message: 'success',
      meta: {
        page: pageNum,
        pageSize: sizeNum,
        total,
        totalPages: Math.ceil(total / sizeNum),
        levelCounts,
      },
    }
    return res.status(200).json(response)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        avatar: true,
        level: true,
        totalVisits: true,
        totalSpent: true,
        balance: true,
        principalBalance: true,
        bonusBalance: true,
        points: true,
        status: true,
        registerDate: true,
        lastLogin: true,
        createdAt: true,
        orders: { orderBy: { createdAt: 'desc' }, take: 10 },
        bookings: { orderBy: { date: 'desc' }, take: 10 },
      },
    })

    if (!user) {
      return error(res, '用户不存在', 404)
    }

    // 统计真实消费金额和预约次数
    const [orderAgg, bookingCount] = await Promise.all([
      prisma.order.aggregate({
        where: {
          userId: id,
          status: { in: ['PAID', 'COMPLETED'] },
        },
        _sum: { amount: true },
      }),
      prisma.booking.count({ where: { userId: id, status: 'COMPLETED' } }),
    ])

    const enrichedUser = {
      ...user,
      totalSpent: orderAgg._sum.amount || 0,
      totalVisits: bookingCount,
    }

    return success(res, enrichedUser)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const id = req.params.id
    const data: any = {}
    if (req.body.name) data.name = req.body.name
    if (req.body.email !== undefined) data.email = req.body.email || null
    if (req.body.level) data.level = req.body.level.toUpperCase()
    if (req.body.status) data.status = req.body.status.toUpperCase()
    if (req.body.totalVisits !== undefined) data.totalVisits = parseInt(req.body.totalVisits)
    if (req.body.totalSpent !== undefined) data.totalSpent = parseInt(req.body.totalSpent)

    const user = await prisma.user.update({
      where: { id: id as string },
      data,
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        avatar: true,
        level: true,
        totalVisits: true,
        totalSpent: true,
        status: true,
        registerDate: true,
        lastLogin: true,
        createdAt: true,
      },
    })

    return success(res, user, '用户更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function create(req: Request, res: Response) {
  try {
    const { phone, name, password, email, level, status } = req.body

    if (!phone || !name) {
      return error(res, '手机号和姓名不能为空', 400)
    }

    const existing = await prisma.user.findUnique({ where: { phone } })
    if (existing) {
      return error(res, '手机号已被注册', 409)
    }

    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash(password || '123456', 12)

    const user = await prisma.user.create({
      data: {
        phone,
        name,
        password: hashedPassword,
        email: email || null,
        level: level?.toUpperCase() || 'NORMAL',
        status: status?.toUpperCase() || 'ACTIVE',
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        avatar: true,
        level: true,
        totalVisits: true,
        totalSpent: true,
        status: true,
        registerDate: true,
        lastLogin: true,
        createdAt: true,
      },
    })

    return success(res, user, '用户创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    await prisma.user.delete({ where: { id } })
    return success(res, null, '用户删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function listStaff(req: Request, res: Response) {
  try {
    const search = req.query.search as string | undefined
    const status = req.query.status as string | undefined
    const role = req.query.role as string | undefined
    const page = (req.query.page as string) || '1'
    const pageSize = (req.query.pageSize as string) || '20'
    const pageNum = parseInt(page, 10)
    const sizeNum = parseInt(pageSize, 10)

    const where: any = {
      role: { not: 'CUSTOMER' },
    }

    if (status && status !== 'all') {
      where.status = status.toUpperCase()
    }
    if (role && role !== 'all') {
      where.role = role.toUpperCase()
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        orderBy: { createdAt: 'desc' },
        include: {
          managedVenues: {
            include: {
              venue: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    // 格式化 managedVenues 为 { id, name } 数组，便于前端直接使用
    const formattedUsers = users.map((u) => ({
      ...u,
      managedVenues: u.managedVenues?.map((mv) => ({
        id: mv.venue.id,
        name: mv.venue.name,
      })) || [],
    }))

    return paginated(res, formattedUsers, pageNum, sizeNum, total, '获取员工列表成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function createStaff(req: Request, res: Response) {
  try {
    const { phone, name, password, email, role, status, venueIds } = req.body

    if (!phone || !name || !role) {
      return error(res, '手机号、姓名和角色不能为空', 400)
    }

    const validRoles = ['OPERATOR', 'FINANCE', 'MANAGER']
    if (!validRoles.includes(role)) {
      return error(res, '无效的角色', 400)
    }

    if (role === 'MANAGER' && (!venueIds || !Array.isArray(venueIds) || venueIds.length === 0)) {
      return error(res, 'MANAGER角色必须关联至少一个场地', 400)
    }

    const existing = await prisma.user.findUnique({ where: { phone } })
    if (existing) {
      return error(res, '手机号已被注册', 409)
    }

    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash(password || '123456', 12)

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phone,
          name,
          password: hashedPassword,
          email: email || null,
          role,
          status: status?.toUpperCase() || 'ACTIVE',
        },
      })

      if (role === 'MANAGER' && venueIds && venueIds.length > 0) {
        await tx.venueManager.createMany({
          data: venueIds.map((venueId: string) => ({
            userId: newUser.id,
            venueId,
          })),
          skipDuplicates: true,
        })
      }

      return newUser
    })

    // 查询并格式化 managedVenues
    const userWithVenues = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        managedVenues: {
          include: {
            venue: { select: { id: true, name: true } },
          },
        },
      },
    })

    const formattedUser = {
      ...userWithVenues,
      managedVenues: userWithVenues?.managedVenues?.map((mv: any) => ({
        id: mv.venue.id,
        name: mv.venue.name,
      })) || [],
    }

    return success(res, formattedUser, '员工创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function updateStaff(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { name, phone, role, status, venueIds } = req.body

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return error(res, '员工不存在', 404)
    }

    if (user.role === 'SUPER_ADMIN') {
      return error(res, '不能修改超级管理员', 403)
    }

    const validRoles = ['OPERATOR', 'FINANCE', 'MANAGER']
    if (role !== undefined && !validRoles.includes(role)) {
      return error(res, '无效的角色', 400)
    }

    const data: any = {}
    if (name !== undefined) data.name = name
    if (phone !== undefined) data.phone = phone
    if (role !== undefined) data.role = role
    if (status !== undefined) data.status = status.toUpperCase()

    if (req.body.password) {
      const bcrypt = await import('bcryptjs')
      data.password = await bcrypt.default.hash(req.body.password, 12)
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (user.role === 'MANAGER' && role && role !== 'MANAGER') {
        await tx.venueManager.deleteMany({ where: { userId: id } })
      } else if (role === 'MANAGER' && user.role !== 'MANAGER') {
        if (!venueIds || !Array.isArray(venueIds) || venueIds.length === 0) {
          throw new Error('MANAGER角色必须关联至少一个场地')
        }
        await tx.venueManager.createMany({
          data: venueIds.map((venueId: string) => ({
            userId: id,
            venueId,
          })),
          skipDuplicates: true,
        })
      } else if (user.role === 'MANAGER' && role === 'MANAGER' && venueIds !== undefined) {
        await tx.venueManager.deleteMany({ where: { userId: id } })
        if (venueIds.length > 0) {
          await tx.venueManager.createMany({
            data: venueIds.map((venueId: string) => ({
              userId: id,
              venueId,
            })),
            skipDuplicates: true,
          })
        }
      }

      return tx.user.update({
        where: { id },
        data,
        include: {
          managedVenues: {
            include: {
              venue: {
                select: { id: true, name: true },
              },
            },
          },
        },
      })
    })

    // 格式化 managedVenues 为 { id, name } 数组
    const formattedUpdated = {
      ...updated,
      managedVenues: updated.managedVenues?.map((mv: any) => ({
        id: mv.venue.id,
        name: mv.venue.name,
      })) || [],
    }

    return success(res, formattedUpdated, '员工更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function deleteStaff(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return error(res, '员工不存在', 404)
    }

    if (user.role === 'SUPER_ADMIN') {
      return error(res, '不能删除超级管理员', 403)
    }

    await prisma.$transaction(async (tx) => {
      await tx.venueManager.deleteMany({ where: { userId: id } })
      await tx.user.delete({ where: { id } })
    })

    return success(res, null, '员工删除成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { password } = req.body

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return error(res, '员工不存在', 404)
    }

    if (user.role === 'CUSTOMER') {
      return error(res, '不能重置客户密码', 403)
    }

    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash(password || '123456', 12)

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    })

    return success(res, null, '密码重置成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function assignVenues(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { venueIds } = req.body

    if (!Array.isArray(venueIds)) {
      return error(res, 'venueIds必须是数组', 400)
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return error(res, '员工不存在', 404)
    }

    if (user.role !== 'MANAGER') {
      return error(res, '只有MANAGER角色可以分配场地', 400)
    }

    await prisma.$transaction(async (tx) => {
      await tx.venueManager.deleteMany({ where: { userId: id } })
      if (venueIds.length > 0) {
        await tx.venueManager.createMany({
          data: venueIds.map((venueId: string) => ({
            userId: id,
            venueId,
          })),
          skipDuplicates: true,
        })
      }
    })

    const updated = await prisma.user.findUnique({
      where: { id },
      include: {
        managedVenues: {
          include: {
            venue: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    return success(res, updated, '场地分配成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
