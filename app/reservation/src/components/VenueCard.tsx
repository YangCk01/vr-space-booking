import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'

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
}: VenueCardProps) {
  const navigate = useNavigate()

  const statusMap: Record<string, { text: string; color: string }> = {
    FREE: { text: '可预约', color: 'text-[var(--success)]' },
    IN_USE: { text: '使用中', color: 'text-[var(--warning)]' },
    MAINTENANCE: { text: '维护中', color: 'text-[var(--warning)]' },
    DISABLED: { text: '暂停', color: 'text-[var(--text-muted)]' },
  }
  const s = statusMap[status || 'FREE'] || statusMap.FREE

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0, 0, 0.2, 1] }}
      onClick={() => navigate(gameId ? `/venue/${id}?gameId=${gameId}` : `/venue/${id}`)}
      className={cn(
        'relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 cursor-pointer',
        'bg-[var(--bg-card)] border-[var(--border-subtle)]',
        'hover:border-[var(--accent-primary)] hover:shadow-glow',
      )}
    >
      {/* Cover */}
      <div className="w-24 h-20 rounded-xl overflow-hidden shrink-0 bg-[var(--bg-elevated)]">
        <img src={getImageUrl(image)} alt={name} className="w-full h-full object-cover" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">{name}</h3>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
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
