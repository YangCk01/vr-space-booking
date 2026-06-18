import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, CheckCircle2, ChevronRight, Store, Info, CircleDollarSign, MapPin, Share2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getPublicGroupBuy } from '@/api/groupBuys'
import { getImageUrl } from '@/lib/imageUrl'
import { useToast } from '@/hooks/useToast'

export default function GroupBuyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { success: toastSuccess, error: toastError } = useToast()
  const [showAllVenues, setShowAllVenues] = useState(false)

  const handleShare = async () => {
    const shareData = {
      title: pkg?.title ? `【${pkg.label}】${pkg.title}` : 'VR大空间团购套餐',
      text: pkg?.subtitle || `快来抢购 ${pkg?.title} 团购套餐`,
      url: window.location.href,
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        // 用户取消分享，不提示错误
        if ((err as Error).name !== 'AbortError') {
          toastError('分享失败')
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url)
        toastSuccess('链接已复制，快去分享吧')
      } catch {
        toastError('复制链接失败')
      }
    }
  }

  const { data: pkg, isLoading } = useQuery({
    queryKey: ['public-group-buy', id],
    queryFn: () => getPublicGroupBuy(id!),
    enabled: !!id,
    staleTime: 60000,
  })

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg-primary)]">
        <p className="text-[var(--text-secondary)]">加载中...</p>
      </div>
    )
  }

  if (!pkg) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg-primary)]">
        <p className="text-[var(--text-secondary)]">套餐不存在</p>
      </div>
    )
  }

  const game = pkg.game
  const venues = pkg.venues || []
  const primaryVenue = venues[0]
  const originalPrice = pkg.originalPricePerPerson * pkg.maxPeople
  const discount = originalPrice > 0 ? Math.round((pkg.totalGroupPrice / originalPrice) * 100) : 100
  const saved = originalPrice - pkg.totalGroupPrice

  const goToVenue = (venueId: string) => {
    navigate(`/venue/${venueId}?groupBuy=${pkg.id}&gameId=${pkg.gameId}`)
  }
  const handleBuy = () => {
    if (!game) return
    navigate(`/group-buy-confirm/${pkg.id}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      {/* Hero image */}
      <div className="relative w-full aspect-[4/3] bg-[var(--bg-elevated)]">
        {pkg.coverImage ? (
          <img src={getImageUrl(pkg.coverImage)} alt={pkg.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={handleShare}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
          aria-label="分享"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-6 relative z-10 space-y-3">
        {/* Price card */}
        <div className="bg-white rounded-2xl p-4 shadow-lg border border-[var(--border-subtle)]">
          <div className="flex items-end gap-3">
            <div className="flex items-baseline">
              <span className="text-[var(--error)] text-sm font-bold">¥</span>
              <span className="text-[var(--error)] text-4xl font-black leading-none">{(pkg.totalGroupPrice / 100).toFixed(0)}</span>
            </div>
            {discount < 100 && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--error)]/10 text-[var(--error)] text-xs font-bold">
                {(discount / 10).toFixed(discount % 10 === 0 ? 0 : 1)}折
              </span>
            )}
            <div className="flex-1" />
            <div className="text-right text-xs text-[var(--text-muted)]">
              <p>零售价 <span className="line-through">¥{(originalPrice / 100).toFixed(0)}</span></p>
              <p className="text-[var(--text-primary)]">团购优惠 <span className="text-[var(--error)]">-¥{(saved / 100).toFixed(0)}</span></p>
            </div>
          </div>
          <div className="mt-3">
            <h1 className="text-lg font-black text-[var(--text-primary)] leading-tight">【{pkg.label}】{pkg.title}</h1>
            {pkg.subtitle && <p className="text-xs text-[var(--text-secondary)] mt-1">{pkg.subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {pkg.soldText && <span className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs">{pkg.soldText}</span>}
            {pkg.refundTags.map((tag, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs">{tag}</span>
            ))}
          </div>
        </div>

        {/* Package content */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-black text-[var(--text-primary)]">套餐内容</h2>
            <span className="px-3 py-1 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] text-xs font-bold">{pkg.label}</span>
          </div>
          <div className="space-y-2">
            {(pkg.packageItems.length > 0 ? pkg.packageItems : [
              `《${game?.title || pkg.title}》${pkg.maxPeople}人体验 1 场`,
              `含 ${pkg.maxPeople} 人入场名额、设备调试、场地服务`,
              `体验时长 ${game?.duration || 30} 分钟，需提前预约场次`,
            ]).map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary)] mt-0.5 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Venue */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-black text-[var(--text-primary)]">适用门店</h2>
            {venues.length > 1 && (
              <button onClick={() => setShowAllVenues((v) => !v)} className="text-xs text-[var(--text-muted)] flex items-center">
                {venues.length}店通用 <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAllVenues ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>
          {!showAllVenues ? (
            <button onClick={() => primaryVenue && goToVenue(primaryVenue.id)} className="w-full flex items-start gap-3 text-left">
              <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1">
                  {primaryVenue?.name || '选择适用门店'} <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {primaryVenue?.openTime && primaryVenue?.closeTime ? `营业中 ${primaryVenue.openTime.slice(0, 5)}-${primaryVenue.closeTime.slice(0, 5)}` : '营业中 10:00-22:00'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">到店前请确认预约时间，节假日以门店实际排期为准</p>
              </div>
            </button>
          ) : (
            <div className="space-y-2">
              {venues.map((v) => (
                <button key={v.id} onClick={() => goToVenue(v.id)} className="w-full flex items-start gap-3 text-left p-2 rounded-xl hover:bg-[var(--bg-elevated)] transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1">
                      {v.name} <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </p>
                    {v.address && <p className="text-xs text-[var(--text-secondary)] mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{v.address}</p>}
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {v.openTime && v.closeTime ? `营业中 ${v.openTime.slice(0, 5)}-${v.closeTime.slice(0, 5)}` : '营业中 10:00-22:00'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Process */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)]">
          <h2 className="text-base font-black text-[var(--text-primary)] mb-3">预约流程</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {pkg.processSteps.map((label, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                </div>
                {idx < pkg.processSteps.length - 1 && <div className="w-4 h-px bg-[var(--border-subtle)]" />}
              </div>
            ))}
          </div>
        </div>

        {/* Notice */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)]">
          <h2 className="text-base font-black text-[var(--text-primary)] mb-3">使用须知</h2>
          <div className="space-y-2">
            {(pkg.notice ? pkg.notice.split('\n').filter(Boolean) : [
              `本套餐限 ${pkg.maxPeople} 人同时使用，不可拆分使用。`,
              '需在有效期内完成预约并到店核销。',
              '不可与会员免费体验额度、其他优惠券叠加。',
            ]).map((line, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <Info className="w-4 h-4 text-[var(--accent-primary)] mt-0.5 shrink-0" />
                <span className="whitespace-pre-line">{line}</span>
              </div>
            ))}
            {pkg.description && !pkg.notice && (
              <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <Info className="w-4 h-4 text-[var(--accent-primary)] mt-0.5 shrink-0" />
                <span className="whitespace-pre-line">{pkg.description}</span>
              </div>
            )}
          </div>
        </div>

        {/* Refund */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)]">
          <h2 className="text-base font-black text-[var(--text-primary)] mb-3">退款规则</h2>
          <div className="space-y-2">
            {(pkg.refundNotice ? pkg.refundNotice.split('\n').filter(Boolean) : [
              '未预约或预约开始前 2 小时以上，可随时退款。',
              '已核销或超过预约开始时间后不可退款。',
            ]).map((line, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <CircleDollarSign className="w-4 h-4 text-[var(--accent-primary)] mt-0.5 shrink-0" />
                <span className="whitespace-pre-line">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[var(--border-subtle)] px-5 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-baseline">
            <span className="text-[var(--error)] text-xs font-bold">¥</span>
            <span className="text-[var(--error)] text-2xl font-black">{(pkg.totalGroupPrice / 100).toFixed(0)}</span>
          </div>
          <button
            onClick={handleBuy}
            disabled={!game}
            className="px-8 py-3 rounded-full bg-[var(--accent-primary)] text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
          >
            {primaryVenue ? (pkg.buyButtonText || '立即抢购') : '选择场地'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
