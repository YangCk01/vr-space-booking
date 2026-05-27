const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export function getImageUrl(image?: string | null, fallback = '/venue-a.jpg'): string {
  if (!image) return fallback
  if (image.startsWith('http')) return image
  if (image.startsWith('/uploads/')) return `${API_BASE}${image}`
  return image
}
