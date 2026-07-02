import { NextFunction, Request, Response } from 'express'

export interface RequestLogInput {
  requestId?: string
  method: string
  path: string
  statusCode: number
  startedAt: number
  finishedAt: number
  userId?: string
  role?: string
}

export interface RequestLogEvent {
  level: 'info' | 'warn' | 'error'
  event: 'http_request'
  requestId?: string
  method: string
  path: string
  statusCode: number
  durationMs: number
  userId?: string
  role?: string
}

export function buildRequestLogEvent(input: RequestLogInput): RequestLogEvent {
  const durationMs = Math.max(0, input.finishedAt - input.startedAt)
  const level = input.statusCode >= 500 ? 'error' : durationMs >= 2000 ? 'warn' : 'info'
  return {
    level,
    event: 'http_request',
    requestId: input.requestId,
    method: input.method,
    path: input.path,
    statusCode: input.statusCode,
    durationMs,
    userId: input.userId,
    role: input.role,
  }
}

function writeRequestLog(event: RequestLogEvent) {
  const line = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  })
  if (event.level === 'error') console.error(line)
  else if (event.level === 'warn') console.warn(line)
  else console.log(line)
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now()
  res.on('finish', () => {
    const user = (req as any).user
    writeRequestLog(buildRequestLogEvent({
      requestId: res.locals.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      startedAt,
      finishedAt: Date.now(),
      userId: user?.id,
      role: user?.role,
    }))
  })
  next()
}
