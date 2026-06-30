import { Search, ChevronDown, RefreshCw, LogOut, X, Eye, EyeOff, User, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/authStore'
import { NotificationPopover } from '@/components/ui/notification-popover'
import { useThemeStore } from '@/stores/themeStore'
import { logout, changePassword } from '@/api/auth'
import { getLogs } from '@/api/logs'
import { globalSearch } from '@/api/search'
import { getNotifications, getUnreadCount, markAllRead, clearAllNotifications } from '@/api/notifications'
import { getSettings } from '@/api/settings'
import { playNotificationSound, speakNotification, getVoiceTextByType } from '@/lib/notificationSound'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import LanguageSelect from '@/components/LanguageSelect'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TopBarProps {
  breadcrumb?: string[]
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${days}天前`
}

export default function TopBar({ breadcrumb = ['首页'] }: TopBarProps) {
  const navigate = useNavigate()
  const { user, logout: clearAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [showNotify, setShowNotify] = useState(false)
  const notifyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showNotify) return
    const handler = (e: MouseEvent) => {
      if (notifyRef.current && !notifyRef.current.contains(e.target as Node)) {
        setShowNotify(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotify])
  const [showPwdDialog, setShowPwdDialog] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)

  const today = new Date()
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 ${['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][today.getDay()]}`

  const queryClient = useQueryClient()

  const { data: notifyData } = useQuery({
    queryKey: ['notifications', 'admin'],
    queryFn: () => getNotifications({ page: 1, pageSize: 10 }),
    refetchInterval: 5000,
  })

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'admin', 'unread'],
    queryFn: getUnreadCount,
    refetchInterval: 5000,
  })

  const { data: notificationSettings } = useQuery({
    queryKey: ['settings', 'notification'],
    queryFn: () => getSettings('notification'),
    staleTime: 60000,
  })

  const soundEnabled = notificationSettings?.notification_sound_enabled?.value ?? true
  const soundMode = notificationSettings?.notification_sound_mode?.value ?? 'voice'
  const soundType = notificationSettings?.notification_sound_type?.value ?? 'default'
  const soundUrl = notificationSettings?.notification_sound_url?.value ?? ''
  const voiceText = notificationSettings?.notification_voice_text?.value ?? '您有新的订单，请及时查看'
  const audioUnlockedRef = useRef(false)

  // 浏览器自动播放策略：首次用户交互后解锁音频
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContext) {
          const ctx = new AudioContext()
          if (ctx.state === 'suspended') {
            ctx.resume().then(() => ctx.close())
          } else {
            ctx.close()
          }
        }
        audioUnlockedRef.current = true
      } catch {
        // ignore
      }
    }
    window.addEventListener('click', unlock, { once: true })
    return () => window.removeEventListener('click', unlock)
  }, [])

  // 新通知声音提醒：基于最新通知时间戳，避免刷新时重复播放
  useEffect(() => {
    if (!soundEnabled) return
    const list = (notifyData?.data || []) as Array<{ createdAt: string; type?: string }>
    if (list.length === 0) return
    const latest = list[0]
    const latestTime = new Date(latest.createdAt).getTime()
    if (Number.isNaN(latestTime)) return
    const lastNotifiedAt = Number(localStorage.getItem('vr_last_notification_at') || '0')
    if (latestTime > lastNotifiedAt) {
      if (soundMode === 'voice') {
        const text = getVoiceTextByType(latest.type, String(voiceText))
        speakNotification(text)
      } else if (soundMode === 'custom') {
        playNotificationSound('custom', String(soundUrl))
      } else {
        playNotificationSound(String(soundType))
      }
      localStorage.setItem('vr_last_notification_at', String(latestTime))
    }
  }, [notifyData, soundEnabled, soundMode, soundType, soundUrl, voiceText])

  const notifications = (notifyData?.data || []).map((n: any) => ({
    id: n.id,
    title: n.title,
    desc: n.content,
    time: timeAgo(n.createdAt),
    userName: n.user?.name || '未知用户',
    userPhone: n.user?.phone || '',
    read: n.read,
    source: n.source || 'SYSTEM',
  }))

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

  const notifyCount = unreadCount

  const pwdMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setPwdSuccess('密码修改成功，请重新登录')
      setPwdError('')
      setOldPwd('')
      setNewPwd('')
      setConfirmPwd('')
      setTimeout(() => {
        setShowPwdDialog(false)
        setPwdSuccess('')
        handleLogout()
      }, 1500)
    },
    onError: (err: any) => {
      setPwdError(err.response?.data?.message || err.message || '修改失败')
      setPwdSuccess('')
    },
  })

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // ignore
    }
    clearAuth()
    queryClient.clear()
    navigate('/login')
  }

  const handleRefresh = () => {
    // 全局刷新：使所有活跃查询失效并重新获取
    queryClient.invalidateQueries()
  }

  const doSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null)
      setShowSearchResults(false)
      return
    }
    setSearchLoading(true)
    try {
      const res = await globalSearch(q)
      setSearchResults(res)
      setShowSearchResults(true)
    } catch {
      setSearchResults(null)
    } finally {
      setSearchLoading(false)
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => doSearch(val), 300)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSearchResults(false)
    }
    if (e.key === 'Enter') {
      doSearch(searchQuery)
    }
  }

  const handleSearchResultClick = (type: string, id: string) => {
    setShowSearchResults(false)
    setSearchQuery('')
    setSearchResults(null)
    if (type === 'venue') navigate('/venues')
    if (type === 'order') navigate('/orders')
    if (type === 'user') navigate('/member-center')
  }

  const totalResults = searchResults
    ? (searchResults.venues?.length || 0) + (searchResults.orders?.length || 0) + (searchResults.users?.length || 0)
    : 0

  const handleChangePassword = () => {
    setPwdError('')
    setPwdSuccess('')
    if (!oldPwd || !newPwd || !confirmPwd) {
      setPwdError('请填写所有字段')
      return
    }
    if (newPwd.length < 6) {
      setPwdError('新密码至少6位')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的新密码不一致')
      return
    }
    pwdMutation.mutate({ oldPassword: oldPwd, newPassword: newPwd })
  }

  const avatarLetter = user?.name?.charAt(0) || '管'
  const avatarColor = '#3B82F6'

  return (
    <>
      <header className="fixed top-3 right-4 left-4 lg:left-[248px] z-40 h-[50px] bg-vrbg-header/90 backdrop-blur-xl border border-vrborder-subtle rounded-2xl flex items-center justify-between px-5 shadow-[0_16px_35px_rgba(15,23,42,0.06)]">
        {/* Left: Breadcrumb + Date */}
        <div className="flex items-center gap-4 ml-8 lg:ml-0">
          <nav className="flex items-center gap-2 text-vr-body-sm text-vrtext-secondary">
            {breadcrumb.map((item, idx) => (
              <span key={idx} className="flex items-center gap-2">
                {idx > 0 && <span className="text-vrtext-muted">/</span>}
                <span className={idx === breadcrumb.length - 1 ? 'text-vrtext-primary' : ''}>{item}</span>
              </span>
            ))}
          </nav>
          <span className="hidden md:block text-vr-caption text-vrtext-tertiary border-l border-vrborder-subtle pl-4">
            {dateStr}
          </span>
        </div>

        {/* Center: Search */}
        <div className="hidden lg:flex items-center relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => { if (totalResults > 0) setShowSearchResults(true) }}
              placeholder="搜索场地、订单、用户..."
              className="soft-input w-72 h-9 pl-9 pr-4 text-vr-body-sm"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null); setShowSearchResults(false) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-vrtext-muted hover:text-vrtext-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {showSearchResults && searchQuery.trim() && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSearchResults(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 top-full mt-2 w-96 bg-vrbg-card border border-vrborder-subtle rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] z-40 overflow-hidden max-h-[70vh] overflow-y-auto"
                >
                  {searchLoading ? (
                    <div className="px-4 py-6 text-center text-vr-caption text-vrtext-muted">搜索中...</div>
                  ) : totalResults === 0 ? (
                    <div className="px-4 py-6 text-center text-vr-caption text-vrtext-muted">
                      未找到 "{searchQuery}" 相关结果
                    </div>
                  ) : (
                    <div className="py-1">
                      {searchResults?.venues?.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-xs text-vrtext-muted font-medium bg-vrbg-surface/50">场地</div>
                          {searchResults.venues.map((v: any) => (
                            <button
                              key={v.id}
                              onClick={() => handleSearchResultClick('venue', v.id)}
                              className="w-full text-left px-4 py-2 hover:bg-vrbg-hover transition-colors flex items-center gap-2"
                            >
                              <span className="text-vr-body-sm text-vrtext-primary truncate">{v.name}</span>
                              <span className="text-xs text-vrtext-muted shrink-0">{v.theme}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${v.status === 'FREE' || v.status === 'IN_USE' ? 'bg-vrsuccess/20 text-vrsuccess' : v.status === 'MAINTENANCE' ? 'bg-vrwarning/20 text-vrwarning' : 'bg-vrtext-muted/20 text-vrtext-muted'}`}>
                                {v.status === 'FREE' || v.status === 'IN_USE' ? '营业中' : v.status === 'MAINTENANCE' ? '维护中' : '暂停营业'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults?.orders?.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-xs text-vrtext-muted font-medium bg-vrbg-surface/50">订单</div>
                          {searchResults.orders.map((o: any) => (
                            <button
                              key={o.id}
                              onClick={() => handleSearchResultClick('order', o.id)}
                              className="w-full text-left px-4 py-2 hover:bg-vrbg-hover transition-colors flex items-center gap-2"
                            >
                              <span className="text-vr-body-sm text-vrtext-primary truncate">{o.orderNo}</span>
                              <span className="text-xs text-vrtext-muted truncate">{o.venueName}</span>
                              <span className="text-xs text-vrsuccess shrink-0">¥{(o.amount / 100).toFixed(0)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults?.users?.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-xs text-vrtext-muted font-medium bg-vrbg-surface/50">用户</div>
                          {searchResults.users.map((u: any) => (
                            <button
                              key={u.id}
                              onClick={() => handleSearchResultClick('user', u.id)}
                              className="w-full text-left px-4 py-2 hover:bg-vrbg-hover transition-colors flex items-center gap-2"
                            >
                              <span className="text-vr-body-sm text-vrtext-primary truncate">{u.name}</span>
                              <span className="text-xs text-vrtext-muted shrink-0">{u.phone}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${u.level === 'VIP' ? 'bg-vrwarning/20 text-vrwarning' : u.level === 'MEMBER' ? 'bg-vraccent-primary/20 text-vraccent-primary' : 'bg-vrtext-muted/20 text-vrtext-muted'}`}>
                                {u.level === 'VIP' ? 'VIP' : u.level === 'MEMBER' ? '会员' : '普通'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-vrbg-card/80 border border-vrborder-subtle rounded-xl p-1 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
            <LanguageSelect
              compact
              buttonClassName="h-8 w-8 rounded-lg text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary"
            />

            <button
              onClick={handleRefresh}
              className="relative h-8 w-8 rounded-lg flex items-center justify-center text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors"
              title="刷新数据"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <ThemeToggle
              isDark={theme === 'dark'}
              onToggle={toggleTheme}
              className="h-8 w-8 rounded-lg"
            />

            {/* Notification */}
            <div className="relative" ref={notifyRef}>
              <NotificationPopover
                open={showNotify}
                onOpenChange={setShowNotify}
                notifications={(notifyData?.data || []).map((n: any) => ({
                  id: String(n.id),
                  title: n.title,
                  description: n.content,
                  timestamp: new Date(n.createdAt),
                  read: n.read,
                  source: n.source || 'SYSTEM',
                  type: n.type,
                }))}
                onMarkAllAsRead={() => markAllReadMutation.mutate()}
                onMarkAsRead={() => markAllReadMutation.mutate()}
                onClearAll={() => clearAllMutation.mutate()}
                title="系统动态"
                emptyText="暂无新动态"
                buttonClassName="h-8 w-8 rounded-lg text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary"
                popoverClassName="bg-vrbg-card border border-vrborder-subtle shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                textColor="text-vrtext-primary"
                hoverBgColor="hover:bg-vrbg-hover"
                dividerColor="divide-vrborder-subtle"
                headerBorderColor="border-vrborder-subtle"
              />
            </div>
          </div>

          {/* Admin dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-xl bg-vrbg-card/80 border border-vrborder-subtle hover:bg-vrbg-elevated transition-colors shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium bg-slate-200 text-slate-600">
                  {avatarLetter}
                </div>
                <span className="text-sm text-vrtext-primary hidden sm:inline">{user?.name || '管理员'}</span>
                <ChevronDown className="w-4 h-4 text-vrtext-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48" align="end" sideOffset={8}>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-vrtext-primary">{user?.name || '系统管理员'}</span>
                <span className="text-xs text-vrtext-tertiary">{user?.phone || 'admin@vrspace.com'}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings')}>
                <User className="w-4 h-4 opacity-60" />
                <span>个人设置</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setShowPwdDialog(true)}>
                <Lock className="w-4 h-4 opacity-60" />
                <span>修改密码</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-vrerror focus:text-vrerror focus:bg-vrerror/10"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 opacity-60" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Change Password Dialog */}
      <Dialog open={showPwdDialog} onOpenChange={setShowPwdDialog}>
        <DialogContent className="bg-vrbg-card border-vrborder-subtle text-vrtext-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="text-vr-h3 text-vrtext-primary">修改密码</DialogTitle>
            <DialogDescription className="text-vr-caption text-vrtext-tertiary">
              修改成功后需要重新登录
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">原密码</label>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="请输入原密码"
                  className="soft-input w-full h-10 px-3 pr-10 text-vr-body-sm"
                />
                <button
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vrtext-muted hover:text-vrtext-primary"
                >
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">新密码</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="至少6位"
                  className="soft-input w-full h-10 px-3 pr-10 text-vr-body-sm"
                />
                <button
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vrtext-muted hover:text-vrtext-primary"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">确认新密码</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="再次输入新密码"
                className="soft-input w-full h-10 px-3 text-vr-body-sm"
              />
            </div>
            {pwdError && (
              <p className="text-sm text-vrerror">{pwdError}</p>
            )}
            {pwdSuccess && (
              <p className="text-sm text-vrsuccess">{pwdSuccess}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowPwdDialog(false)
                  setPwdError('')
                  setPwdSuccess('')
                  setOldPwd('')
                  setNewPwd('')
                  setConfirmPwd('')
                }}
                className="px-4 py-2 rounded-xl text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleChangePassword}
                disabled={pwdMutation.isPending}
                className="px-4 py-2 rounded-xl text-vr-body-sm bg-vraccent-primary text-white hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
              >
                {pwdMutation.isPending ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
