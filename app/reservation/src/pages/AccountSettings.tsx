import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Camera,
  User,
  Phone,
  Lock,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { updateProfile, uploadAvatar } from '@/api/auth'
import { resolveImageUrl } from '@/api/client'
import { useMutation } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

/* ─── Form row component ─── */
function FormRow({
  icon,
  label,
  children,
  error,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div className="py-4 border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
          {children}
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-[var(--error)] flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}

/* ─── Alert Banner ─── */
function AlertBanner({
  type,
  message,
}: {
  type: 'error' | 'success'
  message: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-center gap-2 px-4 py-3 rounded-lg text-sm border',
        type === 'error'
          ? 'bg-red-500/15 text-red-400 border-red-500/30'
          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      )}
    >
      {type === 'error' ? (
        <AlertCircle className="w-4 h-4 shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      )}
      {message}
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function AccountSettings() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()

  const fileInputRef = useRef<HTMLInputElement>(null)

  /* Local states */
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [birthday, setBirthday] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '')

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setEmail(user.email || '')
      // 将 ISO 日期格式转为 YYYY-MM-DD
      const rawBirthday = user.birthday
      if (rawBirthday) {
        const date = new Date(rawBirthday)
        const yyyy = date.getFullYear()
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        const dd = String(date.getDate()).padStart(2, '0')
        setBirthday(`${yyyy}-${mm}-${dd}`)
      } else {
        setBirthday('')
      }
      setAvatarUrl(user.avatar || '')
    }
  }, [user])

  /* Global messages (profile / avatar) */
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const showError = (msg: string) => {
    setError(msg)
    setSuccess('')
    setTimeout(() => setError(''), 3000)
  }
  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setError('')
    setTimeout(() => setSuccess(''), 3000)
  }

  /* Avatar upload */
  const uploadMut = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: async (data) => {
      setAvatarUrl(data.url)
      await updateProfileMut.mutateAsync({ avatar: data.url })
    },
    onError: (err: any) => showError(err?.response?.data?.message || '上传失败'),
  })

  const updateProfileMut = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      refreshUser()
      showSuccess('资料更新成功')
    },
    onError: (err: any) => showError(err?.response?.data?.message || '更新失败'),
  })

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (!file.type.startsWith('image/')) {
        showError('请选择图片文件')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        showError('图片大小不能超过 5MB')
        return
      }
      uploadMut.mutate(file)
    },
    [uploadMut]
  )

  const handleSaveProfile = () => {
    if (!name.trim()) {
      showError('昵称不能为空')
      return
    }
    updateProfileMut.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
      birthday: birthday || undefined,
    })
  }

  const isLoading =
    uploadMut.isPending ||
    updateProfileMut.isPending

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">账户设置</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* ─── Avatar ─── */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleAvatarClick}
            className="relative w-20 h-20 rounded-full overflow-hidden bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors"
          >
            {avatarUrl ? (
              <img
                src={resolveImageUrl(avatarUrl)}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                <User className="w-8 h-8" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="mt-2 text-xs text-[var(--text-muted)]">点击设置头像</p>
        </div>

        {/* ─── Global Messages ─── */}
        {error && <AlertBanner type="error" message={error} />}
        {success && <AlertBanner type="success" message={success} />}

        {/* ─── Basic Info ─── */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] px-4">
          <FormRow icon={<User className="w-4 h-4" />} label="昵称">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入昵称"
              className="w-full h-10 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </FormRow>

          <FormRow icon={<Mail className="w-4 h-4" />} label="邮箱">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱（选填）"
              className="w-full h-10 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </FormRow>

          <FormRow icon={<Calendar className="w-4 h-4" />} label="生日">
            {birthday ? (
              <span className="text-sm text-[var(--text-primary)]">{birthday}</span>
            ) : (
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                placeholder="请选择生日（选填）"
                className="w-full h-10 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            )}
          </FormRow>

          {birthday && (
            <div className="flex items-center gap-1.5 px-4 py-2 -mt-2 mb-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Info className="w-3.5 h-3.5 shrink-0" />
              生日已设置，不可修改
            </div>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={isLoading}
            className="w-full py-3 mt-2 mb-4 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {updateProfileMut.isPending ? '保存中...' : '保存资料'}
          </button>
        </div>

        {/* ─── Security Settings ─── */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
          <button
            onClick={() => navigate('/change-phone')}
            className="w-full flex items-center justify-between px-4 py-4 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm text-[var(--text-primary)]">修改手机号</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--text-muted)]">
                {user?.phone || '-'}
              </span>
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
          </button>
          <button
            onClick={() => navigate('/change-password')}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-[var(--bg-elevated)]/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm text-[var(--text-primary)]">修改密码</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
