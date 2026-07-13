"use client"

import * as React from "react"
import { format, isValid, parseISO, startOfDay } from "date-fns"
import { zhCN } from "date-fns/locale"
import { CalendarDays, X } from "lucide-react"
import type { DateRange } from "react-day-picker"

import {
  datePresets,
  getDatePreset,
  type DateFilterValue,
} from "@/lib/date-filter"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type DateFilterPickerProps = {
  startDate: string
  endDate: string
  onChange: (value: DateFilterValue) => void
  mode?: "single" | "range"
  allowClear?: boolean
  className?: string
}

const dateFormat = "yyyy-MM-dd"
const desktopCalendarMediaQuery = "(min-width: 768px)"

function useDesktopCalendar() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia(desktopCalendarMediaQuery).matches
  )

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(desktopCalendarMediaQuery)
    const updateViewport = () => setIsDesktop(mediaQuery.matches)

    updateViewport()
    mediaQuery.addEventListener("change", updateViewport)

    return () => mediaQuery.removeEventListener("change", updateViewport)
  }, [])

  return isDesktop
}

function DateFilterPicker({
  startDate,
  endDate,
  onChange,
  mode = "range",
  allowClear = true,
  className,
}: DateFilterPickerProps) {
  const isDesktopCalendar = useDesktopCalendar()
  const parsedStartDate = startDate ? parseISO(startDate) : undefined
  const parsedEndDate = endDate ? parseISO(endDate) : undefined
  const selectedStartDate =
    parsedStartDate && isValid(parsedStartDate) ? parsedStartDate : undefined
  const selectedEndDate =
    parsedEndDate && isValid(parsedEndDate) ? parsedEndDate : undefined
  const selectedRange = selectedStartDate
    ? { from: selectedStartDate, to: selectedEndDate }
    : undefined
  const isRangeMode = mode === "range"
  const numberOfMonths = mode === "range" && isDesktopCalendar ? 2 : 1
  const selectionLabel =
    mode === "single"
      ? startDate || "选择日期"
      : startDate && endDate
        ? `${startDate} 至 ${endDate}`
        : "选择日期范围"

  const handleRangeSelect = React.useCallback(
    (range: DateRange | undefined) => {
      onChange({
        startDate: range?.from
          ? format(startOfDay(range.from), dateFormat)
          : "",
        endDate: range?.to ? format(startOfDay(range.to), dateFormat) : "",
      })
    },
    [onChange]
  )

  const handleSingleSelect = React.useCallback(
    (date: Date | undefined) => {
      const selectedDate = date ? format(startOfDay(date), dateFormat) : ""

      onChange({
        startDate: selectedDate,
        endDate: selectedDate,
      })
    },
    [onChange]
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start gap-2",
            isRangeMode ? "min-w-[280px]" : "min-w-48",
            className
          )}
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{selectionLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "p-0",
          isRangeMode ? "w-[min(calc(100vw-2rem),880px)]" : "w-auto"
        )}
      >
        <div className="flex flex-col sm:flex-row">
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-1 border-b p-3 sm:flex sm:w-36 sm:flex-col sm:border-r sm:border-b-0">
              {datePresets.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 justify-start text-[15px]"
                  onClick={() => onChange(getDatePreset(preset.key))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <div className={cn(isRangeMode ? "flex-1 p-4" : "p-1")}>
            {mode === "range" ? (
              <Calendar
                mode="range"
                locale={zhCN}
                selected={selectedRange}
                onSelect={handleRangeSelect}
                numberOfMonths={numberOfMonths}
                defaultMonth={selectedStartDate}
                className="w-full p-0 [--cell-size:2.75rem]"
                classNames={{
                  root: "w-full",
                  months: "flex flex-col gap-6 md:flex-row md:justify-between",
                  month: "flex w-full flex-col gap-5 md:w-[20rem]",
                  month_caption: "flex h-11 w-full items-center justify-center px-11",
                  caption_label: "select-none text-lg font-medium",
                  nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between",
                  weekdays: "flex border-b pb-3",
                  weekday: "flex-1 select-none rounded-md text-center text-[15px] font-normal text-muted-foreground",
                  week: "mt-3 flex w-full",
                }}
              />
            ) : (
              <Calendar
                mode="single"
                locale={zhCN}
                selected={selectedStartDate}
                onSelect={handleSingleSelect}
                defaultMonth={selectedStartDate}
              />
            )}
            {allowClear && (startDate || endDate) && (
              <div className="flex justify-end border-t px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => onChange({ startDate: "", endDate: "" })}
                >
                  <X className="size-4" aria-hidden="true" />
                  清除
                </Button>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DateFilterPicker, type DateFilterPickerProps }
