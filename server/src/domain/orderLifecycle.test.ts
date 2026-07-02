import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateBookingWindow,
  calculateRestoreNoShowTargetStatus,
  calculateScheduledBookingStatuses,
  isInVerifyWindow,
} from './orderLifecycle'

const bookingDate = new Date('2026-07-01T00:00:00.000Z')

test('calculateBookingWindow returns local start, ready, and no-show deadline times', () => {
  const window = calculateBookingWindow({
    date: bookingDate,
    startTime: '20:00',
    verifyAdvanceMinutes: 15,
    noShowDeadlineMinutes: 10,
  })

  assert.equal(window.startAt.toISOString(), '2026-07-01T12:00:00.000Z')
  assert.equal(window.readyAt.toISOString(), '2026-07-01T11:45:00.000Z')
  assert.equal(window.noShowDeadlineAt.toISOString(), '2026-07-01T12:10:00.000Z')
})

test('isInVerifyWindow only returns true from ready time until no-show deadline', () => {
  const input = {
    date: bookingDate,
    startTime: '20:00',
    verifyAdvanceMinutes: 15,
    noShowDeadlineMinutes: 10,
  }

  assert.equal(isInVerifyWindow({ ...input, now: new Date('2026-07-01T11:44:59.000Z') }), false)
  assert.equal(isInVerifyWindow({ ...input, now: new Date('2026-07-01T11:45:00.000Z') }), true)
  assert.equal(isInVerifyWindow({ ...input, now: new Date('2026-07-01T12:09:59.000Z') }), true)
  assert.equal(isInVerifyWindow({ ...input, now: new Date('2026-07-01T12:10:00.000Z') }), false)
})

test('calculateRestoreNoShowTargetStatus restores future booking to paid and confirmed', () => {
  const result = calculateRestoreNoShowTargetStatus({
    booking: { date: bookingDate, startTime: '20:00' },
    now: new Date('2026-07-01T11:30:00.000Z'),
    verifyAdvanceMinutes: 15,
    noShowDeadlineMinutes: 10,
  })

  assert.deepEqual(result, {
    orderStatus: 'PAID',
    bookingStatus: 'CONFIRMED',
  })
})

test('calculateRestoreNoShowTargetStatus restores in-window booking to ready states', () => {
  const result = calculateRestoreNoShowTargetStatus({
    booking: { date: bookingDate, startTime: '20:00' },
    now: new Date('2026-07-01T11:50:00.000Z'),
    verifyAdvanceMinutes: 15,
    noShowDeadlineMinutes: 10,
  })

  assert.deepEqual(result, {
    orderStatus: 'READY_TO_VERIFY',
    bookingStatus: 'READY',
  })
})

test('calculateRestoreNoShowTargetStatus rejects booking after no-show deadline', () => {
  assert.throws(
    () => calculateRestoreNoShowTargetStatus({
      booking: { date: bookingDate, startTime: '20:00' },
      now: new Date('2026-07-01T12:10:00.000Z'),
      verifyAdvanceMinutes: 15,
      noShowDeadlineMinutes: 10,
    }),
    /超过爽约截止时间/
  )
})

test('calculateScheduledBookingStatuses maps a rescheduled booking into ready window states', () => {
  const result = calculateScheduledBookingStatuses({
    date: bookingDate,
    startTime: '20:00',
    now: new Date('2026-07-01T11:50:00.000Z'),
    verifyAdvanceMinutes: 15,
  })

  assert.deepEqual(result, {
    orderStatus: 'READY_TO_VERIFY',
    bookingStatus: 'READY',
  })
})

test('calculateScheduledBookingStatuses maps a future rescheduled booking into paid states', () => {
  const result = calculateScheduledBookingStatuses({
    date: bookingDate,
    startTime: '20:00',
    now: new Date('2026-07-01T11:30:00.000Z'),
    verifyAdvanceMinutes: 15,
  })

  assert.deepEqual(result, {
    orderStatus: 'PAID',
    bookingStatus: 'CONFIRMED',
  })
})
