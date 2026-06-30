"use client"
import { motion } from 'framer-motion'
import { PulsingBorder } from '@paper-design/shaders-react'
import { Activity, Building2, CalendarDays, ShieldCheck, Wallet } from 'lucide-react'
import { getImageUrl } from '@/lib/imageUrl'

type LoginFeatureCard = {
  title?: string
  desc?: string
  icon?: string
  enabled?: boolean
}

const featureIcons: Record<string, React.ElementType> = {
  calendar: CalendarDays,
  wallet: Wallet,
  shield: ShieldCheck,
  activity: Activity,
}

function getFeatureIcon(icon?: string) {
  return featureIcons[icon || 'activity'] || Activity
}

interface LoginHeroProps {
  brandName: string
  subtitle: string
  heroTitle: string
  heroDesc: string
  featureCards: LoginFeatureCard[]
  logoUrl?: string
  footerText: string
  onIntroOpen: () => void
}

export default function LoginHero({
  brandName,
  subtitle,
  heroTitle,
  heroDesc,
  featureCards,
  logoUrl,
  footerText,
  onIntroOpen,
}: LoginHeroProps) {
  return (
    <div className="relative z-10 flex h-full min-h-[100dvh] w-full flex-col justify-between px-10 py-8 xl:px-14">
      <svg className="absolute inset-0 h-0 w-0">
        <defs>
          <filter id="glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.05
                      0 0 0 0.9 0"
              result="tint"
            />
          </filter>
          <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
        </defs>
      </svg>

      <header className="flex items-center justify-between">
        <motion.div
          className="flex items-center gap-3 group cursor-pointer"
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400, damping: 10 }}
        >
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/10">
            {logoUrl ? (
              <img src={getImageUrl(logoUrl, '')} alt="" className="h-full w-full object-contain" />
            ) : (
              <motion.svg
                fill="currentColor"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className="h-7 w-7 text-white transition-all duration-300 group-hover:drop-shadow-lg"
                style={{ filter: 'url(#logo-glow)' }}
                whileHover={{
                  fill: 'url(#logo-gradient)',
                  rotate: [0, -2, 2, 0],
                  transition: { duration: 0.6, ease: 'easeInOut' },
                }}
              >
                <motion.path d="M15 85V15h12l18 35 18-35h12v70h-12V35L45 70h-10L17 35v50H15z" />
              </motion.svg>
            )}
          </div>
          <div>
            <p className="text-base font-semibold text-white">{brandName}</p>
            <p className="text-sm text-white/60">{subtitle}</p>
          </div>
        </motion.div>

        <button
          type="button"
          onClick={onIntroOpen}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur transition-colors hover:bg-white/15"
        >
          <Building2 className="h-4 w-4" />
          公司简介
        </button>
      </header>

      <main className="my-auto max-w-[680px] pt-16">
        <motion.div
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-sm text-white/90 backdrop-blur-sm"
          style={{ filter: 'url(#glass-effect)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Activity className="h-4 w-4 text-cyan-400" />
          运营后台
        </motion.div>

        <motion.h1
          className="text-5xl font-bold leading-tight tracking-tight text-white xl:text-6xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          {heroTitle}
        </motion.h1>

        <motion.p
          className="mt-5 max-w-[560px] text-lg leading-8 text-white/75"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          {heroDesc}
        </motion.p>

        {featureCards.length > 0 && (
          <motion.div
            className="mt-8 grid max-w-[720px] grid-cols-3 gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            {featureCards.slice(0, 3).map((item, index) => {
              const Icon = getFeatureIcon(item.icon)
              return (
                <div
                  key={`${item.title}-${index}`}
                  className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-xl"
                  style={{
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.15)',
                  }}
                >
                  <Icon className="h-5 w-5 text-cyan-400" />
                  <p className="mt-3 text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/55">{item.desc}</p>
                </div>
              )
            })}
          </motion.div>
        )}
      </main>

      <div className="flex items-end justify-between">
        <motion.p
          className="text-sm text-white/45"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          {footerText}
        </motion.p>

        <motion.div
          className="relative flex h-20 w-20 items-center justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          <PulsingBorder
            colors={['#06b6d4', '#0891b2', '#f97316', '#00FF88', '#ffffff']}
            colorBack="rgba(0,0,0,0)"
            speed={1.5}
            roundness={1}
            thickness={0.1}
            softness={0.2}
            intensity={1}
            bloom={0.4}
            spots={5}
            spotSize={0.1}
            pulse={0.1}
            smoke={0.5}
            smokeSize={0.4}
            style={{ width: '60px', height: '60px', borderRadius: '50%' }}
          />
          <motion.svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            style={{ transform: 'scale(1.6)' }}
          >
            <defs>
              <path id="login-circle" d="M 50, 50 m -38, 0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
            </defs>
            <text className="text-[10px] fill-white/70 font-medium">
              <textPath href="#login-circle" startOffset="0%">
                {brandName} • {subtitle} • {brandName} • {subtitle} •
              </textPath>
            </text>
          </motion.svg>
        </motion.div>
      </div>
    </div>
  )
}
