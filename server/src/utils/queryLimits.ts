import { format, parseISO, differenceInCalendarDays, subDays } from 'date-fns'

export interface PageParamsInput {
  page?: unknown
  pageSize?: unknown
  defaultPageSize?: number
  maxPageSize?: number
}

export function clampPageParams(input: PageParamsInput) {
  const defaultPageSize = input.defaultPageSize ?? 10
  const maxPageSize = input.maxPageSize ?? 100
  const rawPage = Number.parseInt(String(input.page ?? '1'), 10)
  const rawPageSize = Number.parseInt(String(input.pageSize ?? defaultPageSize), 10)

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: Math.min(
      Math.max(Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : defaultPageSize, 1),
      maxPageSize
    ),
  }
}

export interface DateRangeInput {
  startDate?: unknown
  endDate?: unknown
  defaultDays?: number
  maxDays?: number
  now?: Date
}

export function resolveDateRange(input: DateRangeInput) {
  const defaultDays = input.defaultDays ?? 31
  const maxDays = input.maxDays ?? 93
  const today = input.now ?? new Date()
  const endDate = normalizeDate(input.endDate) || format(today, 'yyyy-MM-dd')
  const startDate = normalizeDate(input.startDate) || format(subDays(parseISO(`${endDate}T00:00:00`), defaultDays - 1), 'yyyy-MM-dd')

  const days = differenceInCalendarDays(parseISO(`${endDate}T00:00:00`), parseISO(`${startDate}T00:00:00`)) + 1
  if (days <= 0) {
    throw new Error('开始日期不能晚于结束日期')
  }
  if (days > maxDays) {
    throw new Error(`查询日期范围不能超过 ${maxDays} 天`)
  }

  return { startDate, endDate }
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const raw = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('日期格式错误，请使用 YYYY-MM-DD')
  }
  return raw
}
