import { useState, useEffect, useRef, useCallback, type FormEvent, type ChangeEvent } from 'react'
import { Eye, EyeOff, Sun, Moon, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AuthMode = 'login' | 'register'

export interface AnimatedSignInProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onSubmit: (values: { phone: string; password: string; name?: string; birthday?: string }) => Promise<void> | void
  loading?: boolean
  error?: string
  onBack?: () => void
}

export function AnimatedSignIn({
  mode,
  onModeChange,
  onSubmit,
  loading = false,
  error: apiError,
  onBack,
}: AnimatedSignInProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [birthday, setBirthday] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Initialize theme from user preference
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDarkMode(prefersDark)
  }, [])

  // Particle background animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number

    const setCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    setCanvasSize()
    window.addEventListener('resize', setCanvasSize)

    const canvasWidth = canvas.width
    const canvasHeight = canvas.height

    class Particle {
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      color: string

      constructor() {
        this.x = Math.random() * canvasWidth
        this.y = Math.random() * canvasHeight
        this.size = Math.random() * 3 + 1
        this.speedX = (Math.random() - 0.5) * 0.5
        this.speedY = (Math.random() - 0.5) * 0.5
        this.color = isDarkMode
          ? `rgba(255, 255, 255, ${Math.random() * 0.2})`
          : `rgba(79, 70, 255, ${Math.random() * 0.2})`
      }

      update() {
        this.x += this.speedX
        this.y += this.speedY

        if (this.x > canvasWidth) this.x = 0
        if (this.x < 0) this.x = canvasWidth
        if (this.y > canvasHeight) this.y = 0
        if (this.y < 0) this.y = canvasHeight
      }

      draw() {
        if (!ctx) return
        ctx.fillStyle = this.color
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const particles: Particle[] = []
    const particleCount = Math.min(100, Math.floor((canvasWidth * canvasHeight) / 15000))

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }

    const animate = () => {
      if (!ctx) return
      ctx.clearRect(0, 0, canvasWidth, canvasHeight)

      for (const particle of particles) {
        particle.update()
        particle.draw()
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', setCanvasSize)
      cancelAnimationFrame(animationId)
    }
  }, [isDarkMode])

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev)
  }, [])

  const phoneValid = /^1[3-9]\d{9}$/.test(phone)
  const passwordValid = password.length >= 6
  const confirmValid = password === confirmPassword && confirmPassword.length > 0
  const nameValid = name.trim().length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setTouched({ phone: true, password: true, name: true, confirmPassword: true })

    if (!phoneValid || !passwordValid) return
    if (mode === 'register' && (!nameValid || !confirmValid)) return

    await onSubmit(
      mode === 'login'
        ? { phone, password }
        : { phone, password, name: name.trim(), birthday: birthday || undefined }
    )
  }

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
  }

  const maxBirthday = new Date().toISOString().slice(0, 10)

  return (
    <div className={cn('login-container', isDarkMode ? 'dark' : 'light')}>
      <canvas ref={canvasRef} className="particles-canvas" />

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="back-button"
          aria-label="返回"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <button
        type="button"
        onClick={toggleDarkMode}
        className="theme-toggle"
        aria-label={isDarkMode ? '切换亮色模式' : '切换暗色模式'}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className="login-card">
        <div className="login-card-inner">
          <div className="login-header">
            <h1>{mode === 'login' ? '欢迎回来' : '创建账号'}</h1>
            <p>{mode === 'login' ? '请登录以继续' : '注册成为会员'}</p>
          </div>

          <div className="mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={cn('mode-tab', mode === 'login' && 'active')}
              onClick={() => onModeChange('login')}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={cn('mode-tab', mode === 'register' && 'active')}
              onClick={() => onModeChange('register')}
            >
              注册
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <div className={cn('form-field', submitted && !nameValid && 'invalid')}>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder=" "
                  required
                />
                <label htmlFor="name">姓名</label>
                {submitted && !nameValid && <span className="error-message">请填写姓名</span>}
              </div>
            )}

            <div
              className={cn(
                'form-field',
                ((submitted || touched.phone) && phone && !phoneValid) && 'invalid'
              )}
            >
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                placeholder=" "
                maxLength={11}
                required
              />
              <label htmlFor="phone">手机号</label>
              {(submitted || touched.phone) && phone && !phoneValid && (
                <span className="error-message">手机号格式错误</span>
              )}
            </div>

            {mode === 'register' && (
              <div className="form-field">
                <input
                  id="birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  max={maxBirthday}
                  placeholder=" "
                />
                <label htmlFor="birthday">生日</label>
              </div>
            )}

            <div
              className={cn(
                'form-field',
                ((submitted || touched.password) && password && !passwordValid) && 'invalid'
              )}
            >
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder=" "
                required
              />
              <label htmlFor="password">
                {mode === 'register' ? '设置密码（至少6位）' : '密码'}
              </label>
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              {(submitted || touched.password) && password && !passwordValid && (
                <span className="error-message">密码至少6位</span>
              )}
            </div>

            {mode === 'register' && (
              <div
                className={cn(
                  'form-field',
                  submitted && confirmPassword && !confirmValid && 'invalid'
                )}
              >
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder=" "
                  required
                />
                <label htmlFor="confirmPassword">确认密码</label>
                {submitted && confirmPassword && !confirmValid && (
                  <span className="error-message">两次密码输入不一致</span>
                )}
              </div>
            )}

            {apiError && <div className="submit-error">{apiError}</div>}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </button>
          </form>

          <p className="signup-prompt">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button
              type="button"
              onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? '立即注册' : '去登录'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
