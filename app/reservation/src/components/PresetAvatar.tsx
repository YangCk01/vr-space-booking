import { cn } from '@/lib/utils'

const PRESET_AVATARS = [
  <svg key="1" viewBox="0 0 100 100" className="w-full h-full">
    <defs>
      <linearGradient id="pa1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#a855f7" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#pa1)" />
    <circle cx="50" cy="42" r="18" fill="#fff" opacity="0.9" />
    <path d="M32 62c0-10 40-10 40 0v6c0 4-4 8-8 8H40c-4 0-8-4-8-8z" fill="#fff" opacity="0.9" />
  </svg>,
  <svg key="2" viewBox="0 0 100 100" className="w-full h-full">
    <defs>
      <linearGradient id="pa2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#14b8a6" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#pa2)" />
    <polygon points="50,28 58,44 76,44 62,56 68,74 50,62 32,74 38,56 24,44 42,44" fill="#fff" opacity="0.9" />
  </svg>,
  <svg key="3" viewBox="0 0 100 100" className="w-full h-full">
    <defs>
      <linearGradient id="pa3" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f97316" />
        <stop offset="100%" stopColor="#ef4444" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#pa3)" />
    <polygon points="50,26 74,50 50,74 26,50" fill="#fff" opacity="0.9" />
  </svg>,
  <svg key="4" viewBox="0 0 100 100" className="w-full h-full">
    <defs>
      <linearGradient id="pa4" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#f43f5e" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#pa4)" />
    <path d="M50 30c8 0 14 6 18 14 4 8 3 18-4 24-6 6-16 8-24 4-8-4-12-12-12-21 0-12 10-21 22-21z" fill="#fff" opacity="0.9" />
  </svg>,
  <svg key="5" viewBox="0 0 100 100" className="w-full h-full">
    <defs>
      <linearGradient id="pa5" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#pa5)" />
    <polygon points="50,22 70,34 70,58 50,70 30,58 30,34" fill="#fff" opacity="0.9" />
  </svg>,
  <svg key="6" viewBox="0 0 100 100" className="w-full h-full">
    <defs>
      <linearGradient id="pa6" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#pa6)" />
    <polygon points="50,24 72,72 28,72" fill="#fff" opacity="0.9" />
  </svg>,
]

export function presetIndexFor(seed?: string | null) {
  if (!seed) return 0
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0
  }
  return hash % PRESET_AVATARS.length
}

export default function PresetAvatar({ seed, className }: { seed?: string | null; className?: string }) {
  const index = presetIndexFor(seed)
  return (
    <div className={cn('rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-blue-500', className)}>
      {PRESET_AVATARS[index]}
    </div>
  )
}
