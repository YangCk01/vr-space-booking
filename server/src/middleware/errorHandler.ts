import { Request, Response, NextFunction } from 'express'
import { error as responseError } from '../utils/response'
import { errorToResponse } from '../domain/errors'
import { ErrorCodes } from '../utils/errorCodes'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(JSON.stringify({
    level: 'error',
    event: 'request_error',
    requestId: res.locals.requestId,
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    timestamp: new Date().toISOString(),
  }))

  const mapped = errorToResponse(err)

  // Prisma 错误处理
  if (err.name === 'PrismaClientKnownRequestError') {
    return responseError(res, '数据库操作失败', 400, err.message, ErrorCodes.DATABASE_ERROR)
  }

  if (err.name === 'PrismaClientValidationError') {
    return responseError(res, '数据验证失败', 400, err.message, ErrorCodes.DATABASE_ERROR)
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return responseError(res, '无效的令牌', 401, undefined, ErrorCodes.UNAUTHORIZED)
  }

  if (err.name === 'TokenExpiredError') {
    return responseError(res, '令牌已过期', 401, undefined, ErrorCodes.UNAUTHORIZED)
  }

  return responseError(
    res,
    mapped.message,
    mapped.statusCode,
    mapped.detail || (mapped.details ? JSON.stringify(mapped.details) : undefined),
    mapped.code
  )
}
