import test from 'node:test'
import assert from 'node:assert/strict'
import { applyVenueScope, getVenueScope } from './venueScope'

test('getVenueScope gives super admin global access', () => {
  assert.deepEqual(getVenueScope({
    id: 'u1',
    role: 'SUPER_ADMIN',
    managedVenueIds: [],
  }), { kind: 'GLOBAL' })
})

test('getVenueScope limits managers to managed venues', () => {
  assert.deepEqual(getVenueScope({
    id: 'u1',
    role: 'MANAGER',
    managedVenueIds: ['v1', 'v2'],
  }), { kind: 'VENUES', venueIds: ['v1', 'v2'] })
})

test('getVenueScope limits customers to owned records', () => {
  assert.deepEqual(getVenueScope({
    id: 'u1',
    role: 'CUSTOMER',
  }), { kind: 'USER', userId: 'u1' })
})

test('applyVenueScope intersects requested venue with managed venues', () => {
  const result = applyVenueScope(
    { venueId: 'v2' },
    { id: 'u1', role: 'MANAGER', managedVenueIds: ['v1', 'v2'] }
  )

  assert.deepEqual(result, {
    where: { venueId: 'v2' },
    empty: false,
  })
})

test('applyVenueScope marks query empty when requested venue is outside managed venues', () => {
  const result = applyVenueScope(
    { venueId: 'v3' },
    { id: 'u1', role: 'MANAGER', managedVenueIds: ['v1', 'v2'] }
  )

  assert.deepEqual(result, {
    where: { venueId: 'v3' },
    empty: true,
  })
})

test('applyVenueScope adds customer user filter', () => {
  const result = applyVenueScope(
    { status: 'PAID' },
    { id: 'u1', role: 'CUSTOMER' }
  )

  assert.deepEqual(result, {
    where: { status: 'PAID', userId: 'u1' },
    empty: false,
  })
})
