import { Response } from 'express'
import { resolveErrorCode, ErrorCodes } from './errorCodes'
import * as api from './apiResponse'

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
  details?: string | Record<string, unknown>
  meta?: {
    requestId?: string
    timestamp: string
    page?: number
    pageSize?: number
    total?: number
    totalPages?: number
    [key: string]: unknown
  }
}

function statusToDefaultErrorCode(statusCode: number): number {
  switch (statusCode) {
    case 400:
      return ErrorCodes.BAD_REQUEST
    case 401:
      return ErrorCodes.UNAUTHORIZED
    case 403:
      return ErrorCodes.FORBIDDEN
    case 404:
      return ErrorCodes.NOT_FOUND
    case 409:
      return ErrorCodes.CONFLICT
    case 429:
      return ErrorCodes.TOO_MANY_REQUESTS
    case 500:
    default:
      return ErrorCodes.INTERNAL_ERROR
  }
}

export function success<T>(res: Response, data: T, message = 'success', statusCode = 200) {
  return api.success(res, data, message, statusCode)
}

export function error(
  res: Response,
  message: string,
  statusCode = 400,
  errorDetail?: string,
  code?: string | number
) {
  const numericCode =
    typeof code === 'number'
      ? code
      : typeof code === 'string'
        ? resolveErrorCode(code)
        : statusToDefaultErrorCode(statusCode)
  const details = errorDetail ? { detail: errorDetail } : undefined
  return api.error(res, numericCode, message, statusCode, details)
}

export function paginated<T>(
  res: Response,
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  message = 'success',
  extraMeta: Record<string, unknown> = {}
) {
  return api.paginated(res, data, page, pageSize, total, message, extraMeta)
}
