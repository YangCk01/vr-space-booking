import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Building2,
  CalendarDays,
  ExternalLink,
  Eye,
  EyeOff,
  Headset,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import { login } from '@/api/auth'
import { getPagePublicSettings } from '@/api/settings'
import { useAuthStore } from '@/stores/authStore'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'
import LanguageSelect from '@/components/LanguageSelect'

type LoginFeatureCard = {
  title?: string
  desc?: string
  icon?: string
  enabled?: boolean
}

const defaultFeatureCards: LoginFeatureCard[] = [
  { title: '预约排场', desc: '按场次、门店与状态快速处理订单', icon: 'calendar', enabled: true },
  { title: '会员财务', desc: '余额、积分、退款与对账统一管理', icon: 'wallet', enabled: true },
  { title: '审计留痕', desc: '关键操作记录可追溯', icon: 'shield', enabled: true },
]

const featureIcons = {
  calendar: CalendarDays,
  wallet: Wallet,
  shield: ShieldCheck,
  activity: Activity,
  sparkle: Sparkles,
}

function parseOverlay(value: unknown) {
  const num = Number(value)
  if (Number.isNaN(num)) return 72
  return Math.min(Math.max(num, 0), 92)
}

function getFeatureIcon(icon?: string) {
  return featureIcons[(icon || 'activity') as keyof typeof featureIcons] || Activity
}

