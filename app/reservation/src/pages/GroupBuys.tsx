import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Users, Crown, UserRound, Clock, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getPublicGroupBuys, type PublicGroupBuyPackage } from '@/api/groupBuys'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'DOUBLE', label: '双人团购' },
  { key: 'THREE', label: '三人团购' },
  { key: 'PRIVATE', label: '包场团购' },
]

const typeStyles: Record<string, string> = {
  DOUBLE: 'from-indigo-900 to-slate-900',
  THREE: 'from-sky-400 to-sky-600',
  PRIVATE: 'from-amber-400 to-amber-600',
}

function GroupBuyCard({ pkg }: { pkg: PublicGroupBuyPackage }) {
  const navigate = useNavigate()
  const game = pkg.game
  const saved = pkg.originalPricePerPerson * pkg.maxPeople - pkg.totalGroupPrice

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden"
    >
      <div className={cn('relative h-40 bg-gradient-to-r p-4 flex flex-col justify-between', typeStyles[pkg.type] || 'from-indigo-900 to-slate-900')}>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-white text-[var(--accent-primary)] text-xs font-bold">{pkg.label}</span>
          {pkg.tags.slice(0, 1).map((tag, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-white/20 text-white text-xs">{tag}</span>
          ))}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white pr-36">{pkg.title}</h3>
          <p className="text-sm text-white/80 mt-0.5 pr-36">{pkg.subtitle || game?.subtitle || ''}</p>
        </div>
        {pkg.coverImage && (
          <img src={getImageUrl(pkg.coverImage)} alt="" className="absolute right-4 top-1/2 -translate-y-1/2 w-32 h-32 rounded-2xl object-cover shadow-lg" />
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-[var(--text-primary)]">{game?.title || pkg.title}</h4>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{game?.subtitle || pkg.subtitle || ''}</p>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs">
            <Clock className="w-3 h-3" />
            {game?.duration || 30}分钟
          </div>
        </div>

        <div className="flex items-end justify-between mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-[var(--error)]">¥{(pkg.totalGroupPrice / 100).toFixed(2)}</span>
            <span className="text-xs text-[var(--text-muted)] line-through">¥{((pkg.originalPricePerPerson * pkg.maxPeople) / 100).toFixed(2)}</span>
            {saved > 0 && <span className="text-xs text-[var(--error)] bg-[var(--error)]/10 px-2 py-0.5 rounded-full">省¥{(saved / 100).toFixed(0)}</span>}
          </div>
          <button
            onClick={() => navigate(`/group-buy/${pkg.id}`)}
            className="px-5 py-2 rounded-full bg-[var(--accent-primary)] text-white text-sm font-medium active:scale-95 transition-transform"
          >
            立即抢购
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function GroupBuys() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')

  const { data: packages, isLoading } = useQuery({
    queryKey: ['public-group-buys', activeTab],
    queryFn: () => getPublicGroupBuys(activeTab === 'all' ? undefined : activeTab),
    staleTime: 60000,
  })

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">团购推荐</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-[var(--text-secondary)]">加载中...</div>
        ) : packages?.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-secondary)]">暂无团购套餐</div>
        ) : (
          <div className="space-y-4">
            {packages?.map((pkg) => <GroupBuyCard key={pkg.id} pkg={pkg} />)}
          </div>
        )}
      </div>
    </motion.div>
  )
}
