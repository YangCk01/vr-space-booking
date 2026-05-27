import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Search, Gamepad2, Clock, Tag, MapPin, Bell, Images } from 'lucide-react'
import { getGames } from '@/api/games'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'
import { getNotifications, getUnreadCount, markAllRead, clearAllNotifications } from '@/api/notifications'

export default function Home() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showNotify, setShowNotify] = useState(false)

  const { data: games, isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: () => getGames(),
  })

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadCount,
    refetchInterval: 30000,
  })

  const { data: notifyData } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => getNotifications({ pageSize: 20 }),
    enabled: showNotify,
  })
  const notifications = notifyData?.data || []

  const markAllReadMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const filteredGames = games?.filter((g) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      g.title.toLowerCase().includes(s) ||
      (g.subtitle && g.subtitle.toLowerCase().includes(s)) ||
      g.tags.some((t) => t.toLowerCase().includes(s))
    )
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1 text-[var(--text-secondary)]">
              <Gamepad2 className="w-4 h-4 text-[var(--accent-primary)]" />
              <span className="text-sm font-medium">游戏介绍</span>
            </div>

            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotify((v) => !v)}
                className="relative p-1.5 text-[var(--text-secondary)] active:text-[var(--accent-primary)] transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 min-w-[14px] h-[14px] px-0.5 bg-[#EF4444] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotify && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xl z-50 overflow-hidden"
                    style={{ maxHeight: '70vh' }}
                  >
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <p className="text-sm text-[var(--text-primary)] font-semibold">消息通知</p>
                      <div className="flex items-center gap-3">
                        {unreadCount > 0 && (
                          <button
                            onClick={() => markAllReadMutation.mutate()}
                            className="text-xs text-[var(--accent-primary)] hover:underline"
                          >
                            全部已读
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={() => clearAllMutation.mutate()}
                            className="text-xs text-[#EF4444] hover:underline"
                          >
                            清除
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-[var(--text-muted)]">
                          <Bell className="w-8 h-8 mb-2 opacity-30" />
                          <p className="text-sm">暂无通知</p>
                        </div>
                      ) : (
                        notifications.map((n: any) => (
                          <div
                            key={n.id}
                            className={`px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 ${
                              n.read ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-[var(--text-primary)] font-medium flex-1">{n.title}</p>
                              {!n.read && <span className="w-2 h-2 bg-[#EF4444] rounded-full shrink-0 mt-1" />}
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">{n.content}</p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">
                              {n.createdAt ? new Date(n.createdAt).toLocaleString('zh-CN') : ''}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索游戏名称或标签"
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Game list */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredGames?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
            <Gamepad2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无游戏内容</p>
          </div>
        ) : (
          filteredGames?.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden"
            >
              {/* Cover Image - 4:3 landscape */}
              <div className="relative w-full aspect-[4/3]">
                <img
                  src={game.coverImage ? getImageUrl(game.coverImage) : '/venue-cyber.jpg'}
                  alt={game.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent" />
                {/* Price badge */}
                <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-semibold">
                  ¥{(game.price / 100).toFixed(0)}/人
                </div>
              </div>

              {/* Content */}
              <div className="px-4 pb-4 -mt-6 relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">{game.title}</h3>
                    {game.subtitle && (
                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{game.subtitle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/game/${game.id}`)}
                      className="shrink-0 h-9 px-3 rounded-xl border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] text-sm font-medium hover:bg-[var(--accent-primary)]/10 active:scale-[0.97] transition-all flex items-center gap-1"
                    >
                      <Images className="w-3.5 h-3.5" />
                      介绍
                    </button>
                    <button
                      onClick={() => navigate(`/venues?gameId=${game.id}`)}
                      className="shrink-0 h-9 px-4 rounded-xl bg-gradient-accent text-white text-sm font-semibold shadow-glow hover:shadow-glow-sm active:scale-[0.97] transition-all"
                    >
                      预约
                    </button>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {game.duration}分钟
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    VR大空间体验
                  </span>
                </div>

                {/* Description */}
                {game.description && (
                  <p className="text-sm text-[var(--text-secondary)] mt-2 line-clamp-2 leading-relaxed">
                    {game.description}
                  </p>
                )}

                {/* Tags */}
                {game.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {game.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>


    </motion.div>
  )
}
