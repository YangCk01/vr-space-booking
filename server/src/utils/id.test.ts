import test from 'node:test'
import assert from 'node:assert/strict'
import { newBusinessNo, newUuid, generateVerifyCode } from './id'

test('newUuid returns an RFC4122 UUID', () => {
  assert.match(newUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
})

test('newBusinessNo uses prefix, date and fixed-width crypto random suffix', () => {
  assert.match(newBusinessNo('CZ', 6), /^CZ\d{8}\d{6}$/)
})

test('generateVerifyCode uses the existing VR date format', () => {
  assert.match(generateVerifyCode(), /^VR\d{8}\d{6}$/)
})
