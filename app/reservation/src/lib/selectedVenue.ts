import type { Venue } from '@/api/venues'

export type SelectedVenue = Pick<Venue, 'id' | 'name' | 'address'> & {
  latitude?: number | null
  longitude?: number | null
}

export const SELECTED_VENUE_KEY = 'reservation:selectedVenue'
export const SELECTED_VENUE_CHANGE_EVENT = 'reservation:selectedVenue:change'

const listeners = new Set<() => void>()

function readSelectedVenueFromStorage(): SelectedVenue | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SELECTED_VENUE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let selectedVenueSnapshot = readSelectedVenueFromStorage()

function updateSelectedVenueSnapshot(nextVenue: SelectedVenue | null) {
  selectedVenueSnapshot = nextVenue
  listeners.forEach((listener) => listener())
}

export function readSelectedVenue(): SelectedVenue | null {
  return selectedVenueSnapshot
}

export function subscribeSelectedVenue(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function syncSelectedVenueFromStorage() {
  updateSelectedVenueSnapshot(readSelectedVenueFromStorage())
}

export function setSelectedVenueSnapshot(nextVenue: SelectedVenue | null) {
  updateSelectedVenueSnapshot(nextVenue)
}

export function saveSelectedVenue(venue: Pick<Venue, 'id' | 'name'> & Partial<Venue>) {
  const nextVenue: SelectedVenue = {
    id: venue.id,
    name: venue.name,
    address: venue.address ?? null,
    latitude: (venue as any).latitude ?? (venue as any).lat ?? null,
    longitude: (venue as any).longitude ?? (venue as any).lng ?? null,
  }
  localStorage.setItem(SELECTED_VENUE_KEY, JSON.stringify(nextVenue))
  updateSelectedVenueSnapshot(nextVenue)
  window.dispatchEvent(new CustomEvent(SELECTED_VENUE_CHANGE_EVENT, { detail: nextVenue }))
  return nextVenue
}

export function getBookingTargetPath(gameId: string) {
  const selectedVenue = readSelectedVenue()
  if (selectedVenue?.id) {
    return `/venue/${selectedVenue.id}?gameId=${gameId}`
  }
  return `/venues?mode=venue&gameId=${gameId}`
}
