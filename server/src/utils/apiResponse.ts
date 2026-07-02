import { Response } from 'express'

export interface SuccessResponse<T = unknown> {
  code: number
  message: string
  data: T
  meta: ResponseMeta
}

export interface ErrorResponse {
  code: number
  message: string
  details?: Record<string, unknown> | string
  meta: ResponseMeta
}

export interface ResponseMeta {
  requestId?: string
  timestamp: string
  page?: number
  pageSize?: number
  total?: number
  totalPages?: number
  [key: string]: unknown
}

export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

function getRequestId(res: Response): string | undefined {
  return (res.locals && res.locals.requestId) || undefined
}

function buildMeta(res: Response): ResponseMeta {
  return {
    requestId: getRequestId(res),
    timestamp: new Date().toISOString(),
  }
}

export function success<T>(res: Response, data: T, message = 'OK', statusCode = 200): Response {
  const body: SuccessResponse<T> = {
    code: 0,
    message,
    data,
    meta: buildMeta(res),
  }
  return res.status(statusCode).json(body)
}

export function paginated<T>(
  res: Response,
  list: T[],
  page: number,
  pageSize: number,
  total: number,
  message = 'OK',
  extraMeta: Record<string, unknown> = {}
): Response {
  const body: SuccessResponse<PaginatedData<T>> = {
    code: 0,
    message,
    data: { list, total, page, pageSize },
    meta: {
      ...buildMeta(res),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      ...extraMeta,
    },
  }
  return res.status(200).json(body)
}

export function error(
  res: Response,
  code: number,
  message: string,
  statusCode = 400,
  details?: Record<string, unknown> | string
): Response {
  const body: ErrorResponse = {
    code,
    message,
    ...(details ? { details } : {}),
    meta: buildMeta(res),
  }
  return res.status(statusCode).json(body)
}
