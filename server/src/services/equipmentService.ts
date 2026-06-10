import { prisma } from '../utils/prisma'

/**
 * 为预约自动分配设备
 * 优先分配 HEADSET（头戴设备），每人 1 台
 */
export async function assignEquipment(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { venue: true },
  })
  if (!booking) throw new Error('预约不存在')
  if (!booking.venueId) throw new Error('预约未关联场地')

  // 1. 查询该场地所有 NORMAL 状态的设备
  const allDevices = await prisma.equipment.findMany({
    where: { venueId: booking.venueId, status: 'NORMAL' },
  })

  // 2. 过滤掉已被其他未完成的 booking 占用的设备
  const occupied = await prisma.bookingEquipment.findMany({
    where: {
      releasedAt: null,
      booking: { status: { in: ['CHECKED_IN', 'PLAYING'] } },
    },
    select: { equipmentId: true },
  })
  const occupiedIds = new Set(occupied.map((o) => o.equipmentId))
  const available = allDevices.filter((d) => !occupiedIds.has(d.id))

  // 3. 优先分配头戴设备（HEADSET）
  const headsets = available.filter((d) => d.type === 'HEADSET')
  const needed = booking.personCount || 1

  if (headsets.length < needed) {
    throw new Error(
      `场地可用头戴设备不足，需要${needed}台，仅剩${headsets.length}台`
    )
  }

  const selected = headsets.slice(0, needed)

  // 4. 创建关联记录
  await prisma.bookingEquipment.createMany({
    data: selected.map((d) => ({
      bookingId: booking.id,
      equipmentId: d.id,
    })),
  })

  return selected
}

/**
 * 释放预约分配的设备
 */
export async function releaseEquipment(bookingId: string) {
  await prisma.bookingEquipment.updateMany({
    where: { bookingId, releasedAt: null },
    data: { releasedAt: new Date() },
  })
}

/**
 * 查询预约已分配的设备
 */
export async function getAssignedEquipment(bookingId: string) {
  return prisma.bookingEquipment.findMany({
    where: { bookingId, releasedAt: null },
    include: { equipment: true },
  })
}

/**
 * 查询设备当前占用情况
 */
export async function getEquipmentOccupancy(equipmentId: string) {
  const assignment = await prisma.bookingEquipment.findFirst({
    where: {
      equipmentId,
      releasedAt: null,
      booking: { status: { in: ['CHECKED_IN', 'PLAYING'] } },
    },
    include: {
      booking: {
        select: {
          id: true,
          personName: true,
          startTime: true,
          status: true,
          date: true,
        },
      },
    },
  })

  return {
    isOccupied: !!assignment,
    currentBooking: assignment?.booking || null,
  }
}
