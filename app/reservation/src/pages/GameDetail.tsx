import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  Clock,
  Users,
  MapPin,
  ChevronRight,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getGame } from '@/api/games'
import { getImageUrl } from '@/lib/imageUrl'
import { getBookingTargetPath } from '@/lib/selectedVenue'
import { useScrollContainer } from '@/hooks/useScrollContainer'

type TabKey = 'desc' | 'notice'

export default function GameDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('desc')
  const [scrollY, setScrollY] = useState(0)
  const scrollContainerRef = useScrollContainer()

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', id],
    queryFn: () => getGame(id!),
    enabled: !!id,
  })

  useEffect(() => {
    const el = scrollContainerRef.current
    const onScroll = () => setScrollY(el ? el.scrollTop : window.scrollY)
    const target = el || window
    target.addEventListener('scroll', onScroll)
    return () => target.removeEventListener('scroll', onScroll)
  }, [scrollContainerRef])

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-[100dvh] bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-muted)]">
        游戏不存在
      </div>
    )
  }

  const headerBg = scrollY > 200 ? 'bg-[var(--bg-primary)]/95 backdrop-blur-md shadow-lg' : 'bg-transparent'
  const showHeaderTitle = scrollY > 200
  const detailImages = game.detailImages || []
  const hasIntroMedia = Boolean(game.videoUrl) || detailImages.length > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-[100dvh] bg-[var(--bg-primary)] pb-24"
    >
      {/* Fixed Header */}
      <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${headerBg}`}>
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-12">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-base font-semibold transition-opacity duration-300 ${showHeaderTitle ? 'text-white opacity-100' : 'opacity-0'}`}>
            游戏详情
          </h1>
          <div className="w-8" />
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {/* Hero Cover - 4:3 landscape */}
        <div className="relative w-full aspect-[4/3]">
          <img
            src={game.coverImage ? getImageUrl(game.coverImage) : '/venue-cyber.jpg'}
            alt={game.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-transparent to-black/20" />
          {/* Price Badge */}
          <div className="absolute top-14 right-4 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-sm font-bold">
            ¥{(game.price / 100).toFixed(2)}<span className="text-xs font-normal opacity-80">/人</span>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-5 -mt-6 relative z-10">
          <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border-subtle)] shadow-lg">
            <h2 className="text-xl font-bold text-[var(--text-primary)] leading-snug">
              {game.title}
            </h2>
            {game.subtitle && (
              <p className="text-xs text-[var(--text-secondary)] mt-1">{game.subtitle}</p>
            )}

            {/* Tags */}
            {game.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {game.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-0.5 rounded-md bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[11px] font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Price & Bookings */}
            <div className="flex items-end justify-between mt-3">
              <p className="text-xl font-bold text-[var(--error)]">
                ¥{(game.price / 100).toFixed(2)}
                <span className="text-xs font-normal text-[var(--text-muted)]">/人</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                <Users className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                {game.bookedPeopleCount ?? 0}人订过
              </p>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-3 px-5 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {game.duration}分钟
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {game.minPlayers}-{game.maxPlayers}人
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            VR大空间
          </span>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between mt-4 px-5">
          <button
            onClick={() => navigate('/group-booking-rules')}
            className="flex items-center gap-1 text-xs text-[var(--accent-primary)]"
          >
            <span className="text-[var(--text-secondary)]">可拼场</span>
            <span>拼场规则</span>
            <ChevronRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => navigate(getBookingTargetPath(game.id))}
            className="px-4 py-1.5 rounded-lg bg-[var(--error)] text-white text-xs font-medium active:scale-95 transition-transform"
          >
            发起拼场
          </button>
        </div>

        {/* Tabs */}
        <div className="sticky top-12 z-40 bg-[var(--bg-primary)] mt-5">
          <div className="flex border-b border-[var(--border-subtle)]">
            {([
              { key: 'desc' as TabKey, label: '描述', icon: FileText },
              { key: 'notice' as TabKey, label: '须知', icon: AlertCircle },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                  activeTab === t.key
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
                {activeTab === t.key && (
                  <motion.div
                    layoutId="game-tab"
                    className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[var(--accent-primary)] rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="px-5 pt-4">
          <AnimatePresence mode="wait">
            {activeTab === 'desc' && (
              <motion.div
                key="desc"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Description Text */}
                {game.description && (
                  <div className="mb-5">
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                      {game.description}
                    </p>
                  </div>
                )}

                {/* Detail media - video first, images as supplement/fallback */}
                {hasIntroMedia && (
                  <div className="mb-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">游戏画面</h4>
                    <div className="space-y-3">
                      {game.videoUrl && (
                        <div className="w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-black">
                          <video
                            src={getImageUrl(game.videoUrl, '')}
                            poster={game.coverImage ? getImageUrl(game.coverImage) : undefined}
                            className="w-full aspect-video object-contain"
                            controls
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        </div>
                      )}
                      {detailImages.length > 0 && (
                        <div className="space-y-3 max-h-[55vh] overflow-y-auto rounded-xl">
                          {detailImages.map((url, idx) => (
                            <div
                              key={idx}
                              className="w-full rounded-xl overflow-hidden border border-[var(--border-subtle)]"
                            >
                              <img
                                src={getImageUrl(url)}
                                alt={`画面 ${idx + 1}`}
                                className="w-full h-auto object-contain"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'notice' && (
              <motion.div
                key="notice"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {game.notice ? (
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-subtle)]">
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                      {game.notice}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                    <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">暂无须知内容</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Fixed Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-primary)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] px-5 py-3 safe-bottom">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => navigate(getBookingTargetPath(game.id))}
            className="w-full h-12 rounded-xl bg-gradient-accent text-white text-base font-semibold shadow-glow active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <ChevronRight className="w-4 h-4" />
            选择场次并预订
          </button>
        </div>
      </div>
    </motion.div>
  )
}
