import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { changePassword } from '@/api/auth'
import { useMutation } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

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

export default function ChangePasswordPage() {
  const navigate = useNavigate()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const changePasswordMut = useMutation({
    mutationFn: () => changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setAlert({
        type: 'success',
        message: '密码修改成功，请使用新密码登录',
      })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || '修改失败'
      if (
        msg.includes('原密码') ||
        msg.includes('旧密码') ||
        msg.includes('密码错误')
      ) {
        setAlert({ type: 'error', message: '原密码错误，请重新输入' })
      } else {
        setAlert({ type: 'error', message: msg })
      }
    },
  })

  const handleSave = () => {
    if (!oldPassword) {
      setAlert({ type: 'error', message: '请输入原密码' })
      return
    }
    if (newPassword.length < 6) {
      setAlert({ type: 'error', message: '新密码至少6位' })
      return
    }
    if (newPassword !== confirmPassword) {
      setAlert({ type: 'error', message: '两次输入的新密码不一致' })
      return
    }
    changePasswordMut.mutate()
  }

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
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">修改密码</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {alert && <AlertBanner type={alert.type} message={alert.message} />}

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] px-4">
          <div className="py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                <Lock className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-muted)] mb-1">原密码</p>
                <PasswordInput
                  value={oldPassword}
                  onChange={setOldPassword}
                  placeholder="请输入原密码"
                />
              </div>
            </div>
          </div>

          <div className="py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                <Lock className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-muted)] mb-1">新密码</p>
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="新密码至少6位"
                />
              </div>
            </div>
          </div>

          <div className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                <Lock className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-muted)] mb-1">确认新密码</p>
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="请再次输入新密码"
                />
              </div>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-1.5 text-xs text-[var(--error)] flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                两次输入不一致
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={changePasswordMut.isPending}
          className="w-full py-3 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
        >
          {changePasswordMut.isPending ? '修改中...' : '修改密码'}
        </button>
      </div>
    </motion.div>
  )
}
