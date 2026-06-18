import { useEffect, useState, useCallback } from 'react'
import {
  readSelectedVenue,
  SELECTED_VENUE_CHANGE_EVENT,
  SELECTED_VENUE_KEY,
  saveSelectedVenue as saveSelectedVenueUtil,
  setSelectedVenueSnapshot,
  type SelectedVenue,
} from '@/lib/selectedVenue'

export function useSelectedVenue() {
  const [selectedVenue, setLocalSelectedVenue] = useState<SelectedVenue | null>(() => readSelectedVenue())

  useEffect(() => {
    const handleChange = (event: Event) => {
      const next = event instanceof CustomEvent ? (event.detail as SelectedVenue | null) : readSelectedVenue()
      setLocalSelectedVenue(next)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SELECTED_VENUE_KEY) {
        setLocalSelectedVenue(readSelectedVenue())
      }
    }

    window.addEventListener(SELECTED_VENUE_CHANGE_EVENT, handleChange)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(SELECTED_VENUE_CHANGE_EVENT, handleChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const saveSelectedVenue = useCallback((venue: Parameters<typeof saveSelectedVenueUtil>[0]) => {
    const next = saveSelectedVenueUtil(venue)
    setLocalSelectedVenue(next)
    return next
  }, [])

  const setSelectedVenue = useCallback((venue: SelectedVenue | null) => {
    setSelectedVenueSnapshot(venue)
    setLocalSelectedVenue(venue)
  }, [])

  return [selectedVenue, setSelectedVenue, saveSelectedVenue] as const
}
