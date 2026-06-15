import { API_BASE_HOST } from './apiBase'

export function getImageUrl(image?: string | null, fallback = '/venue-a.jpg'): string {
  if (!image) return fallback
  if (image.startsWith('http')) {
    try {
      const url = new URL(image)
      if (url.pathname.startsWith('/uploads/')) return `${API_BASE_HOST}${url.pathname}`
    } catch {
      return image
    }
    return image
  }
  if (image.startsWith('/uploads/')) return `${API_BASE_HOST}${image}`
  return image
}
