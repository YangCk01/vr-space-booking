import { NextFunction, Request, Response } from 'express'

const MAX_QUERY_LIMIT = 100

function capNumericQueryParam(query: Record<string, unknown>, key: string): void {
  const raw = query[key]
  if (raw === undefined) return

  const value = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number.parseInt(String(value), 10)
  const normalized = Number.isFinite(parsed)
    ? Math.min(MAX_QUERY_LIMIT, Math.max(1, parsed))
    : 1

  query[key] = String(normalized)
}

export function normalizeQueryLimits(req: Request, _res: Response, next: NextFunction): void {
  const query = req.query as Record<string, unknown>
  capNumericQueryParam(query, 'pageSize')
  capNumericQueryParam(query, 'limit')
  next()
}
