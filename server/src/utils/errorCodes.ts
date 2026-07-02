export const ErrorCodes = {
  OK: 0,

  // 通用客户端错误 1000~1099
  BAD_REQUEST: 1000,
  VALIDATION_ERROR: 1001,
  UNAUTHORIZED: 1002,
  FORBIDDEN: 1003,
  NOT_FOUND: 1004,
  METHOD_NOT_ALLOWED: 1005,
  CONFLICT: 1006,
  TOO_MANY_REQUESTS: 1007,

  // 业务错误 2000~2999
  BUSINESS_ERROR: 2000,
  INSUFFICIENT_BALANCE: 2001,
  ORDER_NOT_FOUND: 2002,
  ORDER_NOT_REFUNDABLE: 2003,
  BOOKING_NOT_FOUND: 2004,
  BOOKING_CONFLICT: 2005,
  COUPON_INVALID: 2006,
  COUPON_USED: 2007,
  PAYMENT_FAILED: 2008,
  REFUND_FAILED: 2009,
  NO_SHOW_DISPOSITION_INVALID: 2010,
  RESCHEDULE_NOT_ALLOWED: 2011,

  // 服务端错误 5000~5999
  INTERNAL_ERROR: 5000,
  DATABASE_ERROR: 5001,
  EXTERNAL_SERVICE_ERROR: 5002,
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

const stringToCode = new Map<string, ErrorCode>([
  ['BAD_REQUEST', ErrorCodes.BAD_REQUEST],
  ['VALIDATION_ERROR', ErrorCodes.VALIDATION_ERROR],
  ['UNAUTHORIZED', ErrorCodes.UNAUTHORIZED],
  ['FORBIDDEN', ErrorCodes.FORBIDDEN],
  ['NOT_FOUND', ErrorCodes.NOT_FOUND],
  ['METHOD_NOT_ALLOWED', ErrorCodes.METHOD_NOT_ALLOWED],
  ['CONFLICT', ErrorCodes.CONFLICT],
  ['TOO_MANY_REQUESTS', ErrorCodes.TOO_MANY_REQUESTS],
  ['BUSINESS_ERROR', ErrorCodes.BUSINESS_ERROR],
  ['INSUFFICIENT_BALANCE', ErrorCodes.INSUFFICIENT_BALANCE],
  ['INTERNAL_ERROR', ErrorCodes.INTERNAL_ERROR],
  ['DATABASE_ERROR', ErrorCodes.DATABASE_ERROR],
  ['EXTERNAL_SERVICE_ERROR', ErrorCodes.EXTERNAL_SERVICE_ERROR],
])

export function resolveErrorCode(code: string | number | undefined): ErrorCode {
  if (code === undefined || code === null) {
    return ErrorCodes.INTERNAL_ERROR
  }
  if (typeof code === 'number') {
    return code as ErrorCode
  }
  return stringToCode.get(code) ?? ErrorCodes.BUSINESS_ERROR
}
