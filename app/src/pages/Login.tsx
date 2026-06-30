import { useState } from 'react'
import { motion } from 'framer-motion'
import { MeshGradient } from '@paper-design/shaders-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ExternalLink, Eye, EyeOff, Headset, LockKeyhole, X } from 'lucide-react'
import { login } from '@/api/auth'
import { getPagePublicSettings } from '@/api/settings'
import { useAuthStore } from '@/stores/authStore'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'
import LanguageSelect from '@/components/LanguageSelect'
import LoginHero from '@/components/LoginHero'

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

function parseOverlay(value: unknown) {
  const num = Number(value)
  if (Number.isNaN(num)) return 72
  return Math.min(Math.max(num, 0), 92)
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
    <div className="relative min-h-[100dvh] overflow-hidden text-white lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <div className="fixed right-5 top-5 z-50">
        <LanguageSelect />
      </div>

      {/* Full-page shader background */}
      <div className="fixed inset-0 -z-10">
        <MeshGradient
          className="absolute inset-0 h-full w-full"
          colors={['#ffffff', '#e0f2fe', '#06b6d4', '#f97316', '#bae6fd']}
          speed={0.25}
          distortion={0.4}
          swirl={0.25}
          grainMixer={0.15}
          grainOverlay={0.05}
          scale={1}
        />
        <MeshGradient
          className="absolute inset-0 h-full w-full opacity-70"
          colors={['#ffffff', '#67e8f9', '#fdba74', '#0ea5e9']}
          speed={0.18}
          distortion={0.35}
          swirl={0.15}
          grainMixer={0.1}
          scale={1.3}
        />
        {bgVideoUrl && (
          <video
            src={bgVideoUrl}
            className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-overlay"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        {bgImageUrl && (
          <img src={bgImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-overlay" />
        )}
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/20" />
      </div>

      <section className="relative hidden min-h-[100dvh] overflow-hidden lg:flex">
        <LoginHero
          brandName={brandName}
          subtitle={subtitle}
          heroTitle={heroTitle}
          heroDesc={heroDesc}
          featureCards={featureCards}
          logoUrl={pageSettings?.logo}
          footerText={footerText || securityText}
          onIntroOpen={() => setIntroOpen(true)}
        />
      </section>

      <section className="relative flex min-h-[100dvh] items-center justify-center px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[440px]"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <motion.div
              className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-lg shadow-cyan-500/10 backdrop-blur-xl"
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <Headset className="h-8 w-8 text-cyan-300" />
              )}
            </motion.div>
            <h1 className="text-2xl font-bold text-white drop-shadow">{brandName}</h1>
            <p className="mt-1 text-sm text-white/55">{subtitle}</p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            onSubmit={handleSubmit}
            className="relative space-y-6 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-[60px]"
            style={{
              boxShadow:
                'inset 0 1.5px 1px rgba(255,255,255,0.18), 0 30px 70px -20px rgba(0,0,0,0.55)',
            }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <motion.div
              className="pointer-events-none absolute -top-32 -left-32 h-64 w-64 rounded-full bg-cyan-400/15 blur-[100px]"
              animate={{ x: [0, 120, 0], y: [0, 60, 0], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-orange-400/12 blur-[100px]"
              animate={{ x: [0, -100, 0], y: [0, -60, 0], opacity: [0.25, 0.45, 0.25] }}
              transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="relative z-10">
              <h2 className="text-xl font-semibold text-white">{formTitle}</h2>
              <p className="mt-1 text-sm text-white/50">{formDesc}</p>
            </div>

            <div className="relative z-10 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/55">手机号</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                  autoComplete="username"
                  className="w-full h-12 px-4 bg-white/[0.05] border border-white/10 rounded-xl text-base text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.10] focus:border-white/25 focus:ring-1 focus:ring-white/5 transition-all"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/55">密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    className="w-full h-12 px-4 pr-11 bg-white/[0.05] border border-white/10 rounded-xl text-base text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.10] focus:border-white/25 focus:ring-1 focus:ring-white/5 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="relative z-10 text-sm text-red-400"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'group relative z-10 w-full h-[52px] overflow-hidden rounded-full border text-base font-semibold transition-all',
                loading
                  ? 'border-white/10 bg-white/10 text-white cursor-not-allowed'
                  : 'border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 active:scale-[0.98]'
              )}
            >
              {!loading && (
                <motion.span
                  className="absolute inset-0 bg-gradient-to-r from-cyan-500/80 to-orange-500/80"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              )}
              {loading && <span className="absolute inset-0 bg-white/10" />}
              <span className="relative z-10">{loading ? '登录中...' : '登录'}</span>
            </button>

            <div className="relative z-10 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <p className="text-xs leading-5 text-white/45">{securityText}</p>
            </div>
          </motion.form>

          {showDemoAccount && (
            <p className="mt-5 text-center text-xs text-white/40">{demoText}</p>
          )}
          <p className="mt-1.5 text-center text-xs text-white/40">{supportText}</p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setIntroOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/60 backdrop-blur-md transition-colors hover:bg-white/[0.08] hover:text-white"
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
