import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response'

export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; frame-ancestors 'none'"
  )
  next()
}

export interface RateLimitOptions {
  windowMs: number
  max: number
  keyPrefix: string
  now?: () => number
}

export function createFixedWindowRateLimiter(options: RateLimitOptions) {
  const now = options.now ?? Date.now
  const buckets = new Map<string, { windowStart: number; count: number }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${options.keyPrefix}:${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`
    const current = now()
    const bucket = buckets.get(key)

    if (!bucket || current - bucket.windowStart >= options.windowMs) {
      buckets.set(key, { windowStart: current, count: 1 })
      return next()
    }

    bucket.count += 1
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((options.windowMs - (current - bucket.windowStart)) / 1000)))
      return error(res, '请求过于频繁，请稍后再试', 429)
    }

    return next()
  }
}
