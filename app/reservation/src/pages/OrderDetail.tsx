import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  Clock,
  MapPin,
  Store,
  Ticket,
  HelpCircle,
  XCircle,
  ArrowRight,
  ExternalLink,
  Phone,
  Calendar,
  Users,
  AlertCircle,
} from 'lucide-react'
import { getOrder } from '@/api/orders'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/lib/imageUrl'
import { SimpleQRCode } from '@/components/SimpleQRCode'
import { formatAmount } from '@/lib/refund'

const groupBuyStatusMap: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: '待支付', color: 'text-[var(--warning)]', bg: 'bg-[var(--warning)]/10' },
  PAID: { label: '待使用', color: 'text-[var(--accent-primary)]', bg: 'bg-[var(--accent-primary)]/10' },
  READY_TO_VERIFY: { label: '待核销', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  PLAYING: { label: '使用中', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  COMPLETED: { label: '已使用', color: 'text-[var(--success)]', bg: 'bg-[var(--success)]/10' },
  NO_SHOW: { label: '已作废', color: 'text-[var(--text-muted)]', bg: 'bg-[var(--text-muted)]/10' },
  CANCELLED: { label: '已取消', color: 'text-[var(--text-muted)]', bg: 'bg-[var(--text-muted)]/10' },
  REFUNDED: { label: '已退款', color: 'text-[var(--text-muted)]', bg: 'bg-[var(--text-muted)]/10' },
}

function formatExpireAt(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isLoggedIn, isLoading: authLoading } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  const [showHelp, setShowHelp] = useState(false)
  const [showAllVenues, setShowAllVenues] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id!),
    enabled: !!id && isLoggedIn,
  })

  const pkg = order?.groupBuyPackage
  const isGroupBuy = !!pkg
  const status = groupBuyStatusMap[order?.status] || {
    label: order?.status || '',
    color: 'text-[var(--text-muted)]',
    bg: 'bg-[var(--text-muted)]/10',
  }
  const usable = ['PAID', 'READY_TO_VERIFY'].includes(order?.status)
  const refundable = ['PAID', 'READY_TO_VERIFY'].includes(order?.status)
  const canRebuy = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'NO_SHOW'].includes(order?.status)
  const hasBooking = !!order?.booking

  const handleBook = () => {
    if (hasBooking) {
      toastSuccess('已预约，请到订单列表查看')
      return
    }
    if (!isGroupBuy) {
      toastError('非团购订单不支持在线预约')
      return
    }
    navigate(`/group-booking/${order.id}`)
  }

  if (isLoading || authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order || !isLoggedIn) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)] px-6 bg-[var(--bg-primary)]">
        <XCircle className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">订单不存在或已删除</p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 px-6 py-2 rounded-xl text-sm font-medium text-white bg-gradient-accent"
        >
          返回订单列表
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] bg-[var(--bg-primary)] pb-28"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button
            onClick={() => navigate('/orders')}
            className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">订单详情</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* 状态区（普通订单展示，改签费订单不展示） */}
        {order.orderKind !== 'FEE' && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', status.bg)}>
                  <Clock className={cn('w-5 h-5', status.color)} />
                </div>
                <div>
                  <p className={cn('text-base font-bold', status.color)}>{status.label}</p>
                  {order.expireAt && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      请在 {formatExpireAt(order.expireAt)} 前到店体验
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowHelp(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--warning)]/30 text-[var(--warning)] text-xs font-medium bg-[var(--warning)]/10"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                去哪找？
              </button>
            </div>
          </div>
        )}

        {/* 改签费订单信息 --}
        {order.orderKind === 'FEE' && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20">
                改签费
              </span>
              <span className="text-sm text-[var(--text-secondary)]">{order.feeReason || '改签手续费'}</span>
            </div>
            <div className="space-y-2.5 text-sm">
              {order.parentOrder && (
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>关联订单</span>
                  <span className="text-[var(--text-primary)] font-mono">{order.parentOrder.orderNo}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--text-primary)] font-bold pt-2 border-t border-[var(--border-subtle)]">
                <span>费用金额</span>
                <span className="text-[var(--error)]">{formatAmount(order.amount)}</span>
              </div>
              {order.refundAmount && order.refundAmount > 0 && (
                <div className="flex justify-between text-[var(--error)]">
                  <span>{order.status === 'CANCELLED' ? '已退费' : '已退款'}</span>
                  <span>-{formatAmount(order.refundAmount)}</span>
                </div>
              )}
            </div>
            {order.status === 'PENDING' && (
              <button
                onClick={() => navigate('/pay/' + order.id)}
                className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-white bg-gradient-accent shadow-glow-sm"
              >
                去支付
              </button>
            )}
          </div>
        )}

        {/* 商品卡片 */}
        {!order.orderKind || order.orderKind !== 'FEE' ? (
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-xl bg-[var(--bg-elevated)] overflow-hidden shrink-0">
              <img
                src={getImageUrl(pkg?.coverImage || order.booking?.game?.coverImage || null)}
                alt={pkg?.title || order.booking?.game?.title || 'VR体验'}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight">
                {isGroupBuy ? `【${pkg.label}】${pkg.title}` : (order.booking?.game?.title || 'VR体验')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                {isGroupBuy ? '随时退 · 过期自动退 · 需预约' : order.venueName}
              </p>
              {hasBooking && (
                <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {order.bookingTime}
                </p>
              )}
              <div className="flex items-center justify-between mt-3">
                <span className="text-base font-black text-[var(--error)]">{formatAmount(order.amount)}</span>
                <span className="text-xs text-[var(--text-secondary)]">x{order.quantity || 1}</span>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {/* 券码信息 */}
        {isGroupBuy && order.verifyCode && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-sm font-bold text-[var(--text-primary)]">券码信息</span>
              </div>
              <span className={cn('text-xs font-medium', usable ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]')}>
                {usable ? `${order.quantity || 1}张可用 · 未核销` : status.label}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-5">到店后向工作人员出示二维码或券码完成核销</p>
            <div className="flex flex-col items-center">
              <div className="p-3 bg-white rounded-xl border border-[var(--border-subtle)] shadow-sm">
                <SimpleQRCode value={order.verifyCode} size={160} />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-4">券码编号</p>
              <p className="text-sm font-mono font-bold text-[var(--text-primary)] mt-0.5">{order.verifyCode}</p>
            </div>
          </div>
        )}

        {/* 使用方式 */}
        {isGroupBuy && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20">
                使用方式
              </span>
              <span className="text-sm text-[var(--text-primary)]">APP下单使用/到店核销使用</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-4">在线提前预约，到店享服务</p>
            <button
              onClick={handleBook}
              disabled={!usable}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-accent disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-sm"
            >
              {hasBooking ? '已预约' : '在线预约'}
            </button>
            {hasBooking && order.bookingTime && (
              <p className="text-xs text-[var(--text-secondary)] mt-3 text-center">
                预约时间：{order.bookingTime}
              </p>
            )}
          </div>
        )}

        {/* 适用门店 */}
        {isGroupBuy && pkg.venues && pkg.venues.length > 0 && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Store className="w-4 h-4 text-[var(--accent-primary)]" />
              <span className="text-sm font-bold text-[var(--text-primary)]">适用门店</span>
            </div>
            {(() => {
              const primaryVenue = pkg.venues.find((v: any) => v.id === order?.venueId) || pkg.venues[0]
              const v = primaryVenue
              const now = new Date()
              const cur = now.getHours() * 60 + now.getMinutes()
              const [oh, om] = (v.openTime || '10:00').split(':').map(Number)
              const [ch, cm] = (v.closeTime || '22:00').split(':').map(Number)
              const open = oh * 60 + om
              const close = ch * 60 + cm
              const isOpen = cur >= open && cur <= close
              return (
                <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                  <button
                    onClick={() => navigate(`/venue/${v.id}`)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <div className="w-14 h-14 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden">
                      {v.image ? (
                        <img src={getImageUrl(v.image)} alt={v.name} className="w-full h-full object-cover" />
                      ) : (
                        'VR'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{v.name}</p>
                      <p className="text-xs text-[var(--error)] mt-1 truncate">
                        {v.address || '到店前请确认预约时间'} {v.address && '|'} {isOpen ? '营业中' : '已休息'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        onClick={(e) => { e.stopPropagation(); navigate(`/venue/${v.id}`) }}
                        className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </span>
                      {v.phone && (
                        <a
                          href={`tel:${v.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </button>
                  {pkg.venues.length > 1 && (
                    <button
                      onClick={() => setShowAllVenues(true)}
                      className="w-full py-2.5 text-sm text-[var(--text-secondary)] border-t border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors flex items-center justify-center gap-1"
                    >
                      {pkg.venues.length}家适用门店
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* 团购详情 */}
        {isGroupBuy && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">团购详情</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>{pkg.title}</span>
                <span>({order.quantity || 1}份) {formatAmount(pkg.totalGroupPrice * (order.quantity || 1))}</span>
              </div>
              {pkg.originalPricePerPerson && pkg.originalPricePerPerson > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--error)]">团购优惠</span>
                  <span className="text-[var(--error)]">
                    -{formatAmount((pkg.originalPricePerPerson * pkg.maxPeople * (order.quantity || 1)) - order.amount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[var(--text-primary)] font-bold pt-2 border-t border-[var(--border-subtle)]">
                <span>实付金额</span>
                <span className="text-[var(--error)]">{formatAmount(order.amount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 联系商家 */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-sm text-[var(--text-primary)]">联系商家</span>
          </div>
          <button
            onClick={() => navigate('/store-contact')}
            className="text-xs font-medium text-[var(--accent-primary)] px-3 py-1.5 rounded-full border border-[var(--accent-primary)]/25 hover:bg-[var(--accent-primary)]/10"
          >
            查看联系方式
          </button>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[var(--border-subtle)]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-end gap-3">
          {order.orderKind === 'FEE' ? (
            <button
              onClick={() => navigate('/orders')}
              className="px-5 py-2.5 rounded-full text-sm font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              返回订单列表
            </button>
          ) : (
            <>
              {refundable && (
                <button
                  onClick={() => navigate(`/refund/${order.id}`)}
                  className="px-5 py-2.5 rounded-full text-sm font-bold text-[var(--error)] border border-[var(--error)]/25 hover:bg-[var(--error)]/10 transition-colors"
                >
                  {order.groupBuyPackage && !order.booking ? '申请退款' : '取消退费'}
                </button>
              )}
              {canRebuy && pkg?.id && (
                <button
                  onClick={() => navigate(`/group-buy/${pkg.id}`)}
                  className="px-5 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-accent shadow-glow-sm"
                >
                  再来一单
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 去哪找弹窗 */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0"
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl max-w-sm w-full border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
            >
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[var(--warning)]">去哪找？</h3>
                  <button
                    onClick={() => setShowHelp(false)}
                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <ol className="space-y-3 text-sm text-[var(--text-primary)] list-decimal pl-4">
                  <li>进入「我的订单」后切换到「待使用」</li>
                  <li>点击订单卡片中的「去使用」</li>
                  <li>到店后出示券码由门店核销入场或继续点击在线预约</li>
                </ol>
                <div className="rounded-xl p-3 bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 text-center">
                  <p className="text-sm font-medium text-[var(--accent-primary)]">券码仅在预约时间前后开放使用</p>
                </div>
                <button
                  onClick={() => setShowHelp(false)}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-accent"
                >
                  我知道了
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 全部适用门店弹窗 */}
      <AnimatePresence>
        {showAllVenues && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0"
            onClick={() => setShowAllVenues(false)}
          >
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl max-w-sm w-full max-h-[80vh] flex flex-col border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">适用门店（{pkg.venues.length}家）</h3>
                <button
                  onClick={() => setShowAllVenues(false)}
                  className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-3">
                {[pkg.venues.find((v: any) => v.id === order?.venueId), ...pkg.venues.filter((v: any) => v.id !== order?.venueId)].filter(Boolean).map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => { setShowAllVenues(false); navigate(`/venue/${v.id}`) }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] text-left hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="w-12 h-12 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                      {v.image ? (
                        <img src={getImageUrl(v.image)} alt={v.name} className="w-full h-full object-cover" />
                      ) : (
                        'VR'
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{v.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{v.address || '到店前请确认预约时间'}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        营业时间 {v.openTime || '10:00'} - {v.closeTime || '22:00'}
                        {v.phone && ` · ${v.phone}`}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
