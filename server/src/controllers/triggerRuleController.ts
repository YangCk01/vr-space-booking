import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'

/* ─── 1. 创建规则 ─── */
export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, event, conditions, actions, runOnce } = req.body
    if (!name || !event) {
      return error(res, '规则名称和触发事件必填', 400)
    }
    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return error(res, '请至少配置一个动作', 400)
    }

    const rule = await prisma.triggerRule.create({
      data: {
        name,
        event,
        conditions: conditions || {},
        actions,
        runOnce: runOnce !== false,
      },
    })

    return success(res, rule, '规则创建成功', 201)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 2. 规则列表 ─── */
export async function list(req: Request, res: Response) {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const eventFilter = req.query.event as string | undefined

    const where: any = {}
    if (eventFilter) where.event = eventFilter

    const [rules, total] = await Promise.all([
      prisma.triggerRule.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.triggerRule.count({ where }),
    ])

    return paginated(res, rules, page, pageSize, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 3. 编辑规则 ─── */
export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { name, event, conditions, actions, runOnce } = req.body

    const rule = await prisma.triggerRule.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(event && { event }),
        ...(conditions !== undefined && { conditions }),
        ...(actions !== undefined && { actions }),
        ...(runOnce !== undefined && { runOnce }),
      },
    })

    return success(res, rule, '规则更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 4. 删除规则 ─── */
export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    await prisma.triggerRule.delete({ where: { id } })
    return success(res, null, '规则已删除')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── 5. 开启/关闭 ─── */
export async function toggle(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const rule = await prisma.triggerRule.findUnique({ where: { id } })
    if (!rule) return error(res, '规则不存在', 404)

    const updated = await prisma.triggerRule.update({
      where: { id },
      data: { enabled: !rule.enabled },
    })

    return success(res, updated, updated.enabled ? '规则已开启' : '规则已关闭')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
