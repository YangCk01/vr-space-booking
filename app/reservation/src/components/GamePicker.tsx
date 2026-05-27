import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, MapPin } from 'lucide-react'
import { getGames } from '@/api/games'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'

interface GamePickerProps {
  onSelect: (gameId: string, gamePrice: number) => void
  onClose: () => void
}

export default function GamePicker({ onSelect, onClose }: GamePickerProps) {
  const { data: games, isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: () => getGames(),
  })

  const activeGames = useMemo(() => {
    return (games || []).filter((g) => g.status === 'ACTIVE')
  }, [games])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-[var(--bg-primary)] rounded-t-3xl border-t border-[var(--border-subtle)] max-h-[85dvh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="w-10" />
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">选择体验游戏</h3>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Game list */}
          <div className="flex-1 overflow-y-auto px-5 space-y-3" style={{ paddingBottom: 'calc(6rem + var(--safe-bottom))' }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activeGames.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
                <p className="text-sm">暂无可预约游戏</p>
              </div>
            ) : (
              activeGames.map((game, i) => (
                <motion.button
                  key={game.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => onSelect(game.id, game.price / 100)}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all',
                    'bg-[var(--bg-card)] border-[var(--border-subtle)]',
                    'hover:border-[var(--accent-primary)] hover:shadow-glow active:scale-[0.98]',
                  )}
                >
                  {/* Cover */}
                  <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-[var(--bg-elevated)]">
                    <img
                      src={game.coverImage ? getImageUrl(game.coverImage) : '/venue-cyber.jpg'}
                      alt={game.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-[var(--text-primary)] truncate">
                      {game.title}
                    </h4>
                    {game.subtitle && (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                        {game.subtitle}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {game.duration}分钟
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        VR大空间体验
                      </span>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="shrink-0 text-right">
                    <span className="text-lg font-bold text-[var(--accent-primary)]">
                      ¥{(game.price / 100).toFixed(0)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">/人</span>
                  </div>
                </motion.button>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
