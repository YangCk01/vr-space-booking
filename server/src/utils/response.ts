import { Response } from 'express'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  meta?: {
    page?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
}

export function success<T>(res: Response, data: T, message = 'success', statusCode = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  }
  return res.status(statusCode).json(response)
}

export function error(res: Response, message: string, statusCode = 400, errorDetail?: string) {
  const response: ApiResponse = {
    success: false,
    message,
    error: errorDetail,
  }
  return res.status(statusCode).json(response)
}

export function paginated<T>(
  res: Response,
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  message = 'success'
) {
  const response: ApiResponse<T[]> = {
    success: true,
    data,
    message,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
  return res.status(200).json(response)
}
