import { applyVenueScope, ScopedUser } from './venueScope'

export interface AnalyticsVenueScope {
  empty: boolean
  venueWhere: Record<string, any>
  bookingWhere: Record<string, any>
}

export function resolveAnalyticsVenueScope(
  user: ScopedUser | undefined,
  requestedVenueId?: string | null,
): AnalyticsVenueScope {
  const baseWhere = requestedVenueId ? { venueId: requestedVenueId } : {}
  const scoped = applyVenueScope(baseWhere, user)
  if (scoped.empty) {
    return {
      empty: true,
      venueWhere: { id: { in: [] } },
      bookingWhere: { venueId: { in: [] } },
    }
  }

  const venueFilter = scoped.where.venueId
  if (!venueFilter) {
    return { empty: false, venueWhere: {}, bookingWhere: {} }
  }

  return {
    empty: false,
    venueWhere: { id: venueFilter },
    bookingWhere: { venueId: venueFilter },
  }
}
