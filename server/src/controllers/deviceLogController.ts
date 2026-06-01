import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { createDeviceSessionLogs } from '../services/deviceLogService'

/**
 * 查询设备日志列表
 * GET /device-logs
 */
export async function listDeviceLogs(req: AuthenticatedRequest, res: Response) {
  try {
    const { venueId, date, page = '1', pageSize = '20' } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}
    if (venueId) where.venueId = venueId as string
    if (date) {
      const d = new Date(date as string)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      where.sessionStartAt = { gte: d, lt: next }
    }

    const total = await prisma.deviceSessionLog.count({ where })
    const logs = await prisma.deviceSessionLog.findMany({
      where,
      include: { venue: { select: { name: true } } },
      orderBy: { sessionStartAt: 'desc' },
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
    })

    return paginated(res, logs, total, pageNum, sizeNum)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 创建单条设备日志
 * POST /device-logs
 */
export async function createDeviceLog(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      venueId,
      deviceId,
      appPackageName,
      appName,
      sessionStartAt,
      sessionEndAt,
      sessionDurationSec,
      isCompleted,
      isTestSession,
      playerCount,
      rawLog,
    } = req.body

    if (!venueId || !deviceId || !sessionStartAt) {
      return error(res, '缺少必填字段: venueId, deviceId, sessionStartAt', 400)
    }

    const log = await prisma.deviceSessionLog.create({
      data: {
        venueId,
        deviceId,
        appPackageName: appPackageName || 'unknown',
        appName: appName || null,
        sessionStartAt: new Date(sessionStartAt),
        sessionEndAt: sessionEndAt ? new Date(sessionEndAt) : null,
        sessionDurationSec: sessionDurationSec || 0,
        isCompleted: isCompleted ?? false,
        isTestSession: isTestSession ?? false,
        playerCount: playerCount || 1,
        rawLog: rawLog || null,
      },
    })

    return success(res, log, '设备日志已创建')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 批量导入设备日志
 * POST /device-logs/batch
 */
export async function batchCreateDeviceLogs(req: AuthenticatedRequest, res: Response) {
  try {
    const { venueId, logs } = req.body
    if (!venueId || !Array.isArray(logs) || logs.length === 0) {
      return error(res, '缺少必填字段: venueId, logs（数组）', 400)
    }

    const count = await createDeviceSessionLogs(
      venueId,
      logs.map((log: any) => ({
        deviceId: log.deviceId,
        appPackageName: log.appPackageName || 'unknown',
        sessionStartAt: new Date(log.sessionStartAt),
        sessionEndAt: log.sessionEndAt ? new Date(log.sessionEndAt) : undefined,
        sessionDurationSec: log.sessionDurationSec || 0,
        isCompleted: log.isCompleted ?? true,
        playerCount: log.playerCount || 1,
      }))
    )

    return success(res, { imported: count }, `成功导入 ${count} 条设备日志`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 删除设备日志
 * DELETE /device-logs/:id
 */
export async function deleteDeviceLog(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    await prisma.deviceSessionLog.delete({ where: { id } })
    return success(res, null, '已删除')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取硬件对账统计（某门店某日期）
 * GET /device-logs/stats
 */
export async function getDeviceLogStats(req: AuthenticatedRequest, res: Response) {
  try {
    const { venueId, date } = req.query
    if (!venueId || !date) {
      return error(res, '缺少 venueId 或 date', 400)
    }

    const { getHardwarePlayerCount, getSystemPlayerCount } = await import('../services/deviceLogService')

    const [thresholdCfg, testStartCfg, testEndCfg] = await Promise.all([
      prisma.reconConfig.findUnique({ where: { key: 'HARDWARE_MISMATCH_THRESHOLD' } }),
      prisma.reconConfig.findUnique({ where: { key: 'HARDWARE_TEST_START' } }),
      prisma.reconConfig.findUnique({ where: { key: 'HARDWARE_TEST_END' } }),
    ])

    const threshold = parseFloat(thresholdCfg?.value || '0.05')
    const testStart = testStartCfg?.value || '09:00'
    const testEnd = testEndCfg?.value || '10:00'

    const [hardwareCount, systemCount] = await Promise.all([
      getHardwarePlayerCount(venueId as string, date as string, testStart, testEnd),
      getSystemPlayerCount(venueId as string, date as string),
    ])

    const diffRate = hardwareCount > 0 ? (systemCount - hardwareCount) / hardwareCount : 0
    const isMismatch = hardwareCount > 0 && Math.abs(diffRate) > threshold

    return success(res, {
      venueId,
      date,
      hardwareCount,
      systemCount,
      diffRate: Math.round(diffRate * 10000) / 10000,
      diffRatePercent: `${(diffRate * 100).toFixed(1)}%`,
      threshold,
      isMismatch,
      testStart,
      testEnd,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
