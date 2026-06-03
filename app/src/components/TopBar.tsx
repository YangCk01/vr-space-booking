import { Bell, Search, ChevronDown, RefreshCw, LogOut, X, Eye, EyeOff, Sun, Moon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { logout, changePassword } from '@/api/auth'
import { getLogs } from '@/api/logs'
import { globalSearch } from '@/api/search'
import { getNotifications, getUnreadCount, markAllRead, clearAllNotifications } from '@/api/notifications'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

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
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotify, setShowNotify] = useState(false)
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
    refetchInterval: 30000,
  })

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'admin', 'unread'],
    queryFn: getUnreadCount,
    refetchInterval: 30000,
  })

  const notifications = (notifyData?.data || []).map((n: any) => ({
    id: n.id,
    title: n.title,
    desc: n.content,
    time: timeAgo(n.createdAt),
    userName: n.user?.name || '未知用户',
    userPhone: n.user?.phone || '',
    read: n.read,
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
    if (type === 'user') navigate('/users')
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
      <header className="fixed top-0 right-0 left-0 lg:left-[220px] z-40 h-[56px] bg-vrbg-header border-b border-vrborder-subtle flex items-center justify-between px-6">
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
              className="w-72 h-9 pl-9 pr-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
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
                  className="absolute left-0 top-full mt-2 w-96 bg-vrbg-elevated border border-vrborder-hover rounded-xl shadow-vr-lg z-40 overflow-hidden max-h-[70vh] overflow-y-auto"
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
                              className="w-full text-left px-4 py-2 hover:bg-vrborder-hover/50 transition-colors flex items-center gap-2"
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
                              className="w-full text-left px-4 py-2 hover:bg-vrborder-hover/50 transition-colors flex items-center gap-2"
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
                              className="w-full text-left px-4 py-2 hover:bg-vrborder-hover/50 transition-colors flex items-center gap-2"
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
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="relative p-2 rounded-lg text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors"
            title="刷新数据"
          >
            <RefreshCw className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={toggleTheme}
            className="relative p-2 rounded-lg text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors"
            title={theme === 'dark' ? '切换亮色' : '切换暗色'}
          >
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>

          {/* Notification */}
          <div className="relative">
            <button
              onClick={() => setShowNotify(!showNotify)}
              className="relative p-2 rounded-lg text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors"
            >
              <Bell className="w-5 h-5" />
              {notifyCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-vrerror rounded-full animate-pulse-dot" />
              )}
            </button>

            <AnimatePresence>
              {showNotify && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotify(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 w-80 bg-vrbg-elevated border border-vrborder-hover rounded-xl shadow-vr-lg z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-vrborder-hover flex items-center justify-between">
                      <p className="text-vr-body-sm text-vrtext-primary font-medium">系统动态</p>
                      <div className="flex items-center gap-3">
                        {notifyCount > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markAllReadMutation.mutate() }}
                            className="text-xs text-vraccent-primary hover:underline"
                          >
                            全部已读
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); clearAllMutation.mutate() }}
                            className="text-xs text-vrerror hover:underline"
                          >
                            清除
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-vr-caption text-vrtext-muted">
                          暂无新动态
                        </div>
                      ) : (
                        notifications.map((n: any) => (
                          <div key={n.id} className={`px-4 py-3 border-b border-vrborder-hover last:border-0 hover:bg-vrborder-hover/50 cursor-pointer transition-colors ${n.read ? 'opacity-60' : ''}`}>
                            <div className="flex items-center justify-between">
                              <p className="text-vr-body-sm text-vrtext-primary font-medium">{n.title}</p>
                              <span className="text-xs text-vrtext-muted shrink-0 ml-2">{n.time}</span>
                            </div>
                            <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{n.desc}</p>
                            <p className="text-xs text-vrtext-muted mt-1">{n.userName} {n.userPhone}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Admin dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-vrbg-elevated transition-colors"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium border border-vrborder-subtle"
                style={{ backgroundColor: avatarColor }}
              >
                {avatarLetter}
              </div>
              <span className="text-vr-body-sm text-vrtext-primary">{user?.name || '管理员'}</span>
              <ChevronDown className="w-4 h-4 text-vrtext-muted" />
            </button>

            <AnimatePresence>
              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 w-48 bg-vrbg-elevated border border-vrborder-hover rounded-xl shadow-vr-lg z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-vrborder-hover">
                      <p className="text-vr-body-sm text-vrtext-primary font-medium">{user?.name || '系统管理员'}</p>
                      <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{user?.phone || 'admin@vrspace.com'}</p>
                    </div>
                    <div className="p-1">
                      <button
                        onClick={() => { setShowDropdown(false); navigate('/settings') }}
                        className="w-full text-left px-3 py-2 rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors"
                      >
                        个人设置
                      </button>
                      <button
                        onClick={() => { setShowDropdown(false); setShowPwdDialog(true) }}
                        className="w-full text-left px-3 py-2 rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors"
                      >
                        修改密码
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 rounded-lg text-vr-body-sm text-vrerror hover:bg-vrerror/10 transition-colors flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        退出登录
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Change Password Dialog */}
      <Dialog open={showPwdDialog} onOpenChange={setShowPwdDialog}>
        <DialogContent className="bg-vrbg-elevated border-vrborder-hover text-vrtext-primary max-w-md">
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
                  className="w-full h-10 px-3 pr-10 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
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
                  className="w-full h-10 px-3 pr-10 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
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
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
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
                className="px-4 py-2 rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleChangePassword}
                disabled={pwdMutation.isPending}
                className="px-4 py-2 rounded-lg text-vr-body-sm bg-vraccent-primary text-white hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
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
