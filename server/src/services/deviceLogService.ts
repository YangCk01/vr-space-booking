/**
 * 头显设备日志拉取服务
 * Phase 4: 硬件对账核心服务
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface DeviceLogItem {
  deviceId: string
  appPackageName: string
  sessionStartAt: Date
  sessionEndAt: Date
  sessionDurationSec: number
  isCompleted: boolean
  playerCount: number
}

/**
 * 拉取门店头显设备运行日志
 * @param venueId 门店ID
 * @param date YYYY-MM-DD
 * @returns 设备运行日志列表
 *
 * TODO: Phase 4 接入 PICO 企业版 MDM 或自定义日志采集
 * 方案 A: PICO 企业 MDM API 获取应用使用统计
 * 方案 B: 门店局域网内的日志采集服务，通过 MQTT/HTTP 上报到总部
 * 方案 C: 头显端 SDK 埋点，游戏退出时上报 session 数据
 */
export async function fetchDeviceLogs(
  venueId: string,
  date: string
): Promise<DeviceLogItem[]> {
  console.warn(`[DeviceLog] 头显日志拉取未实现，门店: ${venueId}, 日期: ${date}`)
  return []
}

/**
 * 将设备日志写入 DeviceSessionLog 表
 */
export async function saveDeviceLogs(
  items: DeviceLogItem[]
): Promise<number> {
  if (items.length === 0) return 0
  const result = await prisma.deviceSessionLog.createMany({
    data: items.map((item) => ({
      deviceId: item.deviceId,
      venueId: '', // TODO: 需要 venueId 映射
      appPackageName: item.appPackageName,
      sessionStartAt: item.sessionStartAt,
      sessionEndAt: item.sessionEndAt,
      sessionDurationSec: item.sessionDurationSec,
      isCompleted: item.isCompleted,
      playerCount: item.playerCount,
    })),
    skipDuplicates: false,
  })
  return result.count
}

export interface DeviceLogCreateInput {
  deviceId: string
  appPackageName: string
  sessionStartAt: Date
  sessionEndAt?: Date
  sessionDurationSec: number
  isCompleted: boolean
  playerCount: number
}

/**
 * 批量创建设备日志（带门店ID）
 */
export async function createDeviceSessionLogs(
  venueId: string,
  items: DeviceLogCreateInput[]
): Promise<number> {
  if (items.length === 0) return 0
  const result = await prisma.deviceSessionLog.createMany({
    data: items.map((item) => ({
      deviceId: item.deviceId,
      venueId,
      appPackageName: item.appPackageName,
      appName: null,
      sessionStartAt: item.sessionStartAt,
      sessionEndAt: item.sessionEndAt || null,
      sessionDurationSec: item.sessionDurationSec,
      isCompleted: item.isCompleted,
      isTestSession: false,
      playerCount: item.playerCount,
      rawLog: null,
    })),
  })
  return result.count
}

/**
 * 获取指定日期和门店的硬件播控人次（排除测试时段）
 * @param venueId 门店ID
 * @param date YYYY-MM-DD
 * @param testStart 测试时段开始（如 "09:00"）
 * @param testEnd 测试时段结束（如 "10:00"）
 */
export async function getHardwarePlayerCount(
  venueId: string,
  date: string,
  testStart: string = '09:00',
  testEnd: string = '10:00'
): Promise<number> {
  // 使用 UTC 构造日期，避免服务器时区影响
  const [year, month, day] = date.split('-').map(Number)
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))

  // 解析测试时段（也使用 UTC 构造用于比较）
  const [testStartHour, testStartMin] = testStart.split(':').map(Number)
  const [testEndHour, testEndMin] = testEnd.split(':').map(Number)
  const testStartTime = new Date(Date.UTC(year, month - 1, day, testStartHour, testStartMin, 0))
  const testEndTime = new Date(Date.UTC(year, month - 1, day, testEndHour, testEndMin, 0))

  // 先查出该门店该日期的所有已完成日志
  const logs = await prisma.deviceSessionLog.findMany({
    where: {
      venueId,
      sessionStartAt: { gte: dayStart, lte: dayEnd },
      isCompleted: true,
    },
    select: {
      sessionStartAt: true,
      playerCount: true,
    },
  })

  // 排除测试时段内的记录
  let total = 0
  for (const log of logs) {
    const start = new Date(log.sessionStartAt)
    // 如果 sessionStartAt 在测试时段内，跳过
    if (start >= testStartTime && start <= testEndTime) {
      continue
    }
    total += log.playerCount || 1
  }

  return total
}

/**
 * 获取指定日期和门店的系统确权人次（Booking COMPLETED）
 */
export async function getSystemPlayerCount(
  venueId: string,
  date: string
): Promise<number> {
  // 使用 UTC 构造日期范围，避免服务器时区影响
  const [year, month, day] = date.split('-').map(Number)
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))

  const agg = await prisma.booking.aggregate({
    where: {
      venueId,
      date: { gte: dayStart, lte: dayEnd },
      status: 'COMPLETED',
    },
    _sum: { personCount: true },
  })

  return agg._sum?.personCount || 0
}
