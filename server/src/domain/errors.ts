import { ErrorCodes, ErrorCode, resolveErrorCode } from '../utils/errorCodes'

export class BusinessError extends Error {
  readonly statusCode: number
  readonly code: string | number
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    statusCode = 400,
    code: string | number = ErrorCodes.BUSINESS_ERROR,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'BusinessError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export class ValidationError extends BusinessError {
  constructor(
    message: string,
    code: string | number = ErrorCodes.VALIDATION_ERROR,
    details?: Record<string, unknown>
  ) {
    super(message, 400, code, details)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends BusinessError {
  constructor(message: string, code: string | number = ErrorCodes.NOT_FOUND) {
    super(message, 404, code)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends BusinessError {
  constructor(message: string, code: string | number = ErrorCodes.FORBIDDEN) {
    super(message, 403, code)
    this.name = 'ForbiddenError'
  }
}

export interface ErrorResponseMapping {
  statusCode: number
  message: string
  code: ErrorCode
  detail?: string
  details?: Record<string, unknown>
}

export function errorToResponse(err: unknown): ErrorResponseMapping {
  if (err instanceof BusinessError) {
    return {
      statusCode: err.statusCode,
      message: err.message,
      code: resolveErrorCode(err.code),
      ...(err.details ? { details: err.details } : {}),
    }
  }

  if (err instanceof Error) {
    return {
      statusCode: 500,
      message: '服务器内部错误',
      code: ErrorCodes.INTERNAL_ERROR,
      detail: err.message,
    }
  }

  return {
    statusCode: 500,
    message: '服务器内部错误',
    code: ErrorCodes.INTERNAL_ERROR,
  }
}
