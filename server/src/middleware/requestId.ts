import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

export const REQUEST_ID_HEADER = 'x-request-id'

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.get(REQUEST_ID_HEADER) || generateRequestId()) as string
  res.locals.requestId = requestId
  res.setHeader(REQUEST_ID_HEADER, requestId)
  next()
}
