import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Venue } from '@/api/venues'
import { getImageUrl } from '@/lib/imageUrl'
import { saveSelectedVenue } from '@/lib/selectedVenue'
import { cn } from '@/lib/utils'

function isWithinMaintenanceWindow(venue: Venue): boolean {
  if (venue.status !== 'MAINTENANCE') return false
  if (!venue.maintenanceStartDate || !venue.maintenanceEndDate || !venue.maintenanceStartTime || !venue.maintenanceEndTime) {
    return false
  }
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const timeStr = now.toTimeString().slice(0, 5)
  const startDate = venue.maintenanceStartDate.slice(0, 10)
  const endDate = venue.maintenanceEndDate.slice(0, 10)
  if (dateStr < startDate || dateStr > endDate) return false
  if (dateStr === startDate && timeStr < venue.maintenanceStartTime) return false
  if (dateStr === endDate && timeStr > venue.maintenanceEndTime) return false
  return true
}

function getEffectiveStatus(venue: Partial<Venue>): string {
  if (venue.status === 'DISABLED') return 'DISABLED'
  if (isWithinMaintenanceWindow(venue as Venue)) return 'MAINTENANCE'
  return venue.status === 'IN_USE' ? 'IN_USE' : 'FREE'
}

interface VenueCardProps {
  id: string
  name: string
  theme?: string
  image?: string | null
  area?: number
  capacity?: number
  status?: string
  index?: number
  gameId?: string | null
  groupBuy?: string | null
  venue?: Pick<Venue, 'id' | 'name'> & Partial<Venue>
}

export default function VenueCard({
  id,
  name,
  theme,
  image,
  area,
  capacity,
  status,
  index = 0,
  gameId,
  groupBuy,
  venue,
}: VenueCardProps) {
  const navigate = useNavigate()

  const statusMap: Record<string, { text: string; color: string }> = {
    FREE: { text: '可预约', color: 'text-[var(--success)]' },
    IN_USE: { text: '使用中', color: 'text-[var(--warning)]' },
    MAINTENANCE: { text: '维护中', color: 'text-[var(--warning)]' },
    DISABLED: { text: '暂停', color: 'text-[var(--text-muted)]' },
  }
  const effectiveStatus = venue ? getEffectiveStatus(venue) : (status || 'FREE')
  const s = statusMap[effectiveStatus] || statusMap.FREE

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0, 0, 0.2, 1] }}
      onClick={() => {
        saveSelectedVenue(venue || { id, name, theme, image, area, capacity, status })
        const params = new URLSearchParams()
        if (gameId) params.set('gameId', gameId)
        if (groupBuy) params.set('groupBuy', groupBuy)
        const qs = params.toString()
        navigate(qs ? `/venue/${id}?${qs}` : `/venue/${id}`)
      }}
      className={cn(
        'relative flex items-center gap-4 p-3 rounded-2xl border transition-all duration-300 cursor-pointer',
        'bg-white border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)]',
        'hover:border-[var(--accent-primary)] hover:shadow-glow',
      )}
    >
      {/* Cover */}
      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-[var(--bg-elevated)]">
        <img src={getImageUrl(image)} alt={name} className="w-full h-full object-cover" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">{name}</h3>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-1">
          {theme || '沉浸式 VR 体验空间'}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          {area ? `${area}㎡` : ''} {area && capacity ? '·' : ''} {capacity ? `容纳${capacity}人` : ''}
        </p>
      </div>

      {/* Right */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className={cn('text-xs font-medium', s.color)}>{s.text}</span>
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </motion.div>
  )
}
