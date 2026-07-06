import { createHash } from 'crypto'

export interface ExistingBookingSlot {
  startTime: string
  endTime: string
  personCount?: number | null
}

export interface BookingCapacityInput {
  existingBookings: ExistingBookingSlot[]
  startTime: string
  endTime: string
  personCount: number
  capacity: number
}

export function assertBookingCapacity(input: BookingCapacityInput) {
  const start = timeToMinutes(input.startTime)
  const end = timeToMinutes(input.endTime)
  const capacity = Math.max(1, input.capacity)
  const requested = Math.max(1, input.personCount)

  const currentCount = input.existingBookings
    .filter((booking) => start < timeToMinutes(booking.endTime) && end > timeToMinutes(booking.startTime))
    .reduce((sum, booking) => sum + (booking.personCount || 1), 0)

  if (currentCount + requested > capacity) {
    throw new Error('该时段已约满')
  }

  return {
    currentCount,
    remainingCount: Math.max(0, capacity - currentCount - requested),
    maxCount: capacity,
  }
}

export function buildBookingSlotLockKey(venueId: string, date: string, startTime: string, endTime: string): bigint {
  const digest = createHash('sha256').update(`${venueId}:${date}:${startTime}:${endTime}`).digest()
  return digest.readBigInt64BE(0)
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
