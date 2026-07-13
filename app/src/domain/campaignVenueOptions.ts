export interface SelectableVenue {
  id: string
  name: string
  status: string
}

export function selectableVenuesFromResponse<T extends SelectableVenue>(response: {
  data?: T[] | { list?: T[] }
} | undefined): T[] {
  const data = response?.data
  const venues = Array.isArray(data) ? data : data?.list || []
  return venues.filter((venue) => venue.status !== 'DISABLED')
}
