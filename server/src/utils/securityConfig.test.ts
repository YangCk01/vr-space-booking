import test from 'node:test'
import assert from 'node:assert/strict'
import { UserRole } from '@prisma/client'
import {
  getCorsOrigins,
  normalizeRegisterRole,
  requireSecret,
  shouldMountDebugRoutes,
} from './securityConfig'

test('requireSecret rejects missing or short production secrets', () => {
  assert.throws(() => requireSecret('JWT_SECRET', {}), /JWT_SECRET/)
  assert.throws(() => requireSecret('JWT_SECRET', { JWT_SECRET: 'short' }), /不少于 32/)
  assert.equal(requireSecret('JWT_SECRET', { JWT_SECRET: 'x'.repeat(32) }), 'x'.repeat(32))
})

test('getCorsOrigins requires explicit production origin but allows dev defaults', () => {
  assert.throws(() => getCorsOrigins({ NODE_ENV: 'production' }), /CORS_ORIGIN/)
  assert.equal(getCorsOrigins({ NODE_ENV: 'development' }), true)
  assert.deepEqual(getCorsOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'https://a.com, https://b.com' }), [
    'https://a.com',
    'https://b.com',
  ])
})

test('normalizeRegisterRole ignores client-supplied roles', () => {
  assert.equal(normalizeRegisterRole(UserRole.SUPER_ADMIN), UserRole.CUSTOMER)
  assert.equal(normalizeRegisterRole(UserRole.ADMIN), UserRole.CUSTOMER)
  assert.equal(normalizeRegisterRole(undefined), UserRole.CUSTOMER)
})

test('debug routes are disabled in production', () => {
  assert.equal(shouldMountDebugRoutes({ NODE_ENV: 'production' }), false)
  assert.equal(shouldMountDebugRoutes({ NODE_ENV: 'development' }), true)
})
