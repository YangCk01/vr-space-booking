import type { Venue } from '@/api/venues'

export type SelectedVenue = Pick<Venue, 'id' | 'name' | 'address'> & {
  latitude?: number | null
  longitude?: number | null
}

export const SELECTED_VENUE_KEY = 'reservation:selectedVenue'

export function readSelectedVenue(): SelectedVenue | null {
  try {
    const raw = localStorage.getItem(SELECTED_VENUE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSelectedVenue(venue: Venue) {
  const nextVenue: SelectedVenue = {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    latitude: (venue as any).latitude ?? (venue as any).lat ?? null,
    longitude: (venue as any).longitude ?? (venue as any).lng ?? null,
  }
  localStorage.setItem(SELECTED_VENUE_KEY, JSON.stringify(nextVenue))
  return nextVenue
}

export function getBookingTargetPath(gameId: string) {
  const selectedVenue = readSelectedVenue()
  if (selectedVenue?.id) {
    return `/venue/${selectedVenue.id}?gameId=${gameId}`
  }
  return `/venues?mode=venue&gameId=${gameId}`
}
