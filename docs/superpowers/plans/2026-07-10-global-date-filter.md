# Global Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every B-side query date input with one Chinese date-only picker while preserving business data-entry date fields and existing API date strings.

**Architecture:** A shared controlled `DateFilterPicker` owns calendar presentation, preset calculation, responsive month count, and date-string conversion. Pages continue to own filter state and query behavior, so integration only replaces input markup and preserves current request parameters.

**Tech Stack:** React 19, TypeScript 5.9, react-day-picker 9, date-fns 4, Radix Popover, Tailwind CSS 3, Playwright CLI.

## Global Constraints

- Date filters submit `YYYY-MM-DD` only; no time or timezone values.
- Range mode shows two months on desktop and one month on narrow screens.
- Range presets are 今天、昨天、本月、上月、最近7天、最近30天、最近90天、最近1年、本年、去年.
- Business data-entry dates are unchanged.
- Existing query keys, pagination resets, and API parameter names are preserved.

---

### Task 1: Shared Date Filter Component

**Files:**
- Create: `app/src/components/ui/date-filter-picker.tsx`
- Create: `app/src/lib/date-filter.ts`
- Test: `app/src/lib/date-filter.test.ts`
- Modify: `app/package.json`
- Modify: `app/package-lock.json`

**Interfaces:**
- Produces: `DateFilterValue = { startDate: string; endDate: string }`
- Produces: `getDatePreset(key: DatePresetKey, now?: Date): DateFilterValue`
- Produces: `DateFilterPicker` props with controlled `startDate`, `endDate`, `onChange`, `mode`, `allowClear`, and `className`.

- [ ] **Step 1: Install the focused test runner**

Run: `npm install --save-dev vitest` from `app`.
Expected: `vitest` is recorded in `devDependencies` and the lockfile is updated.

- [ ] **Step 2: Add failing date preset tests**

Cover fixed local date `2026-07-10` for today, yesterday, current month, previous month, rolling 7/30/90/365 days, current year, and previous calendar year. Assert exact `YYYY-MM-DD` boundaries and leap/month boundary behavior.

- [ ] **Step 3: Run the focused tests and confirm failure**

Run: `npx vitest run src/lib/date-filter.test.ts` from `app`.
Expected: FAIL because `date-filter.ts` does not exist.

- [ ] **Step 4: Implement pure date helpers**

Use date-fns local-calendar functions (`startOfDay`, `subDays`, `startOfMonth`, `endOfMonth`, `subMonths`, `startOfYear`, `endOfYear`, `subYears`, `format`, `parseISO`) so UTC conversion cannot shift a selected date.

- [ ] **Step 5: Implement the controlled picker**

Build on the existing `Calendar` and `Popover` components. Range mode renders a preset rail and `mode="range"`; single mode renders `mode="single"`. Use `zhCN`, a calendar icon trigger, stable cell sizing, Chinese labels, clear action, and responsive one/two-month behavior.

- [ ] **Step 6: Run tests and compile**

Run: `npx vitest run src/lib/date-filter.test.ts` and `npm run build` from `app`.
Expected: preset tests pass and TypeScript/Vite build succeeds.

---

### Task 2: Replace Primary List And Analytics Range Filters

**Files:**
- Modify: `app/src/pages/Orders.tsx`
- Modify: `app/src/pages/Analytics.tsx`
- Modify: `app/src/pages/VenueAnalytics.tsx`
- Modify: `app/src/pages/AuditLogs.tsx`
- Modify: `app/src/pages/CouponEffects.tsx`

**Interfaces:**
- Consumes: `DateFilterPicker` range mode.
- Preserves: each page's existing `startDate`/`endDate` or `customStart`/`customEnd` state and pagination reset callbacks.

- [ ] **Step 1: Replace the Orders paired native inputs**

Wire `onChange` to both setters and reset `currentPage` to 1. Keep clearing available because the current page allows an unbounded query.

- [ ] **Step 2: Replace analytics custom-range inputs**

Keep existing preset state values and use the shared picker for the custom range. Do not change analytics request range semantics.

- [ ] **Step 3: Replace audit and coupon-effect paired inputs**

Preserve current query state and pagination behavior.

- [ ] **Step 4: Compile the application**

Run: `npm run build` from `app`.
Expected: build succeeds without unused icon/import errors.

---

### Task 3: Replace Finance And Reconciliation Filters

**Files:**
- Modify: `app/src/pages/Finance.tsx`
- Modify: `app/src/components/ReconExceptionsPanel.tsx`
- Modify: `app/src/components/finance/FinanceComplianceConsole.tsx`

**Interfaces:**
- Consumes: range mode for flow/refund/reconciliation ranges and single mode for daily report/compliance dates.
- Preserves: current request parameters and selected-row/page reset behavior.

- [ ] **Step 1: Replace finance flow and refund range inputs**

Keep `flowPage` and `refundPage` resets and retain empty-range clearing.

- [ ] **Step 2: Replace reconciliation range inputs**

Preserve the current validation that both range boundaries are required before querying.

- [ ] **Step 3: Replace finance single-day controls**

Use `mode="single"` for daily reports and compliance controls. Do not widen these API requests to ranges.

- [ ] **Step 4: Compile the application**

Run: `npm run build` from `app`.
Expected: build succeeds and finance query typings remain unchanged.

---

### Task 4: Replace Remaining Single-Day Filters And Verify Scope

**Files:**
- Modify: `app/src/components/DeviceLogPanel.tsx`
- Verify unchanged: business-entry inputs in `Booking.tsx`, `Orders.tsx`, `Users.tsx`, `Equipment.tsx`, `Venues.tsx`, `Redeem.tsx`, and `GroupRedeemModal.tsx`.

**Interfaces:**
- Consumes: `DateFilterPicker` single mode.

- [ ] **Step 1: Replace device-log single-day filter**

Preserve the current `selectedDate` state and query behavior.

- [ ] **Step 2: Audit remaining native date inputs**

Run a source search for `type="date"`. Confirm every remaining occurrence is a business data-entry date listed in the design scope.

- [ ] **Step 3: Run full B-side verification**

Run: `npm run build` from `app`.
Expected: TypeScript and Vite build succeed.

- [ ] **Step 4: Run browser regression**

At `http://127.0.0.1:5175`, verify Orders, Analytics, Finance, Audit Logs, and Device Logs. Check Chinese labels, preset values, query refresh, clearing, popover boundaries, selected-range highlighting, desktop two-month layout, and narrow single-month layout.

- [ ] **Step 5: Capture final source and git checks**

Run: `git diff --check` and `git status --short` from the repository root.
Expected: no whitespace errors; unrelated pre-existing changes remain untouched.
