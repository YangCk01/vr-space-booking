import type { UserRole } from '@prisma/client'

export interface ScopedUser {
  id: string
  role: UserRole
  managedVenueIds?: string[]
}

export type VenueScope =
  | { kind: 'GLOBAL' }
  | { kind: 'VENUES'; venueIds: string[] }
  | { kind: 'USER'; userId: string }
  | { kind: 'EMPTY' }

export interface ApplyVenueScopeOptions {
  venueField?: string
  userField?: string
}

export interface ApplyVenueScopeResult<T extends Record<string, any>> {
  where: T
  empty: boolean
}

const GLOBAL_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'FINANCE']
const VENUE_SCOPED_ROLES: UserRole[] = ['MANAGER', 'OPERATOR']

export function getVenueScope(user: ScopedUser | undefined): VenueScope {
  if (!user) return { kind: 'EMPTY' }
  if (GLOBAL_ROLES.includes(user.role)) return { kind: 'GLOBAL' }
  if (user.role === 'CUSTOMER') return { kind: 'USER', userId: user.id }
  if (VENUE_SCOPED_ROLES.includes(user.role)) {
    const venueIds = user.managedVenueIds || []
    return venueIds.length > 0 ? { kind: 'VENUES', venueIds } : { kind: 'EMPTY' }
  }
  return { kind: 'EMPTY' }
}

export function applyVenueScope<T extends Record<string, any>>(
  where: T,
  user: ScopedUser | undefined,
  options: ApplyVenueScopeOptions = {}
): ApplyVenueScopeResult<T> {
  const venueField = options.venueField || 'venueId'
  const userField = options.userField || 'userId'
  const scope = getVenueScope(user)

  if (scope.kind === 'GLOBAL') return { where, empty: false }
  if (scope.kind === 'EMPTY') return { where, empty: true }

  if (scope.kind === 'USER') {
    return {
      where: { ...where, [userField]: scope.userId },
      empty: false,
    }
  }

  const requestedVenue = where[venueField]
  if (typeof requestedVenue === 'string') {
    return {
      where,
      empty: !scope.venueIds.includes(requestedVenue),
    }
  }

  if (requestedVenue && typeof requestedVenue === 'object' && Array.isArray(requestedVenue.in)) {
    const intersection = requestedVenue.in.filter((id: string) => scope.venueIds.includes(id))
    return {
      where: { ...where, [venueField]: { in: intersection } },
      empty: intersection.length === 0,
    }
  }

  return {
    where: { ...where, [venueField]: { in: scope.venueIds } },
    empty: false,
  }
}
