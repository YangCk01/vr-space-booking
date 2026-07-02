import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BusinessError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  errorToResponse,
} from './errors'
import { ErrorCodes } from '../utils/errorCodes'

test('BusinessError carries http status and stable error code', () => {
  const err = new BusinessError('余额不足', 400, ErrorCodes.INSUFFICIENT_BALANCE)

  assert.equal(err.message, '余额不足')
  assert.equal(err.statusCode, 400)
  assert.equal(err.code, ErrorCodes.INSUFFICIENT_BALANCE)
})

test('typed business errors expose default status codes', () => {
  assert.equal(new ValidationError('参数错误').statusCode, 400)
  assert.equal(new NotFoundError('订单不存在').statusCode, 404)
  assert.equal(new ForbiddenError('权限不足').statusCode, 403)
})

test('errorToResponse maps business errors without leaking stack traces', () => {
  const response = errorToResponse(new NotFoundError('订单不存在'))

  assert.deepEqual(response, {
    statusCode: 404,
    message: '订单不存在',
    code: ErrorCodes.NOT_FOUND,
  })
})

test('errorToResponse maps unknown errors to internal server error', () => {
  const response = errorToResponse(new Error('database details'))

  assert.deepEqual(response, {
    statusCode: 500,
    message: '服务器内部错误',
    code: ErrorCodes.INTERNAL_ERROR,
    detail: 'database details',
  })
})
