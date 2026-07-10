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

function DateFilterPicker({
  startDate,
  endDate,
  onChange,
  mode = "range",
  allowClear = true,
  className,
}: DateFilterPickerProps) {
  const parsedStartDate = startDate ? parseISO(startDate) : undefined
  const parsedEndDate = endDate ? parseISO(endDate) : undefined
  const selectedStartDate =
    parsedStartDate && isValid(parsedStartDate) ? parsedStartDate : undefined
  const selectedEndDate =
    parsedEndDate && isValid(parsedEndDate) ? parsedEndDate : undefined
  const selectedRange = selectedStartDate
    ? { from: selectedStartDate, to: selectedEndDate }
    : undefined
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
          className={cn("min-w-48 justify-start gap-2", className)}
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{selectionLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-1 border-b p-2 sm:flex sm:w-24 sm:flex-col sm:border-r sm:border-b-0">
              {datePresets.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onChange(getDatePreset(preset.key))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <div className="p-1">
            {mode === "range" ? (
              <Calendar
                mode="range"
                locale={zhCN}
                selected={selectedRange}
                onSelect={handleRangeSelect}
                numberOfMonths={2}
                defaultMonth={selectedStartDate}
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
