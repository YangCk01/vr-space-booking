import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, Eye, EyeOff, Phone, Lock, User, Calendar, AlertCircle } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'register'

export default function AuthPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { login, register, refreshUser } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [birthday, setBirthday] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!phone.trim() || !password.trim()) {
      setError('请填写手机号和密码')
      return
    }
    if (phone.length !== 11) {
      setError('手机号格式错误')
      return
    }
    if (password.length < 6) {
      setError('密码至少6位')
      return
    }
    if (mode === 'register') {
      if (!name.trim()) {
        setError('请填写姓名')
        return
      }
      if (password !== confirmPassword) {
        setError('两次密码输入不一致')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login({ phone, password })
      } else {
        await register({ phone, password, name, birthday: birthday || undefined })
      }
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      navigate(-1)
    } catch (err: any) {
      setError(err?.response?.data?.message || '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] flex flex-col"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            {mode === 'login' ? '登录' : '注册'}
          </h1>
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 pt-8 pb-8">
        {/* Mode tabs */}
        <div className="flex bg-[var(--bg-card)] rounded-xl p-1 mb-8">
          <button
            onClick={() => { setMode('login'); setError('') }}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium rounded-lg transition-all',
              mode === 'login' ? 'bg-[var(--accent-primary)] text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            登录
          </button>
          <button
            onClick={() => { setMode('register'); setError('') }}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium rounded-lg transition-all',
              mode === 'register' ? 'bg-[var(--accent-primary)] text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            注册
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">姓名</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入姓名"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">手机号</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入手机号"
                maxLength={11}
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? '请设置密码（至少6位）' : '请输入密码'}
                className="w-full h-11 pl-10 pr-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">生日</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  placeholder="请选择生日"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>
              <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                生日仅可填写一次，提交后不可修改
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">确认密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入密码"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 px-4 py-3 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-xl text-[var(--error)] text-sm"
          >
            {error}
          </motion.div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={cn(
            'w-full h-12 mt-8 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.98]',
            loading ? 'bg-[var(--accent-primary)]/50 cursor-not-allowed' : 'bg-gradient-accent shadow-glow hover:shadow-glow-sm',
          )}
        >
          {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
        </button>

        {/* Hint */}
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            className="text-[var(--accent-primary)] ml-1 hover:underline"
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </motion.div>
  )
}
