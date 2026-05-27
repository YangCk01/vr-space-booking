import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('Error:', err)

  // Prisma 错误处理
  if (err.name === 'PrismaClientKnownRequestError') {
    return error(res, '数据库操作失败', 400, err.message)
  }

  if (err.name === 'PrismaClientValidationError') {
    return error(res, '数据验证失败', 400, err.message)
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return error(res, '无效的令牌', 401)
  }

  if (err.name === 'TokenExpiredError') {
    return error(res, '令牌已过期', 401)
  }

  return error(res, '服务器内部错误', 500, err.message)
}
