import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertBookingCapacity,
  buildBookingSlotLockKey,
  buildBookingSlotLockQuery,
} from './bookingCapacity'

test('assertBookingCapacity rejects overlapping bookings above capacity', () => {
  assert.throws(
    () => assertBookingCapacity({
      existingBookings: [
        { startTime: '10:00', endTime: '10:30', personCount: 2 },
        { startTime: '10:15', endTime: '10:45', personCount: 1 },
      ],
      startTime: '10:20',
      endTime: '10:40',
      personCount: 2,
      capacity: 4,
    }),
    /该时段已约满/
  )
})

test('assertBookingCapacity ignores non-overlapping bookings', () => {
  const result = assertBookingCapacity({
    existingBookings: [
      { startTime: '09:00', endTime: '09:30', personCount: 4 },
    ],
    startTime: '10:00',
    endTime: '10:30',
    personCount: 2,
    capacity: 2,
  })

  assert.deepEqual(result, { currentCount: 0, remainingCount: 0, maxCount: 2 })
})

test('buildBookingSlotLockKey is stable for the same venue/date/time slot', () => {
  assert.equal(
    buildBookingSlotLockKey('venue-1', '2026-07-06', '10:00', '10:30'),
    buildBookingSlotLockKey('venue-1', '2026-07-06', '10:00', '10:30')
  )
  assert.notEqual(
    buildBookingSlotLockKey('venue-1', '2026-07-06', '10:00', '10:30'),
    buildBookingSlotLockKey('venue-1', '2026-07-06', '10:30', '11:00')
  )
})

test('booking advisory lock query returns a supported integer column', () => {
  const query = buildBookingSlotLockQuery(123n)

  assert.match(query.sql, /SELECT 1::int AS locked/i)
  assert.match(query.sql, /pg_advisory_xact_lock\(\?\)/i)
  assert.deepEqual(query.values, [123n])
})
