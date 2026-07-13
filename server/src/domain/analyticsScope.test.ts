import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAnalyticsVenueScope } from './analyticsScope'

test('resolveAnalyticsVenueScope gives admin global analytics access', () => {
  assert.deepEqual(
    resolveAnalyticsVenueScope({ id: 'u1', role: 'ADMIN' }),
    { empty: false, venueWhere: {}, bookingWhere: {} },
  )
})

test('resolveAnalyticsVenueScope limits managers without requested venue to managed venues', () => {
  assert.deepEqual(
    resolveAnalyticsVenueScope({ id: 'u1', role: 'MANAGER', managedVenueIds: ['v1', 'v2'] }),
    {
      empty: false,
      venueWhere: { id: { in: ['v1', 'v2'] } },
      bookingWhere: { venueId: { in: ['v1', 'v2'] } },
    },
  )
})

test('resolveAnalyticsVenueScope allows manager requested venue inside managed venues', () => {
  assert.deepEqual(
    resolveAnalyticsVenueScope({ id: 'u1', role: 'MANAGER', managedVenueIds: ['v1', 'v2'] }, 'v2'),
    {
      empty: false,
      venueWhere: { id: 'v2' },
      bookingWhere: { venueId: 'v2' },
    },
  )
})

test('resolveAnalyticsVenueScope blocks manager requested venue outside managed venues', () => {
  assert.deepEqual(
    resolveAnalyticsVenueScope({ id: 'u1', role: 'MANAGER', managedVenueIds: ['v1'] }, 'v2'),
    {
      empty: true,
      venueWhere: { id: { in: [] } },
      bookingWhere: { venueId: { in: [] } },
    },
  )
})
