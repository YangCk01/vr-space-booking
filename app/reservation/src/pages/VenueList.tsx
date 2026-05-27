import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, MapPin } from 'lucide-react'
import { getVenues } from '@/api/venues'
import VenueCard from '@/components/VenueCard'

export default function VenueList() {
  const [searchParams] = useSearchParams()
  const gameId = searchParams.get('gameId')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['venues'],
    queryFn: () => getVenues(),
  })

  const venues = (data?.data || []).filter((v: any) => {
    if (search) {
      const s = search.toLowerCase()
      return v.name?.toLowerCase().includes(s) || v.theme?.toLowerCase().includes(s)
    }
    return true
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pb-nav"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center gap-1 text-[var(--text-secondary)] mb-3">
            <MapPin className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-medium">选择体验场地</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索场地或主题名称"
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Venue list */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : venues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
            <p className="text-sm">暂无场地</p>
          </div>
        ) : (
          venues.map((v: any, i: number) => (
            <VenueCard
              key={v.id}
              id={v.id}
              name={v.name}
              theme={v.theme}
              image={v.image}
              area={v.area}
              capacity={v.capacity}
              status={v.status}
              index={i}
              gameId={gameId}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}