export default function Login() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('13800000000')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: pageSettings } = useQuery({
    queryKey: ['page-public-settings'],
    queryFn: getPagePublicSettings,
    staleTime: 60_000,
  })

  const brandName = pageSettings?.bLoginTitle || pageSettings?.venueName || 'VR大空间'
  const subtitle = pageSettings?.bLoginSubtitle || '预约排场管理系统'
  const formTitle = pageSettings?.bLoginFormTitle || '登录管理后台'
  const formDesc = pageSettings?.bLoginFormDesc || '处理预约、排场、财务与门店运营'
  const heroTitle = pageSettings?.bLoginHeroTitle || '沉浸式门店运营中枢'
  const heroDesc = pageSettings?.bLoginHeroDesc || '统一管理预约排场、订单核销、会员权益与财务对账。'
  const demoText = pageSettings?.bLoginDemoAccountText || '测试账号: 13800000000 / admin123'
  const supportText = pageSettings?.bLoginSupportText || '遇到登录问题请联系系统管理员'
  const securityText = pageSettings?.bLoginSecurityText || '登录后将记录操作审计日志'
  const footerText = pageSettings?.bLoginFooterText || ''
  const showDemoAccount = pageSettings?.bLoginShowDemoAccount ?? true
  const overlay = parseOverlay(pageSettings?.bLoginBackgroundOverlay)
  const logoUrl = pageSettings?.logo ? getImageUrl(pageSettings.logo, '') : ''
  const bgImageUrl = pageSettings?.bLoginBackgroundImage ? getImageUrl(pageSettings.bLoginBackgroundImage, '') : ''
  const bgVideoUrl = pageSettings?.bLoginBackgroundVideo ? getImageUrl(pageSettings.bLoginBackgroundVideo, '') : ''
  const companyIntro = pageSettings?.venueDescription || 'VR大空间体验馆提供沉浸式虚拟现实体验，支持多人联机互动。'
  const companyWebsite = pageSettings?.companyWebsite || ''
  const companyPhone = pageSettings?.venuePhone || ''
  const companyAddress = pageSettings?.venueAddress || ''
  const companyHours = pageSettings?.venueHours || ''
  const featureCards = (
    Array.isArray(pageSettings?.bLoginFeatureCards) && pageSettings.bLoginFeatureCards.length > 0
      ? pageSettings.bLoginFeatureCards
      : defaultFeatureCards
  ).filter((item: LoginFeatureCard) => item.enabled !== false && (item.title || item.desc))

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
    <div className="min-h-[100dvh] bg-[#07111f] text-white lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <div className="fixed right-5 top-5 z-50">
        <LanguageSelect />
      </div>
      <section className="relative hidden min-h-[100dvh] overflow-hidden lg:flex">
        {bgVideoUrl ? (
          <video
            src={bgVideoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : bgImageUrl ? (
          <img src={bgImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[url('/venue-cyber.jpg')] bg-cover bg-center" />
        )}
        <div className="absolute inset-0 bg-[#07111f]" style={{ opacity: overlay / 100 }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111f] via-[#07111f]/70 to-transparent" />

        <div className="relative z-10 flex w-full flex-col justify-between px-12 py-10 xl:px-16">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/10">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Headset className="h-6 w-6 text-white" />
                )}
              </div>
              <div>
                <p className="text-vr-body font-semibold text-white">{brandName}</p>
                <p className="text-vr-caption text-white/60">{subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIntroOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-vr-body-sm font-medium text-white/85 backdrop-blur transition-colors hover:bg-white/15"
            >
              <Building2 className="h-4 w-4" />
              公司简介
            </button>
          </div>

          <div className="max-w-[620px]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-vr-caption text-white/80">
              <Activity className="h-3.5 w-3.5 text-vraccent-primary" />
              运营后台
            </div>
            <h1 className="text-[44px] font-bold leading-tight tracking-normal text-white xl:text-[56px]">
              {heroTitle}
            </h1>
            <p className="mt-5 max-w-[560px] text-vr-body-lg leading-8 text-white/70">
              {heroDesc}
            </p>
            {featureCards.length > 0 && (
              <div className="mt-8 grid max-w-[720px] grid-cols-3 gap-3">
                {featureCards.slice(0, 3).map((item: LoginFeatureCard, index: number) => {
                  const Icon = getFeatureIcon(item.icon)
                  return (
                    <div key={`${item.title}-${index}`} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                      <Icon className="h-5 w-5 text-vraccent-primary" />
                      <p className="mt-3 text-vr-body-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-vr-caption leading-5 text-white/55">{item.desc}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className="text-vr-caption text-white/45">{footerText || securityText}</p>
        </div>
      </section>

      <section className="flex min-h-[100dvh] items-center justify-center bg-[#07111f] px-5 py-8">
        <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
          className="w-full max-w-[430px]"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-vr-glow-blue">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Headset className="h-8 w-8 text-[#38bdf8]" />
            )}
          </div>
          <h1 className="text-vr-h1 font-bold text-white">{brandName}</h1>
          <p className="mt-1 text-vr-body-sm text-slate-400">{subtitle}</p>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-white/10 bg-[#111827]/95 p-6 shadow-2xl shadow-black/30"
        >
          <div>
            <h2 className="text-vr-h3 font-semibold text-white">{formTitle}</h2>
            <p className="mt-1 text-vr-body-sm text-slate-400">{formDesc}</p>
          </div>
          <div>
            <label className="block text-vr-caption text-slate-300 mb-1.5">
              手机号
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              autoComplete="username"
              className="w-full h-11 px-4 bg-[#0b1220] border border-white/10 rounded-lg text-vr-body-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/25 transition-all"
            />
          </div>

          <div>
            <label className="block text-vr-caption text-slate-300 mb-1.5">
              密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="w-full h-11 px-4 pr-11 bg-[#0b1220] border border-white/10 rounded-lg text-vr-body-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/25 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="text-vr-caption text-red-400"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full h-11 rounded-lg text-vr-body-sm font-semibold transition-all',
              loading
                ? 'bg-[#3B82F6]/50 text-white cursor-not-allowed'
                : 'bg-[#3B82F6] text-white hover:bg-[#2563EB] active:scale-[0.98]'
            )}
          >
            {loading ? '登录中...' : '登录'}
          </button>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start gap-2">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#38bdf8]" />
              <p className="text-vr-caption leading-5 text-slate-400">{securityText}</p>
            </div>
          </div>
        </motion.form>

        {showDemoAccount && (
          <p className="mt-6 text-center text-vr-caption text-slate-500">
            {demoText}
          </p>
        )}
        <p className="mt-2 text-center text-vr-caption text-slate-500">
          {supportText}
        </p>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setIntroOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-vr-body-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Building2 className="h-4 w-4" />
            查看公司简介
          </button>
        </div>
      </motion.div>
      </section>

      {introOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#111827] text-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                  {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5 text-[#38bdf8]" />}
                </div>
                <div>
                  <h2 className="text-vr-h3 font-semibold">{brandName}</h2>
                  <p className="text-vr-caption text-slate-400">公司简介</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIntroOpen(false)}
                aria-label="关闭公司简介"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 px-6 py-5">
              <p className="whitespace-pre-wrap text-vr-body-sm leading-7 text-slate-300">{companyIntro}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {companyPhone && <InfoItem label="联系电话" value={companyPhone} />}
                {companyHours && <InfoItem label="营业时间" value={companyHours} />}
                {companyAddress && <InfoItem label="公司地址" value={companyAddress} className="sm:col-span-2" />}
              </div>
              {companyWebsite && (
                <a
                  href={companyWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-vr-body-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
                >
                  访问公司网址
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function InfoItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/5 p-3", className)}>
      <p className="text-vr-caption text-slate-500">{label}</p>
      <p className="mt-1 text-vr-body-sm text-slate-200">{value}</p>
    </div>
  )
}
