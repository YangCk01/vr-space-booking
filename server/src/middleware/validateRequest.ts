import { Request, Response, NextFunction } from 'express'
import { z, ZodError } from 'zod'
import { ValidationError } from '../domain/errors'

export interface RequestSchemas {
  body?: z.ZodTypeAny
  query?: z.ZodTypeAny
  params?: z.ZodTypeAny
}

function formatZodError(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root'
    result[path] = result[path] || []
    result[path].push(issue.message)
  }
  return result
}

export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body)
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any
      }
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new ValidationError('请求参数校验失败', 'VALIDATION_ERROR', formatZodError(err)))
      }
      next(err)
    }
  }
}
