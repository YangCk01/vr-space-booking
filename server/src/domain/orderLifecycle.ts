import type { BookingStatus, OrderStatus } from '@prisma/client'

const DEFAULT_TIMEZONE_OFFSET = '+08:00'

export interface BookingTimeInput {
  date: Date
  startTime: string
}

export interface BookingWindowInput extends BookingTimeInput {
  verifyAdvanceMinutes: number
  noShowDeadlineMinutes: number
}

export interface BookingWindow {
  startAt: Date
  readyAt: Date
  noShowDeadlineAt: Date
}

export interface VerifyWindowInput extends BookingWindowInput {
  now: Date
}

export interface RestoreNoShowTargetStatusInput {
  booking: BookingTimeInput | null
  now: Date
  verifyAdvanceMinutes: number
  noShowDeadlineMinutes: number
}

export interface ScheduledBookingStatusInput extends BookingTimeInput {
  now: Date
  verifyAdvanceMinutes: number
}

export interface OrderBookingStatuses {
  orderStatus: OrderStatus
  bookingStatus: BookingStatus
}

function localDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function calculateBookingStartAt(
  date: Date,
  startTime: string,
  timezoneOffset = DEFAULT_TIMEZONE_OFFSET
): Date {
  return new Date(`${localDateString(date)}T${startTime}:00${timezoneOffset}`)
}

export function calculateBookingWindow(input: BookingWindowInput): BookingWindow {
  const startAt = calculateBookingStartAt(input.date, input.startTime)
  return {
    startAt,
    readyAt: new Date(startAt.getTime() - input.verifyAdvanceMinutes * 60 * 1000),
    noShowDeadlineAt: new Date(startAt.getTime() + input.noShowDeadlineMinutes * 60 * 1000),
  }
}

export function isInVerifyWindow(input: VerifyWindowInput): boolean {
  const window = calculateBookingWindow(input)
  return input.now >= window.readyAt && input.now < window.noShowDeadlineAt
}

export function calculateRestoreNoShowTargetStatus(
  input: RestoreNoShowTargetStatusInput
): OrderBookingStatuses {
  if (!input.booking) {
    return {
      orderStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
    }
  }

  const window = calculateBookingWindow({
    date: input.booking.date,
    startTime: input.booking.startTime,
    verifyAdvanceMinutes: input.verifyAdvanceMinutes,
    noShowDeadlineMinutes: input.noShowDeadlineMinutes,
  })

  if (input.now >= window.noShowDeadlineAt) {
    throw new Error('该预约已超过爽约截止时间，不能恢复为可核销订单')
  }

  if (input.now >= window.readyAt) {
    return {
      orderStatus: 'READY_TO_VERIFY',
      bookingStatus: 'READY',
    }
  }

  return {
    orderStatus: 'PAID',
    bookingStatus: 'CONFIRMED',
  }
}

export function calculateScheduledBookingStatuses(
  input: ScheduledBookingStatusInput
): OrderBookingStatuses {
  const startAt = calculateBookingStartAt(input.date, input.startTime)
  const minutesUntilStart = (startAt.getTime() - input.now.getTime()) / (1000 * 60)
  const shouldBeReady = minutesUntilStart > 0 && minutesUntilStart <= input.verifyAdvanceMinutes

  return {
    orderStatus: shouldBeReady ? 'READY_TO_VERIFY' : 'PAID',
    bookingStatus: shouldBeReady ? 'READY' : 'CONFIRMED',
  }
}
