export function requireRechargeVenueId(venueId: unknown): string {
  const normalized = typeof venueId === 'string' ? venueId.trim() : ''
  if (!normalized) {
    throw new Error('充值必须选择归属门店')
  }
  return normalized
}
