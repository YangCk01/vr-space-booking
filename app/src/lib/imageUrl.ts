const currentPort = window.location.port
const isDevEnv = currentPort === '5175' || currentPort === '5176'
const defaultApiBase = isDevEnv
  ? 'http://localhost:4001'
  : 'http://192.168.2.200:4000'

const API_BASE = import.meta.env.VITE_API_BASE_URL || defaultApiBase

export function getImageUrl(image?: string | null, fallback = '/venue-a.jpg'): string {
  if (!image) return fallback
  if (image.startsWith('http')) return image
  if (image.startsWith('/uploads/')) return `${API_BASE}${image}`
  return image
}
