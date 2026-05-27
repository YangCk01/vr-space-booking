import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronLeft,
  Camera,
  User,
  Phone,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { updateProfile, updatePhone, changePassword, uploadAvatar } from '@/api/auth'
import { resolveImageUrl } from '@/api/client'
import { useMutation } from '@tanstack/react-query'

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

/* ─── Password input with toggle ─── */
function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pr-10 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
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
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '')

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setEmail(user.email || '')
      setAvatarUrl(user.avatar || '')
    }
  }, [user])

  const [newPhone, setNewPhone] = useState('')
  const [phonePassword, setPhonePassword] = useState('')

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
    onSuccess: (data) => {
      refreshUser()
      showSuccess('资料更新成功')
    },
    onError: (err: any) => showError(err?.response?.data?.message || '更新失败'),
  })

  const updatePhoneMut = useMutation({
    mutationFn: () => updatePhone(newPhone, phonePassword),
    onSuccess: (data) => {
      refreshUser()
      setNewPhone('')
      setPhonePassword('')
      showSuccess('手机号修改成功')
    },
    onError: (err: any) => showError(err?.response?.data?.message || '修改失败'),
  })

  const changePasswordMut = useMutation({
    mutationFn: () => changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showSuccess('密码修改成功')
    },
    onError: (err: any) => showError(err?.response?.data?.message || '修改失败'),
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
    updateProfileMut.mutate({ name: name.trim(), email: email.trim() || undefined })
  }

  const handleSavePhone = () => {
    if (!newPhone.trim() || newPhone.length !== 11) {
      showError('请输入正确的11位手机号')
      return
    }
    if (!phonePassword) {
      showError('请输入密码验证')
      return
    }
    updatePhoneMut.mutate()
  }

  const handleSavePassword = () => {
    if (!oldPassword) {
      showError('请输入原密码')
      return
    }
    if (newPassword.length < 6) {
      showError('新密码至少6位')
      return
    }
    if (newPassword !== confirmPassword) {
      showError('两次输入的新密码不一致')
      return
    }
    changePasswordMut.mutate()
  }

  const isLoading =
    uploadMut.isPending ||
    updateProfileMut.isPending ||
    updatePhoneMut.isPending ||
    changePasswordMut.isPending

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
              <img src={resolveImageUrl(avatarUrl)} alt="avatar" className="w-full h-full object-cover" />
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

        {/* ─── Messages ─── */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--error)]/10 text-[var(--error)] text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--success)]/10 text-[var(--success)] text-sm"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {success}
          </motion.div>
        )}

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

          <button
            onClick={handleSaveProfile}
            disabled={isLoading}
            className="w-full py-3 mt-2 mb-4 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {updateProfileMut.isPending ? '保存中...' : '保存资料'}
          </button>
        </div>

        {/* ─── Phone ─── */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] px-4">
          <p className="pt-4 text-sm font-medium text-[var(--text-primary)]">修改手机号</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            当前手机号：{user?.phone || '-'}
          </p>

          <FormRow icon={<Phone className="w-4 h-4" />} label="新手机号">
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="请输入新手机号"
              className="w-full h-10 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </FormRow>

          <FormRow icon={<Lock className="w-4 h-4" />} label="密码验证">
            <PasswordInput
              value={phonePassword}
              onChange={setPhonePassword}
              placeholder="请输入当前密码"
            />
          </FormRow>

          <button
            onClick={handleSavePhone}
            disabled={isLoading}
            className="w-full py-3 mt-2 mb-4 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {updatePhoneMut.isPending ? '修改中...' : '修改手机号'}
          </button>
        </div>

        {/* ─── Password ─── */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] px-4">
          <p className="pt-4 text-sm font-medium text-[var(--text-primary)]">修改密码</p>

          <FormRow icon={<Lock className="w-4 h-4" />} label="原密码">
            <PasswordInput
              value={oldPassword}
              onChange={setOldPassword}
              placeholder="请输入原密码"
            />
          </FormRow>

          <FormRow icon={<Lock className="w-4 h-4" />} label="新密码">
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              placeholder="新密码至少6位"
            />
          </FormRow>

          <FormRow icon={<Lock className="w-4 h-4" />} label="确认新密码" error={confirmPassword && newPassword !== confirmPassword ? '两次输入不一致' : undefined}>
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="请再次输入新密码"
            />
          </FormRow>

          <button
            onClick={handleSavePassword}
            disabled={isLoading}
            className="w-full py-3 mt-2 mb-4 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {changePasswordMut.isPending ? '修改中...' : '修改密码'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
