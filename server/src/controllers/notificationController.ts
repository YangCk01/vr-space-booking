import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, paginated, error } from '../utils/response'

/* ─── Helper: create notification if scene enabled ─── */
export async function pushNotification(
  userId: string,
  type: string,
  title: string,
  content: string
) {
  try {
    // Check if the scene is enabled in settings
    const sceneKey = mapTypeToSceneKey(type)
    if (sceneKey) {
      const setting = await prisma.systemSetting.findUnique({ where: { key: sceneKey } })
      const raw = setting?.value
      const enabled = raw !== null && typeof raw === 'object' && 'value' in raw ? (raw as any).value : (raw ?? true)
      if (!enabled) return // scene disabled, skip
    }

    await prisma.notification.create({
      data: { userId, type, title, content },
    })
  } catch {
    // fail silently so business logic isn't blocked
  }
}

function mapTypeToSceneKey(type: string): string | null {
  const map: Record<string, string> = {
    BOOKING_SUCCESS: 'scene_booking_success',
    BOOKING_REMIND: 'scene_booking_remind',
    BOOKING_VERIFY: 'scene_booking_remind',
    BOOKING_URGENT: 'scene_booking_remind',
    BOOKING_CANCEL: 'scene_booking_cancel',
    PAY_SUCCESS: 'scene_pay_success',
    MARKETING: 'scene_marketing',
    POINTS_GIFT: 'scene_points_gift',
    COUPON_GIFT: 'scene_coupon_gift',
    NO_SHOW: 'scene_no_show',
    ADMIN_PRODUCT_SOLD: 'scene_admin_product_sold',
    ADMIN_LOW_STOCK: 'scene_admin_low_stock',
    ADMIN_NEW_ORDER: 'scene_admin_new_order',
    ADMIN_REFUND_REQUEST: 'scene_admin_refund_request',
  }
  return map[type] || null
}

/* ─── Helper: push notification to all admins ─── */
export async function pushAdminNotification(
  type: string,
  title: string,
  content: string
) {
  try {
    const sceneKey = mapTypeToSceneKey(type)
    if (sceneKey) {
      const setting = await prisma.systemSetting.findUnique({ where: { key: sceneKey } })
      const raw = setting?.value
      const enabled = raw !== null && typeof raw === 'object' && 'value' in raw ? (raw as any).value : (raw ?? true)
      if (!enabled) return
    }

    const admins = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'] } },
      select: { id: true },
    })

    await Promise.all(
      admins.map((admin) =>
        prisma.notification.create({
          data: { userId: admin.id, type, title, content },
        })
      )
    )
  } catch {
    // fail silently
  }
}

function isAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.role !== 'CUSTOMER'
}

/* ─── List notifications ─── */
export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) return error(res, '未登录', 401)

    const page = parseInt((req.query.page as string) || '1', 10)
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10)
    const unreadOnly = req.query.unreadOnly === 'true'
    const admin = isAdmin(req)

    const where: any = admin ? {} : { userId }
    if (unreadOnly) where.read = false

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: admin
          ? { user: { select: { name: true, phone: true } } }
          : undefined,
      }),
      prisma.notification.count({ where }),
    ])

    return paginated(res, data, page, pageSize, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Mark as read ─── */
export async function markRead(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) return error(res, '未登录', 401)

    const { id } = req.params
    const admin = isAdmin(req)

    if (id === 'all') {
      await prisma.notification.updateMany({
        where: admin ? { read: false } : { userId, read: false },
        data: { read: true },
      })
      return success(res, null, '全部已读')
    }

    await prisma.notification.updateMany({
      where: admin ? { id: id as string } : { id: id as string, userId },
      data: { read: true },
    })
    return success(res, null, '已标记为已读')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Clear all notifications ─── */
export async function clearAll(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) return error(res, '未登录', 401)

    const admin = isAdmin(req)
    await prisma.notification.deleteMany({
      where: admin ? {} : { userId },
    })
    return success(res, null, '通知已清空')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/* ─── Unread count ─── */
export async function unreadCount(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) return error(res, '未登录', 401)

    const admin = isAdmin(req)
    const count = await prisma.notification.count({
      where: admin ? { read: false } : { userId, read: false },
    })
    return success(res, { count })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
