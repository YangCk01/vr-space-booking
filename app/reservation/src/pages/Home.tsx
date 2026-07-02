import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Search, X, Gamepad2, Clock, MapPin, Zap, Rocket, Ghost, Users, ChevronRight, LocateFixed, XCircle, Crown } from 'lucide-react'
import { getGames } from '@/api/games'
import { getPublicVenues, type Venue } from '@/api/venues'
import { getPublicGroupBuys } from '@/api/groupBuys'
import { getPagePublicSettings } from '@/api/settings'
import { getImageUrl } from '@/lib/imageUrl'
import { useAuth } from '@/providers/AuthProvider'
import { getBookingTargetPath, saveSelectedVenue } from '@/lib/selectedVenue'
import { useSelectedVenue } from '@/hooks/useSelectedVenue'
import { cn } from '@/lib/utils'
import { getNotifications, getUnreadCount, markAllRead, markRead, clearAllNotifications } from '@/api/notifications'
import { NotificationPopover } from '@/components/ui/notification-popover'
import LanguageSelect from '@/components/LanguageSelect'
import PresetAvatar from '@/components/PresetAvatar'

function getDistanceKm(
  from: { latitude: number; longitude: number } | null,
  venue: Venue
) {
  const latitude = Number((venue as any).latitude ?? (venue as any).lat)
  const longitude = Number((venue as any).longitude ?? (venue as any).lng)
  if (!from || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const toRad = (value: number) => value * Math.PI / 180
  const earthRadius = 6371
  const dLat = toRad(latitude - from.latitude)
  const dLng = toRad(longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.latitude)) * Math.cos(toRad(latitude)) * Math.sin(dLng / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function Home() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showNotify, setShowNotify] = useState(false)
  const [venuePickerOpen, setVenuePickerOpen] = useState(false)
  const [venueSearch, setVenueSearch] = useState('')
  const [selectedVenue, setSelectedVenue] = useSelectedVenue()
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState('授权定位后，将优先推荐距离最近的门店。')
  const bannerRef = useRef<HTMLDivElement>(null)
  const notifyWrapRef = useRef<HTMLDivElement>(null)
  const [activeBanner, setActiveBanner] = useState(0)
  const moduleCarouselRef = useRef<HTMLDivElement>(null)
  const [activeModule, setActiveModule] = useState(0)
  const [videoAspectRatios, setVideoAspectRatios] = useState<Record<string, number>>({})
  const { user } = useAuth()

  const avatarUrl = user?.avatar ? getImageUrl(user.avatar) : null

  const getTimeGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return '上午好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }
  const maskPhone = (phone?: string | null) => {
    if (!phone || phone.length < 7) return phone || ''
    return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
  }
  const greetingTitle = user
    ? `${getTimeGreeting()}，${user.name || maskPhone(user.phone)}`
    : '访客用户'

  const { data: games, isLoading } = useQuery({
    queryKey: ['games', selectedVenue?.id || 'all'],
    queryFn: () => getGames(),
  })

  const { data: groupBuyPackages } = useQuery({
    queryKey: ['public-group-buys-home'],
    queryFn: () => getPublicGroupBuys(),
    staleTime: 60000,
  })

  const { data: pageSettings } = useQuery({
    queryKey: ['page-public-settings', selectedVenue?.id || 'all'],
    queryFn: getPagePublicSettings,
    staleTime: 60000,
  })

  const greetingSubtitle = user
    ? (pageSettings?.cHomeGreetingSubtitle || '欢迎回到 VR大空间')
    : '登录 / 注册'

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadCount,
    refetchInterval: 5000,
  })

  const { data: notifyData } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => getNotifications({ pageSize: 20 }),
    refetchInterval: 5000,
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

  const markReadMutation = useMutation({
    mutationFn: markRead,
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

  const { data: venueData, isLoading: venueLoading } = useQuery({
    queryKey: ['venues', 'picker'],
    queryFn: () => getPublicVenues({ pageSize: 100 }),
    enabled: venuePickerOpen,
  })

  const gameBannerItems = (games || []).slice(0, 5)
  const configuredBanners = (pageSettings?.cHomeBannerImages || []).map((b) => ({
    id: b.id,
    title: b.title || 'VR体验',
    subtitle: b.subtitle,
    coverImage: b.imageUrl,
    linkUrl: b.linkUrl,
    badge: b.badge,
  }))
  const bannerItems = configuredBanners.length > 0 ? configuredBanners : gameBannerItems
  const featuredGame = filteredGames?.[0] || games?.[0]
  const getBannerTitle = (game: { title?: string }) => {
    return game.title || 'VR体验'
  }
  const customModules = (pageSettings?.cHomeCustomModules || []).filter((module) => module.enabled !== false)
  const gridModules = customModules.filter((m) => m.layout === 'grid')
  const carouselModules = customModules.filter((m) => m.layout !== 'grid')
  const sectionOrder = useMemo(() => {
    const defaults = [
      { key: "search", enabled: true },
      { key: "banner", enabled: true },
      { key: "category", enabled: true },
      { key: "vip", enabled: true },
      { key: "customModules", enabled: true },
      { key: "groupBuy", enabled: true },
      { key: "hot", enabled: true },
    ]
    const order = Array.isArray(pageSettings?.cHomeSectionOrder) ? pageSettings.cHomeSectionOrder : defaults
    const valid = order.filter((s: any) => typeof s.key === "string")
    // 补齐缺失的默认模块
    const keys = new Set(valid.map((s: any) => s.key))
    for (const def of defaults) {
      if (!keys.has(def.key)) valid.push({ ...def })
    }
    return valid as { key: string; enabled: boolean }[]
  }, [pageSettings?.cHomeSectionOrder])
  const searchEnabled = sectionOrder.find((s: any) => s.key === 'search')?.enabled !== false
  const bannerEnabled = sectionOrder.find((s: any) => s.key === 'banner')?.enabled !== false && pageSettings?.cHomeBannerEnabled !== false
  const tagStylePool = [
    { icon: Gamepad2, color: 'text-blue-500', bg: 'bg-blue-50' },
    { icon: Rocket, color: 'text-violet-500', bg: 'bg-violet-50' },
    { icon: Ghost, color: 'text-rose-500', bg: 'bg-rose-50' },
    { icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  ]
  const categories = Array.from(
    new Set((games || []).flatMap((game) => game.tags || []).filter(Boolean))
  ).slice(0, 4).map((tag, index) => ({
    label: tag,
    keyword: tag,
    ...tagStylePool[index % tagStylePool.length],
  }))

  const pickerVenues = useMemo(() => {
    const keyword = venueSearch.trim().toLowerCase()
    return ((venueData?.data || []) as Venue[])
      .filter((venue) => {
        if (!keyword) return true
        return venue.name?.toLowerCase().includes(keyword)
          || venue.theme?.toLowerCase().includes(keyword)
          || venue.address?.toLowerCase().includes(keyword)
      })
      .map((venue) => ({ venue, distance: getDistanceKm(location, venue) }))
      .sort((a, b) => {
        if (a.distance == null && b.distance == null) return 0
        if (a.distance == null) return 1
        if (b.distance == null) return -1
        return a.distance - b.distance
      })
  }, [venueData, venueSearch, location])

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocationStatus('当前环境暂不支持定位，后续小程序会接入手机定位接口。')
      return
    }
    setLocationStatus('正在请求定位授权...')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setLocationStatus('已获取定位，门店列表已按距离优先排序。')
      },
      () => {
        setLocationStatus('定位授权未开启，可手动选择门店；之后也可以重新授权。')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    )
  }

  const saveVenue = (venue: Venue) => {
    saveSelectedVenue(venue)
    queryClient.setQueryData(['venues', 'contact-detail', venue.id], venue)
    queryClient.invalidateQueries({ queryKey: ['games'] })
    queryClient.invalidateQueries({ queryKey: ['page-public-settings'] })
    queryClient.invalidateQueries({ queryKey: ['venues'] })
    setVenuePickerOpen(false)
  }

  useEffect(() => {
    if (!showNotify) return
    const handler = (e: MouseEvent) => {
      if (notifyWrapRef.current && !notifyWrapRef.current.contains(e.target as Node)) {
        setShowNotify(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showNotify])

  const bannerTimerRef = useRef<number | null>(null)

  const startBannerAutoScroll = useCallback(() => {
    if (bannerItems.length <= 1) return
    if (bannerTimerRef.current) window.clearInterval(bannerTimerRef.current)
    bannerTimerRef.current = window.setInterval(() => {
      const el = bannerRef.current
      if (!el) return
      const current = Math.round(el.scrollLeft / el.clientWidth)
      const next = (current + 1) % bannerItems.length
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 3500)
  }, [bannerItems.length])

  const stopBannerAutoScroll = useCallback(() => {
    if (bannerTimerRef.current) window.clearInterval(bannerTimerRef.current)
    bannerTimerRef.current = null
  }, [])

  const resetBannerAutoScroll = useCallback(() => {
    stopBannerAutoScroll()
    startBannerAutoScroll()
  }, [startBannerAutoScroll, stopBannerAutoScroll])

  useEffect(() => {
    startBannerAutoScroll()
    const onVisibility = () => {
      if (document.hidden) stopBannerAutoScroll()
      else startBannerAutoScroll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopBannerAutoScroll()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [startBannerAutoScroll, stopBannerAutoScroll])

  const handleBannerScroll = () => {
    const el = bannerRef.current
    if (!el || el.clientWidth === 0) return
    setActiveBanner(Math.round(el.scrollLeft / el.clientWidth))
  }

  const moduleTimerRef = useRef<number | null>(null)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  const pauseInactiveModuleVideos = useCallback((activeId?: string) => {
    videoRefs.current.forEach((video, moduleId) => {
      if (moduleId === activeId) return
      video.pause()
      video.preload = 'none'
    })
  }, [])

  const playActiveModuleVideo = useCallback((moduleId?: string) => {
    if (!moduleId || document.hidden) return
    const video = videoRefs.current.get(moduleId)
    if (!video) return

    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      video.load()
    }
    void video.play().catch(() => {
      // Mobile browsers may still defer playback until the next user gesture.
    })
  }, [])

  const scrollModuleTo = useCallback((index: number) => {
    const el = moduleCarouselRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }, [])

  const scrollModuleNext = useCallback(() => {
    const el = moduleCarouselRef.current
    if (!el) return
    const current = Math.round(el.scrollLeft / el.clientWidth)
    const next = (current + 1) % carouselModules.length
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }, [carouselModules.length])

  const startModuleAutoScroll = useCallback(() => {
    if (carouselModules.length <= 1) return
    if (moduleTimerRef.current) window.clearInterval(moduleTimerRef.current)
    moduleTimerRef.current = window.setInterval(() => {
      const el = moduleCarouselRef.current
      if (!el) return
      const current = Math.round(el.scrollLeft / el.clientWidth)
      const currentModule = carouselModules[current]
      if (currentModule?.videoUrl) {
        const video = videoRefs.current.get(currentModule.id)
        if (video && !video.paused && !video.ended && video.currentTime > 0) {
          return
        }
      }
      const next = (current + 1) % carouselModules.length
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 4000)
  }, [carouselModules])

  const stopModuleAutoScroll = useCallback(() => {
    if (moduleTimerRef.current) window.clearInterval(moduleTimerRef.current)
    moduleTimerRef.current = null
  }, [])

  const resetModuleAutoScroll = useCallback(() => {
    stopModuleAutoScroll()
    startModuleAutoScroll()
  }, [startModuleAutoScroll, stopModuleAutoScroll])

  useEffect(() => {
    startModuleAutoScroll()
    const onVisibility = () => {
      if (document.hidden) stopModuleAutoScroll()
      else startModuleAutoScroll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopModuleAutoScroll()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [startModuleAutoScroll, stopModuleAutoScroll])

  const handleModuleScroll = () => {
    const el = moduleCarouselRef.current
    if (!el || el.clientWidth === 0) return
    const nextActive = Math.round(el.scrollLeft / el.clientWidth)
    setActiveModule(nextActive)
  }

  const handleModuleVideoEnded = useCallback(() => {
    scrollModuleNext()
    resetModuleAutoScroll()
  }, [scrollModuleNext, resetModuleAutoScroll])

  const handleVideoLoadedMetadata = useCallback((moduleId: string, video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) {
      setVideoAspectRatios((prev) => ({ ...prev, [moduleId]: video.videoWidth / video.videoHeight }))
    }
  }, [])

  useEffect(() => {
    const active = carouselModules[activeModule]
    pauseInactiveModuleVideos(active?.id)
    if (active?.videoUrl) {
      playActiveModuleVideo(active.id)
    }
  }, [activeModule, carouselModules, pauseInactiveModuleVideos, playActiveModuleVideo])

  useEffect(() => {
    const onVisibility = () => {
      const active = carouselModules[activeModule]
      if (document.hidden) {
        pauseInactiveModuleVideos()
        if (active?.id) videoRefs.current.get(active.id)?.pause()
        return
      }
      if (active?.videoUrl) playActiveModuleVideo(active.id)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [activeModule, carouselModules, pauseInactiveModuleVideos, playActiveModuleVideo])

  const openConfiguredLink = (url?: string) => {
    if (!url) return
    if (url.startsWith('http') || url.startsWith('tel:')) {
      window.location.href = url
      return
    }
    navigate(url)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pb-nav"
    >
      {/* 顶部区域 */}
      {bannerEnabled ? (
        <div className="relative h-[360px]">
          {/* Banner 背景 */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 overflow-hidden z-0">
            {bannerItems[activeBanner]?.coverImage && (
              <img
                src={getImageUrl(bannerItems[activeBanner].coverImage)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent" />
            {/* 星光装饰 */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-10 left-10 w-1 h-1 bg-white rounded-full"></div>
              <div className="absolute top-20 left-32 w-1.5 h-1.5 bg-white rounded-full"></div>
              <div className="absolute top-16 left-64 w-1 h-1 bg-white rounded-full"></div>
              <div className="absolute top-32 left-48 w-1 h-1 bg-white rounded-full"></div>
              <div className="absolute top-40 left-20 w-1 h-1 bg-white rounded-full"></div>
              <div className="absolute top-24 left-80 w-1 h-1 bg-white rounded-full"></div>
            </div>
            {/* 光效 */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-400/30 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/30 rounded-full blur-3xl"></div>
          </div>

          {/* Banner 轮播内容 */}
          <div
            ref={bannerRef}
            onScroll={handleBannerScroll}
            onTouchStart={resetBannerAutoScroll}
            onMouseDown={resetBannerAutoScroll}
            className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide z-10"
          >
            {(bannerItems.length > 0 ? bannerItems : [{ id: 'fallback', title: '饮尽凡尘\n觉醒斩神', subtitle: '沉浸式 VR 大空间体验', badge: 'VR SPACE × 斩神II' }]).filter(Boolean).map((game: any) => (
              <div
                key={game!.id}
                onClick={() => { if (game.linkUrl) openConfiguredLink(game.linkUrl) }}
                className={cn("relative w-full h-full shrink-0 snap-start flex flex-col justify-end pb-16 px-5 text-left", game.linkUrl && "cursor-pointer")}
              >
                <p className="text-xs font-semibold text-cyan-300 mb-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                  {game!.badge || pageSettings?.cHomeBannerBadge || '限时特惠'}
                </p>
                <h2 className="text-3xl font-black text-white leading-tight italic whitespace-pre-line">
                  {getBannerTitle(game!)}
                </h2>
                <p className="text-sm text-white/80 mt-2">
                  {game!.subtitle || pageSettings?.cHomeBannerSubtitle || '全场体验项目最高 30% OFF'}
                </p>
                <button
                  className="mt-5 self-start px-5 py-2 rounded-full bg-white text-violet-600 text-sm font-semibold shadow-lg hover:bg-white/90 active:scale-95 transition-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (game.linkUrl) openConfiguredLink(game.linkUrl)
                    else navigate('/games')
                  }}
                >
                  立即预约
                </button>
              </div>
            ))}
          </div>

          {bannerItems.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20">
              {bannerItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const el = bannerRef.current
                    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
                    resetBannerAutoScroll()
                  }}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    activeBanner === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                  )}
                  aria-label={`切换到第 ${index + 1} 张 Banner`}
                />
              ))}
            </div>
          )}

          {/* 顶部导航栏 */}
          <div className="relative z-30 px-4 pt-3 pb-3">
            <div className="flex items-center justify-between text-white">
              <button
                onClick={() => setVenuePickerOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/15 backdrop-blur hover:bg-white/25 active:scale-95 transition-all"
              >
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">{selectedVenue?.name || '未定位'}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              </button>

              <div className="flex items-center gap-2">
                <LanguageSelect buttonClassName="bg-white/15 backdrop-blur text-white hover:bg-white/25" />

                {/* Notification bell */}
                <div className="relative" ref={notifyWrapRef}>
                  <NotificationPopover
                    open={showNotify}
                    onOpenChange={setShowNotify}
                    notifications={notifications.map((n: any) => ({
                      id: String(n.id),
                      title: n.title,
                      description: n.content,
                      timestamp: new Date(n.createdAt),
                      read: n.read,
                    }))}
                    onMarkAllAsRead={() => markAllReadMutation.mutate()}
                    onMarkAsRead={(id) => markReadMutation.mutate(id)}
                    onClearAll={() => clearAllMutation.mutate()}
                    title="消息通知"
                    emptyText="暂无通知"
                    buttonClassName="w-9 h-9 rounded-full bg-white/15 backdrop-blur text-white hover:bg-white/25 active:scale-95 transition-all"
                    popoverClassName="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl"
                    textColor="text-[var(--text-primary)]"
                    hoverBgColor="hover:bg-[var(--bg-hover)]"
                    dividerColor="divide-[var(--border-subtle)]"
                    headerBorderColor="border-[var(--border-subtle)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {searchEnabled && (
            <div className="relative z-20 px-4 pt-4 pb-2">
              <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-20" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={pageSettings?.cHomeSearchPlaceholder || '搜索 VR 体验项目...'}
                className="w-full h-10 pl-9 pr-9 rounded-full bg-white/90 backdrop-blur text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-gray-400/20 text-gray-500 hover:text-gray-700 z-20"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="relative bg-white shadow-sm">
          {/* 顶部导航栏 */}
          <div className="relative z-30 px-4 pt-3 pb-3">
            <div className="flex items-center justify-between text-gray-900">
              <button
                onClick={() => setVenuePickerOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
              >
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">{selectedVenue?.name || '未定位'}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              </button>

              <div className="flex items-center gap-2">
                <LanguageSelect buttonClassName="bg-gray-100 text-gray-900 hover:bg-gray-200" />

                {/* Notification bell */}
                <div className="relative" ref={notifyWrapRef}>
                  <NotificationPopover
                    open={showNotify}
                    onOpenChange={setShowNotify}
                    notifications={notifications.map((n: any) => ({
                      id: String(n.id),
                      title: n.title,
                      description: n.content,
                      timestamp: new Date(n.createdAt),
                      read: n.read,
                    }))}
                    onMarkAllAsRead={() => markAllReadMutation.mutate()}
                    onMarkAsRead={(id) => markReadMutation.mutate(id)}
                    onClearAll={() => clearAllMutation.mutate()}
                    title="消息通知"
                    emptyText="暂无通知"
                    buttonClassName="w-9 h-9 rounded-full bg-gray-100 text-gray-900 hover:bg-gray-200 active:scale-95 transition-all"
                    popoverClassName="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl"
                    textColor="text-[var(--text-primary)]"
                    hoverBgColor="hover:bg-[var(--bg-hover)]"
                    dividerColor="divide-[var(--border-subtle)]"
                    headerBorderColor="border-[var(--border-subtle)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {searchEnabled && (
            <div className="relative z-20 px-4 pt-2 pb-3">
              <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 z-20" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={pageSettings?.cHomeSearchPlaceholder || '搜索 VR 体验项目...'}
                className="w-full h-10 pl-9 pr-9 rounded-full bg-gray-100 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:bg-white transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-gray-400/20 text-gray-500 hover:text-gray-700 z-20"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 问候 + VIP 卡片 */}
      <div className={cn(
        "mx-4 relative z-20 rounded-2xl p-3.5 flex items-center justify-between transition-colors",
        bannerEnabled
          ? "-mt-10 border border-white/20 bg-white/14 text-white shadow-[0_18px_42px_rgba(15,23,42,0.22)] backdrop-blur-xl"
          : "mt-4 border border-[var(--border-subtle)] bg-white text-gray-900 shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
      )}>
        <div
          className={cn("flex items-center gap-3", !user && "cursor-pointer")}
          onClick={() => { if (!user) navigate('/login') }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover border-2 border-white/80 shadow-sm bg-gradient-to-br from-violet-500 to-blue-500"
            />
          ) : (
            <PresetAvatar seed={user?.id} className="w-10 h-10 border-2 border-white/80 shadow-sm" />
          )}
          <div>
            <p className={cn("text-xs", bannerEnabled ? "text-white/70" : "text-gray-500")}>{greetingTitle}</p>
            <p className={cn("text-sm font-bold", bannerEnabled ? "text-white" : "text-gray-900")}>{greetingSubtitle}</p>
          </div>
        </div>
        {user && pageSettings?.cHomeVipEnabled !== false && (
          <button
            onClick={() => navigate('/recharge')}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition-all",
              bannerEnabled
                ? "bg-white text-violet-700 shadow-sm"
                : "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-sm"
            )}
          >
            <Crown className={cn("w-3.5 h-3.5", bannerEnabled ? "text-violet-500" : "text-yellow-300")} />
            {pageSettings?.cHomeVipButton || '开通VIP'}
            <ChevronRight className={cn("w-3 h-3", bannerEnabled ? "text-violet-500" : "text-white/80")} />
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : games?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
            <Gamepad2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无游戏内容</p>
          </div>
        ) : (
          <div className="space-y-5">
            {sectionOrder.filter((s) => s.enabled && !['search', 'banner', 'vip'].includes(s.key)).map((section) => {
              // 搜索时只保留搜索框和搜索结果，隐藏 banner/分类/VIP/团购推荐等其他模块
              if (search.trim() !== '' && section.key !== 'search' && section.key !== 'hot') return null
              return (
              <div key={section.key}>
                {section.key === 'search' && !searchEnabled && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={pageSettings?.cHomeSearchPlaceholder || '搜索 VR 体验项目...'}
                      className="w-full h-10 pl-9 pr-9 rounded-full bg-[var(--bg-elevated)] border border-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-colors"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-[var(--text-muted)]/10 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {section.key === 'banner' && pageSettings?.cHomeBannerEnabled !== false && (
                  <div className="relative">
                    <div
                      ref={bannerRef}
                      onScroll={handleBannerScroll}
                      className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide rounded-2xl shadow-[0_12px_28px_rgba(15,23,42,0.16)]"
                    >
                      {(bannerItems.length > 0 ? bannerItems : [featuredGame]).filter(Boolean).map((game: any) => (
                        <div
                          key={game!.id}
                          onClick={() => { if (game.linkUrl) openConfiguredLink(game.linkUrl) }}
                          className={cn("relative w-full h-[170px] shrink-0 snap-start overflow-hidden text-left", game.linkUrl && "cursor-pointer")}
                        >
                          <img
                            src={game!.coverImage ? getImageUrl(game!.coverImage) : '/venue-cyber.jpg'}
                            alt={game!.title || 'VR体验'}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
                          <div className="absolute left-5 top-8 right-5">
                            <p className="text-xs font-semibold text-cyan-300 mb-2 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                              {game!.badge || pageSettings?.cHomeBannerBadge || '限时特惠'}
                            </p>
                            <h2 className="text-2xl font-black text-white leading-tight whitespace-pre-line">
                              {getBannerTitle(game!)}
                            </h2>
                            <p className="text-xs text-white/85 mt-2">{game!.subtitle || pageSettings?.cHomeBannerSubtitle || '全场体验项目最高 30% OFF'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {bannerItems.length > 1 && (
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                        {bannerItems.map((item, index) => (
                          <span
                            key={item.id}
                            className={cn(
                              'h-1.5 rounded-full transition-all',
                              activeBanner === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {section.key === 'category' && pageSettings?.cHomeCategoryEnabled !== false && categories.length > 0 && (
                  <div className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] p-4 grid grid-cols-4 gap-3">
                    {categories.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.label}
                          onClick={() => setSearch((current) => current === item.keyword ? '' : item.keyword)}
                          className="flex flex-col items-center gap-2"
                        >
                          <span className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', item.bg)}>
                            <Icon className={cn('w-5 h-5', item.color)} />
                          </span>
                          <span className="text-xs font-medium text-[var(--text-primary)]">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {section.key === 'vip' && pageSettings?.cHomeVipEnabled !== false && (
                  <button
                    onClick={() => navigate('/recharge')}
                    className="w-full rounded-2xl bg-gradient-accent px-4 py-4 text-left text-white shadow-glow flex items-center justify-between"
                  >
                    <div className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-yellow-300 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold">{pageSettings?.cHomeVipTitle || 'VIP 专属权益'}</p>
                        <p className="text-xs text-white/85 mt-0.5">{pageSettings?.cHomeVipDesc || '开通会员，享受每月免费体验名额'}</p>
                      </div>
                    </div>
                    <span className="px-4 py-2 rounded-full bg-white text-[var(--accent-primary)] text-xs font-bold">
                      {pageSettings?.cHomeVipButton || '立即开通'}
                    </span>
                  </button>
                )}

                {section.key === 'customModules' && customModules.length > 0 && (
                  <div className="space-y-3">
                    {gridModules.map((module) => (
                      <div
                        key={module.id}
                        className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden p-5"
                      >
                        {module.title?.trim() && (
                          <div className="flex items-center gap-2 mb-5">
                            <div className="w-1 h-4 rounded-full bg-[var(--accent-primary)]" />
                            <h3 className="text-base font-black text-[var(--text-primary)]">{module.title}</h3>
                          </div>
                        )}
                        <div className="grid grid-cols-4 gap-x-2 gap-y-5">
                          {module.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (!item.linkUrl) return
                                if (item.linkUrl.startsWith('http')) window.open(item.linkUrl, '_blank')
                                else navigate(item.linkUrl)
                              }}
                              className="group flex flex-col items-center gap-2.5"
                            >
                              {item.imageUrl ? (
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden shadow-sm group-active:scale-95 transition-transform">
                                  <img src={getImageUrl(item.imageUrl)} alt={item.title} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 shadow-sm group-active:scale-95 transition-transform" />
                              )}
                              <span className="text-xs font-medium text-[var(--text-primary)] text-center line-clamp-1">{item.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {carouselModules.length > 0 && (
                      <div className="relative">
                        <div
                          ref={moduleCarouselRef}
                          onScroll={handleModuleScroll}
                          onTouchStart={resetModuleAutoScroll}
                          onMouseDown={resetModuleAutoScroll}
                          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-5"
                        >
                          {carouselModules.map((module, index) => {
                            const hasTextContent = !!(module.title?.trim() || module.content?.trim())
                            const showButton = !!(module.linkUrl?.trim() && module.buttonText?.trim())
                            const hasContent = hasTextContent || showButton
                            const isActiveModule = index === activeModule
                            return (
                              <div
                                key={module.id}
                                className="w-full shrink-0 snap-start px-5"
                              >
                                <div className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden">
                                  {module.videoUrl ? (
                                    <>
                                      <div
                                        className="w-full bg-black flex justify-center overflow-hidden"
                                        style={{ aspectRatio: videoAspectRatios[module.id] ? `${videoAspectRatios[module.id]}` : '16/9' }}
                                      >
                                        <video
                                          ref={(el) => {
                                            if (el) videoRefs.current.set(module.id, el)
                                            else videoRefs.current.delete(module.id)
                                          }}
                                          src={getImageUrl(module.videoUrl)}
                                          poster={module.imageUrl ? getImageUrl(module.imageUrl) : undefined}
                                          controls
                                          autoPlay={isActiveModule}
                                          muted
                                          playsInline
                                          preload={isActiveModule ? 'auto' : 'none'}
                                          disablePictureInPicture
                                          onLoadedMetadata={(e) => handleVideoLoadedMetadata(module.id, e.currentTarget)}
                                          onCanPlay={(e) => {
                                            if (isActiveModule) {
                                              void e.currentTarget.play().catch(() => {})
                                            }
                                          }}
                                          onEnded={handleModuleVideoEnded}
                                          className="w-full h-full object-contain block"
                                        />
                                      </div>
                                      {hasContent && (
                                        <div className="p-4">
                                          {hasTextContent && (
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="min-w-0">
                                                {module.title?.trim() && (
                                                  <h3 className="text-sm font-black text-[var(--text-primary)]">{module.title}</h3>
                                                )}
                                                {module.content?.trim() && (
                                                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-3">{module.content}</p>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                          {showButton && (
                                            <button
                                              onClick={() => {
                                                if (module.linkUrl.startsWith('http')) window.open(module.linkUrl, '_blank')
                                                else navigate(module.linkUrl)
                                              }}
                                              className={cn(
                                                'px-3 py-1.5 rounded-full bg-[var(--bg-active)] text-[var(--accent-primary)] text-xs font-bold',
                                                hasTextContent && 'mt-3'
                                              )}
                                            >
                                              {module.buttonText.trim()}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  ) : module.imageUrl ? (
                                    <div className="relative">
                                      <div className="w-full bg-slate-100 flex items-center justify-center aspect-video overflow-hidden">
                                        <img
                                          src={getImageUrl(module.imageUrl)}
                                          alt={module.title || '活动图片'}
                                          className="w-full h-full object-cover block"
                                        />
                                      </div>
                                      {showButton && (
                                        <button
                                          onClick={() => {
                                            if (module.linkUrl.startsWith('http')) window.open(module.linkUrl, '_blank')
                                            else navigate(module.linkUrl)
                                          }}
                                          className="absolute bottom-3 left-4 px-3 py-1.5 rounded-full bg-white/90 text-[var(--accent-primary)] text-xs font-bold shadow-md backdrop-blur-sm"
                                        >
                                          {module.buttonText.trim()}
                                        </button>
                                      )}
                                      {hasTextContent && (
                                        <div className="p-4">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              {module.title?.trim() && (
                                                <h3 className="text-sm font-black text-[var(--text-primary)]">{module.title}</h3>
                                              )}
                                              {module.content?.trim() && (
                                                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-3">{module.content}</p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    hasContent && (
                                      <div className="p-4">
                                        {hasTextContent && (
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              {module.title?.trim() && (
                                                <h3 className="text-sm font-black text-[var(--text-primary)]">{module.title}</h3>
                                              )}
                                              {module.content?.trim() && (
                                                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-3">{module.content}</p>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {showButton && (
                                          <button
                                            onClick={() => {
                                              if (module.linkUrl.startsWith('http')) window.open(module.linkUrl, '_blank')
                                              else navigate(module.linkUrl)
                                            }}
                                            className={cn(
                                              'px-3 py-1.5 rounded-full bg-[var(--bg-active)] text-[var(--accent-primary)] text-xs font-bold',
                                              hasTextContent && 'mt-3'
                                            )}
                                          >
                                            {module.buttonText.trim()}
                                          </button>
                                        )}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {carouselModules.length > 1 && (
                          <div className="flex justify-center gap-1.5 mt-3">
                            {carouselModules.map((item, index) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  scrollModuleTo(index)
                                  resetModuleAutoScroll()
                                }}
                                className={cn(
                                  'h-1.5 rounded-full transition-all',
                                  activeModule === index ? 'w-5 bg-[var(--accent-primary)]' : 'w-1.5 bg-[var(--border-subtle)]'
                                )}
                                aria-label={`切换到第 ${index + 1} 个模块`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {section.key === 'groupBuy' && groupBuyPackages && groupBuyPackages.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-black text-[var(--text-primary)] border-l-4 border-[var(--accent-primary)] pl-2">
                        团购推荐
                      </h2>
                      <button onClick={() => navigate('/group-buys')} className="text-xs text-[var(--text-muted)] flex items-center">
                        查看全部 <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-5 px-5">
                      {groupBuyPackages.slice(0, 5).map((pkg) => {
                        const game = pkg.game
                        const saved = pkg.originalPricePerPerson * pkg.maxPeople - pkg.totalGroupPrice
                        return (
                          <motion.div
                            key={pkg.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={() => navigate(`/group-buy/${pkg.id}`)}
                            className="shrink-0 w-[260px] bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
                          >
                            <div className={cn('relative h-28 bg-gradient-to-r p-3 flex flex-col justify-between', pkg.type === 'DOUBLE' ? 'from-indigo-900 to-slate-900' : pkg.type === 'THREE' ? 'from-sky-400 to-sky-600' : 'from-amber-400 to-amber-600')}>
                              <span className="self-start px-2.5 py-0.5 rounded-full bg-white text-[var(--accent-primary)] text-[10px] font-bold">{pkg.label}</span>
                              <div>
                                <h3 className="text-base font-bold text-white truncate pr-28">{pkg.title}</h3>
                                <p className="text-xs text-white/80 truncate pr-28">{pkg.subtitle || game?.subtitle || ''}</p>
                              </div>
                              {pkg.coverImage && (
                                <img src={getImageUrl(pkg.coverImage)} alt="" className="absolute right-3 top-1/2 -translate-y-1/2 w-24 h-24 rounded-xl object-cover opacity-90 shadow-lg" />
                              )}
                            </div>
                            <div className="p-3">
                              <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{game?.title || pkg.title}</h4>
                              <div className="flex items-end justify-between mt-2">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-base font-bold text-[var(--error)]">¥{(pkg.totalGroupPrice / 100).toFixed(0)}</span>
                                  {saved > 0 && <span className="text-[10px] text-[var(--error)] bg-[var(--error)]/10 px-1.5 py-0.5 rounded-full">省¥{(saved / 100).toFixed(0)}</span>}
                                </div>
                                <span className="text-[10px] text-[var(--text-muted)]">{pkg.minPeople}-{pkg.maxPeople}人团</span>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {section.key === 'hot' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-black text-[var(--text-primary)] border-l-4 border-[var(--accent-primary)] pl-2">
                        {search.trim() !== '' ? '搜索结果' : (pageSettings?.cHomeHotTitle || '热门体验')}
                      </h2>
                      {search.trim() === '' ? (
                        <button onClick={() => navigate('/venues')} className="text-xs text-[var(--text-muted)] flex items-center">
                          {pageSettings?.cHomeHotLinkText || '查看全部'} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">
                          共 {filteredGames?.length || 0} 个
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {filteredGames?.length === 0 && search.trim() !== '' && (
                        <div className="text-center py-10">
                          <Search className="w-10 h-10 mx-auto text-[var(--text-muted)]" />
                          <p className="mt-3 text-sm text-[var(--text-muted)]">未找到匹配「{search}」的体验项目</p>
                        </div>
                      )}
                      {filteredGames?.map((game, i) => (
                        <motion.div
                          key={game.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06, duration: 0.35 }}
                          onClick={() => navigate(`/game/${game.id}`)}
                          className="bg-white rounded-2xl border border-[var(--border-subtle)] shadow-[0_8px_22px_rgba(15,23,42,0.07)] p-3 flex gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                        >
                          <div className="relative w-[92px] h-[92px] rounded-xl overflow-hidden shrink-0 bg-[var(--bg-elevated)]">
                            <img
                              src={game.coverImage ? getImageUrl(game.coverImage) : '/venue-cyber.jpg'}
                              alt={game.title}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-base font-black text-[var(--text-primary)] truncate">{game.title}</h3>
                              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-elevated)] text-[10px] text-[var(--text-secondary)]">
                                <Clock className="w-3 h-3" />{game.duration}分钟
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
                              {game.subtitle || game.description || '沉浸式 VR 大空间体验'}
                            </p>
                            <div className="flex items-end justify-between mt-3">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-lg font-black text-[var(--accent-primary)]">¥{(game.price / 100).toFixed(0)}</span>
                                <span className="text-xs text-[var(--text-disabled)] line-through">¥{Math.round((game.price / 100) * 1.35)}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(getBookingTargetPath(game.id))
                                }}
                                className="px-3 py-1.5 rounded-full bg-[var(--bg-active)] text-[var(--accent-primary)] text-xs font-bold"
                              >
                                预约
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </div>

      <AnimatePresence>
        {venuePickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={() => setVenuePickerOpen(false)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[var(--border-subtle)] overflow-hidden"
            >
              <div className="px-5 pt-5 pb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-[var(--text-primary)]">选择门店</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">选择后会自动保存，下次打开直接使用。</p>
                  </div>
                  <button
                    onClick={() => setVenuePickerOpen(false)}
                    className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] flex items-center justify-center"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-4 rounded-2xl bg-[var(--bg-elevated)] p-3">
                  <div className="flex items-start gap-2">
                    <LocateFixed className="w-4 h-4 text-[var(--accent-primary)] mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">获取当前位置</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{locationStatus}</p>
                    </div>
                    <button
                      onClick={handleLocate}
                      className="shrink-0 px-3 py-1.5 rounded-full bg-gradient-accent text-white text-xs font-bold"
                    >
                      授权定位
                    </button>
                  </div>
                </div>

                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    value={venueSearch}
                    onChange={(e) => setVenueSearch(e.target.value)}
                    placeholder="搜索门店名称或地址"
                    className="w-full h-10 pl-9 pr-4 rounded-full bg-[var(--bg-elevated)] border border-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:bg-white"
                  />
                </div>
              </div>

              <div className="max-h-[48vh] overflow-y-auto p-4 space-y-3">
                {venueLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : pickerVenues.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[var(--text-muted)]">暂无可选门店</div>
                ) : (
                  pickerVenues.map(({ venue, distance }) => {
                    const active = selectedVenue?.id === venue.id
                    return (
                      <button
                        key={venue.id}
                        onClick={() => saveVenue(venue)}
                        className={cn(
                          'w-full p-4 rounded-2xl border text-left transition-colors',
                          active
                            ? 'bg-[var(--bg-active)] border-[var(--accent-primary)]/40'
                            : 'bg-white border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/30'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-[var(--text-primary)]">{venue.name}</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-1">
                              {venue.address || venue.theme || '暂无门店地址'}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            {distance != null ? (
                              <p className="text-xs font-bold text-[var(--accent-primary)]">{distance.toFixed(1)}km</p>
                            ) : (
                              <p className="text-xs font-bold text-[var(--success)]">{active ? '当前' : '可选'}</p>
                            )}
                            {distance != null && active && <p className="text-[10px] text-[var(--success)] mt-1">当前门店</p>}
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


    </motion.div>
  )
}
