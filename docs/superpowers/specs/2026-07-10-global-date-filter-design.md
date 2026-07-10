# Global Date Filter Design

## Goal

Unify all B-side query and analytics date filters around one Chinese date picker. Date-only filters must never expose or submit time-of-day values.

## Scope

Replace date controls used to filter existing data, including:

- Orders
- Analytics and venue analytics custom ranges
- Audit logs
- Coupon-effect reports
- Finance flows, refunds, daily reports, and reconciliation filters
- Reconciliation exceptions
- Device logs

Do not replace business data-entry fields, including birthdays, equipment purchase and warranty dates, venue maintenance periods, booking dates, reschedule dates, redemption dates, and campaign start or end times.

## Component Design

Create a shared `DateFilterPicker` with two modes:

- `range`: accepts `startDate` and `endDate`; shows two calendar months on desktop and one on narrow screens.
- `single`: accepts one date; uses the same trigger, Chinese calendar, spacing, colors, and accessibility behavior.

The range popover contains these shortcuts:

- Today
- Yesterday
- This month
- Last month
- Last 7 days
- Last 30 days
- Last 90 days
- Last year (rolling year)
- This year
- Previous calendar year

The trigger displays `YYYY/MM/DD - YYYY/MM/DD` for a range and `YYYY/MM/DD` for a single day. Internal values remain `YYYY-MM-DD` to preserve current API contracts.

## Interaction

- Selecting a shortcut applies the complete range and closes the popover.
- Selecting two calendar dates applies the range after the end date is selected.
- A clear action is available when the consumer allows empty filters.
- The component corrects reversed manual range selection through the calendar's range semantics.
- Weekday and month labels are Chinese.
- No hour, minute, second, or timezone control is shown.

## Integration

Pages continue to own query state and pagination resets. The shared picker emits date strings through callbacks; it does not fetch data or know API details. Existing query keys and request parameters remain unchanged unless a current single-day filter already maps the same selected date to both boundaries.

## Responsive And Visual Rules

- Desktop: shortcut rail plus two months.
- Narrow viewport: shortcut rail becomes a compact horizontal list and the calendar shows one month.
- Popover stays within the viewport and uses the existing admin theme tokens.
- Date cells have stable dimensions and selected ranges use the existing primary blue.

## Verification

- Build the B-side application with TypeScript checks.
- Search again for date inputs to confirm only approved business-entry fields remain.
- Test the orders range, one analytics range, one finance range, and one single-day filter in a browser.
- Check desktop and narrow viewport screenshots for clipping, overlap, and correct Chinese labels.
