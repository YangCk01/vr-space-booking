import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Minus, Plus, ShieldCheck, Tag, Clock, Users, Store } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getPublicGroupBuy } from '@/api/groupBuys'
import { createOrder } from '@/api/orders'
import { getImageUrl } from '@/lib/imageUrl'
import { useAuth } from '@/providers/AuthProvider'
import { useSelectedVenue } from '@/hooks/useSelectedVenue'
import { cn } from '@/lib/utils'

export default function GroupBuyConfirm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isLoggedIn } = useAuth()
  const [selectedVenue] = useSelectedVenue()
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)

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

  const unitOriginal = pkg.originalPricePerPerson * pkg.maxPeople
  const unitGroup = pkg.totalGroupPrice
  const totalOriginal = unitOriginal * quantity
  const totalGroup = unitGroup * quantity
  const discount = totalOriginal - totalGroup
  const maxLimit = 5

  const phone = user?.phone || ''
  const maskedPhone = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : ''

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      navigate('/login')
      return
    }
    setSubmitting(true)
    try {
      const order = await createOrder({
        groupBuyPackageId: pkg.id,
        quantity,
        amount: totalGroup,
        source: 'ONLINE',
        venueId: selectedVenue?.id,
      })
      navigate(`/pay/${order.id}`)
    } catch (err: any) {
      alert(err?.response?.data?.message || '创建订单失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[100dvh] pb-28 bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ChevronLeft className="w-5 h-5 text-[var(--text-primary)]" />
          </button>
          <h1 className="text-base font-bold text-[var(--text-primary)]">确认订单</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {/* Package card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)]">
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-xl bg-[var(--bg-elevated)] overflow-hidden shrink-0">
              {pkg.coverImage ? (
                <img src={getImageUrl(pkg.coverImage)} alt={pkg.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-slate-900" />
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight">【{pkg.label}】{pkg.title}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {pkg.refundTags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[10px] text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-end justify-between mt-2">
                <div className="flex items-baseline">
                  <span className="text-[var(--error)] text-xs font-bold">¥</span>
                  <span className="text-[var(--error)] text-2xl font-black">{(unitGroup / 100).toFixed(0)}</span>
                  <span className="text-[var(--text-muted)] text-xs ml-1 line-through">¥{(unitOriginal / 100).toFixed(0)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)]">限购{maxLimit}份</span>
                  <div className="flex items-center border border-[var(--border-subtle)] rounded-lg">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] disabled:text-[var(--text-muted)]"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center text-sm text-[var(--text-primary)]">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(maxLimit, q + 1))}
                      disabled={quantity >= maxLimit}
                      className="w-8 h-8 flex items-center justify-center text-[var(--accent-primary)] disabled:text-[var(--text-muted)]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 套餐亮点 */}
          {pkg.packageItems && pkg.packageItems.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] space-y-2">
              {pkg.packageItems.slice(0, 3).map((item: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <Tag className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price detail */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">商品总价（共 {quantity} 份）</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>商品总价</span>
              <span>¥{(totalOriginal / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--error)]">团购优惠</span>
              <span className="text-[var(--error)]">-¥{(discount / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>会员优惠</span>
              <span>-¥0.00</span>
            </div>
            <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center">
              <span className="text-[var(--text-primary)] font-bold">应付金额</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[var(--error)] text-xs font-bold">¥</span>
                <span className="text-[var(--error)] text-xl font-black">{(totalGroup / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Phone */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">联系人手机号</span>
          </div>
          <span className="text-sm text-[var(--text-secondary)]">{maskedPhone || '请登录后购买'}</span>
        </div>

        {/* Agreement */}
        <div className="flex items-start gap-2 text-xs text-[var(--text-muted)] px-1">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>提交订单，即代表您同意将手机号提供给商家用于用户账号注册及应用内券码发放</span>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[var(--border-subtle)]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex flex-col justify-center">
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-[var(--text-secondary)]">共 {quantity} 份 合计</span>
              <span className="text-[var(--error)] text-lg font-black">¥{(totalGroup / 100).toFixed(2)}</span>
            </div>
            <span className="text-xs text-[var(--error)]">已优惠 ¥{(discount / 100).toFixed(2)}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !isLoggedIn}
            className="px-8 h-10 rounded-full bg-gradient-accent text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-50 shadow-glow-sm"
          >
            {submitting ? '提交中...' : '提交订单'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
