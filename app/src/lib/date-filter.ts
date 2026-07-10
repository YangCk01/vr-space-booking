import {
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns"

export type DateFilterValue = {
  startDate: string
  endDate: string
}

export type DatePresetKey =
  | "today"
  | "yesterday"
  | "currentMonth"
  | "previousMonth"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "last365Days"
  | "currentYear"
  | "previousYear"

export const datePresets: ReadonlyArray<{
  key: DatePresetKey
  label: string
}> = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "currentMonth", label: "本月" },
  { key: "previousMonth", label: "上月" },
  { key: "last7Days", label: "最近7天" },
  { key: "last30Days", label: "最近30天" },
  { key: "last90Days", label: "最近90天" },
  { key: "last365Days", label: "最近1年" },
  { key: "currentYear", label: "今年" },
  { key: "previousYear", label: "去年" },
]

const dateFormat = "yyyy-MM-dd"

function toDateFilterValue(startDate: Date, endDate: Date): DateFilterValue {
  return {
    startDate: format(startDate, dateFormat),
    endDate: format(endDate, dateFormat),
  }
}

export function getDatePreset(
  key: DatePresetKey,
  now: Date = new Date()
): DateFilterValue {
  const today = startOfDay(now)

  switch (key) {
    case "today":
      return toDateFilterValue(today, today)
    case "yesterday": {
      const yesterday = subDays(today, 1)
      return toDateFilterValue(yesterday, yesterday)
    }
    case "currentMonth":
      return toDateFilterValue(startOfMonth(today), endOfMonth(today))
    case "previousMonth": {
      const previousMonth = subMonths(today, 1)
      return toDateFilterValue(
        startOfMonth(previousMonth),
        endOfMonth(previousMonth)
      )
    }
    case "last7Days":
      return toDateFilterValue(subDays(today, 6), today)
    case "last30Days":
      return toDateFilterValue(subDays(today, 29), today)
    case "last90Days":
      return toDateFilterValue(subDays(today, 89), today)
    case "last365Days":
      return toDateFilterValue(subDays(today, 364), today)
    case "currentYear":
      return toDateFilterValue(startOfYear(today), endOfYear(today))
    case "previousYear": {
      const previousYear = subYears(today, 1)
      return toDateFilterValue(startOfYear(previousYear), endOfYear(previousYear))
    }
  }
}
