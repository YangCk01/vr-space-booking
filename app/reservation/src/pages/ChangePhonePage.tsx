import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Phone, Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { updatePhone } from '@/api/auth'
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

export default function ChangePhonePage() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()

  const [newPhone, setNewPhone] = useState('')
  const [phonePassword, setPhonePassword] = useState('')
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const updatePhoneMut = useMutation({
    mutationFn: () => updatePhone(newPhone, phonePassword),
    onSuccess: () => {
      refreshUser()
      setNewPhone('')
      setPhonePassword('')
      setAlert({ type: 'success', message: '手机号修改成功' })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || '修改失败'
      setAlert({ type: 'error', message: msg })
    },
  })

  const handleSave = () => {
    if (!newPhone.trim() || newPhone.length !== 11) {
      setAlert({ type: 'error', message: '请输入正确的11位手机号' })
      return
    }
    if (!phonePassword) {
      setAlert({ type: 'error', message: '请输入密码验证' })
      return
    }
    updatePhoneMut.mutate()
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
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">修改手机号</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {alert && <AlertBanner type={alert.type} message={alert.message} />}

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] px-4">
          <p className="pt-4 text-xs text-[var(--text-muted)]">
            当前手机号：{user?.phone || '-'}
          </p>

          <div className="py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                <Phone className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-muted)] mb-1">新手机号</p>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) =>
                    setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                  }
                  placeholder="请输入新手机号"
                  className="w-full h-10 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
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
                <p className="text-xs text-[var(--text-muted)] mb-1">密码验证</p>
                <PasswordInput
                  value={phonePassword}
                  onChange={setPhonePassword}
                  placeholder="请输入当前密码"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={updatePhoneMut.isPending}
          className="w-full py-3 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
        >
          {updatePhoneMut.isPending ? '修改中...' : '修改手机号'}
        </button>
      </div>
    </motion.div>
  )
}
