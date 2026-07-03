import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_ROLES,
  getRequiredUploadPermissions,
  isRoleGranted,
} from './adminPermissions'

test('manager role is scoped to store operations instead of marketing configuration', () => {
  assert.equal(isRoleGranted('MANAGER', 'order:read'), true)
  assert.equal(isRoleGranted('MANAGER', 'order:verify'), true)
  assert.equal(isRoleGranted('MANAGER', 'venue:maintenance'), true)
  assert.equal(isRoleGranted('MANAGER', 'approval:request'), true)

  assert.equal(isRoleGranted('MANAGER', 'member:marketing'), false)
  assert.equal(isRoleGranted('MANAGER', 'points:mall'), false)
  assert.equal(isRoleGranted('MANAGER', 'recharge:staff'), false)
  assert.equal(isRoleGranted('MANAGER', 'marketing:campaign'), false)
  assert.equal(isRoleGranted('MANAGER', 'finance:read'), false)
})

test('operator role can operate marketing without finance or account administration', () => {
  assert.equal(isRoleGranted('OPERATOR', 'member:marketing'), true)
  assert.equal(isRoleGranted('OPERATOR', 'points:mall'), true)
  assert.equal(isRoleGranted('OPERATOR', 'marketing:campaign'), true)
  assert.equal(isRoleGranted('OPERATOR', 'marketing:rule'), true)
  assert.equal(isRoleGranted('OPERATOR', 'user:gift'), true)

  assert.equal(isRoleGranted('OPERATOR', 'finance:read'), false)
  assert.equal(isRoleGranted('OPERATOR', 'account:manage'), false)
  assert.equal(isRoleGranted('OPERATOR', 'role:manage'), false)
})

test('admin and super admin include every built-in permission', () => {
  const admin = BUILTIN_ROLES.find((role) => role.name === 'ADMIN')
  const superAdmin = BUILTIN_ROLES.find((role) => role.name === 'SUPER_ADMIN')

  assert.ok(admin)
  assert.ok(superAdmin)
  assert.deepEqual(admin.permissions, superAdmin.permissions)
  assert.equal(isRoleGranted('ADMIN', 'member:marketing'), true)
  assert.equal(isRoleGranted('ADMIN', 'upload:content'), true)
  assert.equal(isRoleGranted('SUPER_ADMIN', 'monitor:read'), true)
})

test('upload type permissions match business ownership', () => {
  assert.deepEqual(getRequiredUploadPermissions('venues'), ['venue:manage'])
  assert.deepEqual(getRequiredUploadPermissions('games'), ['content:manage'])
  assert.deepEqual(getRequiredUploadPermissions('pages'), ['content:manage'])
  assert.deepEqual(getRequiredUploadPermissions('group-buys'), ['group-buy:manage'])
  assert.deepEqual(getRequiredUploadPermissions('avatars'), ['user:edit'])
  assert.deepEqual(getRequiredUploadPermissions('unknown'), [])
})
