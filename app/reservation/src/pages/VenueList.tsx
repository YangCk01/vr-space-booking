import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, MapPin, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { getVenues } from '@/api/venues'
import { getGames } from '@/api/games'
import { getImageUrl } from '@/lib/imageUrl'
import { getBookingTargetPath } from '@/lib/selectedVenue'
import VenueCard from '@/components/VenueCard'

export default function VenueList() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const gameId = searchParams.get('gameId')
  const mode = searchParams.get('mode')
  const [search, setSearch] = useState('')
  const choosingVenue = mode === 'venue' && !!gameId

  const { data: venueData, isLoading: venueLoading } = useQuery({
    queryKey: ['venues'],
    queryFn: () => getVenues(),
    enabled: choosingVenue,
  })

  const { data: gameData, isLoading: gameLoading } = useQuery({
    queryKey: ['games'],
    queryFn: () => getGames(),
    enabled: !choosingVenue,
  })

  const venues = (venueData?.data || []).filter((v: any) => {
    if (search) {
      const s = search.toLowerCase()
      return v.name?.toLowerCase().includes(s) || v.theme?.toLowerCase().includes(s)
    }
    return true
  })
  const games = (gameData || []).filter((g: any) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      g.title?.toLowerCase().includes(s) ||
      g.subtitle?.toLowerCase().includes(s) ||
      g.tags?.some((t: string) => t.toLowerCase().includes(s))
    )
  })
  const isLoading = choosingVenue ? venueLoading : gameLoading

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pb-nav"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-[var(--text-primary)]"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--accent-primary)]" />
              <span className="text-sm font-semibold">{choosingVenue ? '选择体验场地' : '体验项目'}</span>
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={choosingVenue ? '搜索门店或主题名称' : '搜索 VR 体验项目'}
              className="w-full h-10 pl-9 pr-4 rounded-full bg-[var(--bg-elevated)] border border-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : choosingVenue && venues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
            <p className="text-sm">暂无场地</p>
          </div>
        ) : choosingVenue ? (
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
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
            <p className="text-sm">暂无体验项目</p>
          </div>
        ) : (
          games.map((game: any, i: number) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.35 }}
              onClick={() => navigate(`/game/${game.id}`)}
              className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden cursor-pointer"
            >
              <div className="relative aspect-[16/10] bg-[var(--bg-elevated)]">
                <img
                  src={game.coverImage ? getImageUrl(game.coverImage) : '/venue-cyber.jpg'}
                  alt={game.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute left-3 top-3 flex gap-1.5">
                  {(game.tags || []).slice(0, 2).map((tag: string) => (
                    <span key={tag} className="px-2 py-1 rounded-md bg-[var(--accent-primary)] text-white text-[10px] font-bold">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-[var(--text-primary)] truncate">{game.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                      {game.subtitle || game.description || '沉浸式 VR 大空间体验'}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-elevated)] text-[10px] text-[var(--text-secondary)]">
                    <Clock className="w-3 h-3" />{game.duration}分钟
                  </span>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-black text-[var(--accent-primary)]">¥{(game.price / 100).toFixed(0)}</span>
                    <span className="text-xs text-[var(--text-disabled)] line-through">¥{Math.round((game.price / 100) * 1.35)}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(getBookingTargetPath(game.id))
                    }}
                    className="px-4 py-2 rounded-full bg-gradient-accent text-white text-xs font-bold shadow-glow-sm inline-flex items-center gap-1"
                  >
                    立即预约 <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}
