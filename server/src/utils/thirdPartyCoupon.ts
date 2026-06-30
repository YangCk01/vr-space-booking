export function normalizeThirdPartyCouponCode(input: unknown): string {
  const raw = String(input || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(raw)
    const fromQuery =
      url.searchParams.get('code') ||
      url.searchParams.get('coupon') ||
      url.searchParams.get('voucher') ||
      url.searchParams.get('ticket')
    if (fromQuery) return fromQuery.trim().toUpperCase()

    const lastPath = url.pathname.split('/').filter(Boolean).pop()
    if (lastPath) return lastPath.trim().toUpperCase()
  } catch {
    // Plain coupon code.
  }

  return raw.toUpperCase()
}
