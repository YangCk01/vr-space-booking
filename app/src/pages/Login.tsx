import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Headset } from 'lucide-react'
import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

export default function Login() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('13800000000')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login({ phone, password })
      localStorage.setItem('accessToken', result.accessToken)
      localStorage.setItem('refreshToken', result.refreshToken)
      queryClient.clear()
      setUser(result.user)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-vrbg-base flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[400px]"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#06B6D4] flex items-center justify-center mb-4 shadow-vr-glow-blue">
            <Headset className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-vr-h1 text-vrtext-primary font-bold">VR大空间</h1>
          <p className="text-vr-body-sm text-vrtext-secondary mt-1">预约排场管理系统</p>
        </div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          onSubmit={handleSubmit}
          className="bg-vrbg-card rounded-2xl border border-vrborder-subtle p-6 space-y-5"
        >
          <div>
            <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
              手机号
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              className="w-full h-11 px-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            />
          </div>

          <div>
            <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
              密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full h-11 px-4 pr-11 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-vrtext-muted hover:text-vrtext-secondary transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="text-vr-caption text-vrerror"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full h-11 rounded-lg text-vr-body-sm font-medium transition-all',
              loading
                ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
                : 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover active:scale-[0.98]'
            )}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </motion.form>

        <p className="text-center text-vr-caption text-vrtext-muted mt-6">
          管理员账号: 13800000000 / admin123
        </p>
      </motion.div>
    </div>
  )
}
