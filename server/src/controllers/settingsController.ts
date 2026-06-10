import { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { success, error } from '../utils/response'
import { getMemberLevels, getPointsConfig } from '../utils/memberConfig'
import { getConfig } from '../services/configService'

interface RefundTier {
  hours: number
  rate: number
  label: string
}

/** 公开接口：返回会员相关配置（供C端使用） */
export async function memberPublic(req: Request, res: Response) {
  try {
    const [levels, points] = await Promise.all([
      getMemberLevels(),
      getPointsConfig(),
    ])
    return success(res, { levels, points })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 公开接口：返回退款阶梯规则（供C端订单页展示） */
export async function refundRules(req: Request, res: Response) {
  try {
    const [tierSetting, cancelSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'booking_refund_tiers' } }),
      prisma.systemSetting.findUnique({ where: { key: 'booking_cancel_hours' } }),
    ])
    const tierRaw = tierSetting?.value as any
    const cancelRaw = cancelSetting?.value as any
    const raw = (typeof tierRaw === 'object' && tierRaw !== null && 'value' in tierRaw ? tierRaw.value : tierRaw) as RefundTier[] | undefined
    const cancelHours = (typeof cancelRaw === 'object' && cancelRaw !== null && 'value' in cancelRaw ? cancelRaw.value : cancelRaw) ?? 2
    const tiers: RefundTier[] = raw && Array.isArray(raw) && raw.length > 0
      ? raw
      : [
          { hours: 24, rate: 100, label: '开场24小时前' },
          { hours: 2, rate: 50, label: '开场2-24小时' },
        ]
    return success(res, { tiers, cancelHours })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 公开接口：返回预约相关配置（供C端使用） */
export async function bookingConfig(req: Request, res: Response) {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'booking_advance_days' } })
    const raw = setting?.value as any
    // 兼容两种格式：直接存储的数字，或 { value: number } 对象
    const advanceDays = typeof raw === 'number' ? raw : (raw?.value as number) ?? 7
    return success(res, { advanceDays })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 公开接口：返回预约生命周期配置（供C端使用） */
export async function bookingLifecycle(req: Request, res: Response) {
  try {
    const keys = [
      'verify_advance_minutes',
      'late_buffer_minutes',
      'no_show_deadline_minutes',
      'no_show_penalty_rate',
      'reschedule_fee_rate',
      'reschedule_deadline_hours',
      'reschedule_max_count',
      'reschedule_allow_after_start',
      'reschedule_after_start_minutes',
    ]
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    })
    const map: Record<string, any> = {}
    for (const s of settings) {
      const raw = s.value as any
      map[s.key] = raw?.value ?? raw
    }
    return success(res, {
      verifyAdvanceMinutes: map.verify_advance_minutes ?? 15,
      lateBufferMinutes: map.late_buffer_minutes ?? 10,
      noShowDeadlineMinutes: map.no_show_deadline_minutes ?? 15,
      noShowPenaltyRate: map.no_show_penalty_rate ?? 100,
      rescheduleFeeRate: map.reschedule_fee_rate ?? 10,
      rescheduleDeadlineHours: map.reschedule_deadline_hours ?? 2,
      rescheduleMaxCount: map.reschedule_max_count ?? 1,
      rescheduleAllowAfterStart: map.reschedule_allow_after_start ?? true,
      rescheduleAfterStartMinutes: map.reschedule_after_start_minutes ?? 15,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function list(req: Request, res: Response) {
  try {
    const category = req.query.category as string | undefined
    const where: any = {}
    if (category) where.category = category

    const settings = await prisma.systemSetting.findMany({
      where,
      orderBy: { key: 'asc' },
    })

    const result: Record<string, any> = {}
    for (const s of settings) {
      const raw = s.value as any
      // 兼容：如果 value 是原始值，包装为 { value: raw } 以便前端统一读取
      if (raw !== null && typeof raw === 'object' && 'value' in raw) {
        result[s.key] = raw
      } else {
        result[s.key] = { value: raw }
      }
    }

    return success(res, result)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getByKey(req: Request, res: Response) {
  try {
    const key = req.params.key as string
    const setting = await prisma.systemSetting.findUnique({ where: { key } })

    if (!setting) {
      return error(res, '设置项不存在', 404)
    }

    return success(res, setting.value)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  try {
    const { key, value, category } = req.body

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value, category: category || 'general' },
      create: { key, value, category: category || 'general' },
    })

    return success(res, setting, '设置保存成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function bulkUpdate(req: Request, res: Response) {
  try {
    const settings = req.body as Array<{ key: string; value: any; category?: string }>

    for (const s of settings) {
      await prisma.systemSetting.upsert({
        where: { key: s.key },
        update: { value: s.value, category: s.category || 'general' },
        create: { key: s.key, value: s.value, category: s.category || 'general' },
      })
    }

    return success(res, null, '设置批量保存成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
