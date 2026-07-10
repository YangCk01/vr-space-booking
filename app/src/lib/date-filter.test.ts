import { describe, expect, it } from "vitest"

import { datePresets, getDatePreset } from "./date-filter"

const JULY_10_2026 = new Date(2026, 6, 10, 14, 30)

describe("getDatePreset", () => {
  it("uses the approved Chinese labels for rolling date presets", () => {
    const labels = Object.fromEntries(
      datePresets.map((preset) => [preset.key, preset.label])
    )

    expect(labels).toMatchObject({
      last7Days: "最近7天",
      last30Days: "最近30天",
      last90Days: "最近90天",
      last365Days: "最近1年",
    })
  })

  it("returns today as a single local calendar day", () => {
    expect(getDatePreset("today", JULY_10_2026)).toEqual({
      startDate: "2026-07-10",
      endDate: "2026-07-10",
    })
  })

  it("returns yesterday without crossing a UTC date boundary", () => {
    expect(getDatePreset("yesterday", JULY_10_2026)).toEqual({
      startDate: "2026-07-09",
      endDate: "2026-07-09",
    })
  })

  it("returns the current calendar month", () => {
    expect(getDatePreset("currentMonth", JULY_10_2026)).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    })
  })

  it("returns the previous calendar month", () => {
    expect(getDatePreset("previousMonth", JULY_10_2026)).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    })
  })

  it("returns the inclusive rolling seven-day window", () => {
    expect(getDatePreset("last7Days", JULY_10_2026)).toEqual({
      startDate: "2026-07-04",
      endDate: "2026-07-10",
    })
  })

  it("returns the inclusive rolling thirty-day window", () => {
    expect(getDatePreset("last30Days", JULY_10_2026)).toEqual({
      startDate: "2026-06-11",
      endDate: "2026-07-10",
    })
  })

  it("returns the inclusive rolling ninety-day window", () => {
    expect(getDatePreset("last90Days", JULY_10_2026)).toEqual({
      startDate: "2026-04-12",
      endDate: "2026-07-10",
    })
  })

  it("returns the inclusive rolling 365-day window", () => {
    expect(getDatePreset("last365Days", JULY_10_2026)).toEqual({
      startDate: "2025-07-11",
      endDate: "2026-07-10",
    })
  })

  it("returns the current calendar year", () => {
    expect(getDatePreset("currentYear", JULY_10_2026)).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })
  })

  it("returns the previous calendar year", () => {
    expect(getDatePreset("previousYear", JULY_10_2026)).toEqual({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    })
  })

  it("preserves leap-day and month-end boundaries", () => {
    expect(getDatePreset("previousMonth", new Date(2024, 2, 15, 9))).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    })
    expect(getDatePreset("yesterday", new Date(2024, 2, 1, 9))).toEqual({
      startDate: "2024-02-29",
      endDate: "2024-02-29",
    })
  })

})
