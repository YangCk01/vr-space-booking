import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Ticket,
  Clock,
  ScanLine,
  X,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Gift,
  MapPin,
  Store,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { verifyCoupon, getMyCoupons, getMyUserCoupons, type ThirdPartyCoupon, type UserCoupon } from '@/api/coupons'
import { getPlatformConfig, type PlatformConfigMap } from '@/api/settings'
import { useAuth } from '@/providers/AuthProvider'
import { SimpleQRCode } from '@/components/SimpleQRCode'

/* ─── Platform configs ─── */
const platforms = [
  { key: 'MEITUAN' as const, label: '美团', color: '#FFD100', textColor: '#000' },
  { key: 'DOUYIN' as const, label: '抖音', color: '#000000', textColor: '#fff' },
  { key: 'DIANPING' as const, label: '点评', color: '#FF6633', textColor: '#fff' },
]

const sourceLabelMap: Record<string, string> = {
  MEITUAN: '美团',
  DOUYIN: '抖音',
  DIANPING: '大众点评',
}

const preferredThirdPartyCouponCodeKey = 'preferredThirdPartyCouponCode'

const couponStatusMap: Record<ThirdPartyCoupon['status'], { label: string; hint: string; color: string; bg: string }> = {
  UNUSED: {
    label: '待使用',
    hint: '到店出示二维码或券码，由店员扫码/输入后抵扣',
    color: 'text-[var(--accent-primary)]',
    bg: 'bg-[var(--accent-primary)]/10',
  },
  USED: {
    label: '已使用',
    hint: '该券已完成核销抵扣',
    color: 'text-[var(--success)]',
    bg: 'bg-[var(--success)]/10',
  },
  EXPIRED: {
    label: '已过期',
    hint: '该券已过期，不能继续使用',
    color: 'text-[var(--text-muted)]',
    bg: 'bg-[var(--text-muted)]/10',
  },
}

/* ─── QR Scanner Component ─── */
function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let scanner: any = null

    const start = async () => {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode')
        scanner = new Html5QrcodeScanner(
          'qr-reader',
          { fps: 10, qrbox: { width: 250, height: 250 } },
          /* verbose= */ false
        )
        scanner.render(
          (decodedText: string) => {
            onScan(decodedText)
            scanner?.clear?.()
            onClose()
          },
          () => {
            // ignore scan errors (no QR in frame)
          }
        )
      } catch (e) {
        setError('无法启动摄像头，请检查权限设置')
      }
    }

    start()

    return () => {
      try {
        scanner?.clear?.()
      } catch {
        // ignore
      }
    }
  }, [onScan, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
    >
      <div className="absolute top-4 right-4">
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="text-white text-center mb-6 px-6">
        <QrCode className="w-10 h-10 mx-auto mb-3 opacity-80" />
        <h3 className="text-lg font-semibold">扫描二维码</h3>
        <p className="text-sm text-white/60 mt-1">将二维码对准框内即可自动识别</p>
      </div>
      <div className="w-full max-w-sm px-6">
        <div id="qr-reader" ref={scannerRef} />
      </div>
      {error && (
        <p className="mt-4 text-sm text-red-400 px-6 text-center">{error}</p>
      )}
    </motion.div>
  )
}

/* ─── User Coupon Card ─── */
function UserCouponCard({ coupon }: { coupon: UserCoupon }) {
  const isUsed = coupon.status === 'USED'
  const isExpired = coupon.status === 'EXPIRED'
  const isExperience = coupon.type === 'EXPERIENCE_FREE'

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
      style={{ opacity: isUsed || isExpired ? 0.6 : 1 }}
    >
      <div className="flex items-stretch">
        <div
          className="w-1.5 shrink-0"
          style={{ backgroundColor: isExperience ? '#6366f1' : '#10b981' }}
        />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{
                    backgroundColor: isExperience ? '#6366f1' : '#10b981',
                    color: '#fff',
                  }}
                >
                  {isExperience ? '体验券' : '优惠券'}
                </span>
                {isUsed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--text-muted)]/20 text-[var(--text-muted)]">
                    已使用
                  </span>
                )}
                {isExpired && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--error)]/10 text-[var(--error)]">
                    已过期
                  </span>
                )}
                {coupon.source === 'MANUAL_GIFT' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-vrsuccess/10 text-vrsuccess">
                    管理员赠送
                  </span>
                )}
                {coupon.source === 'EXCHANGE' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                    积分兑换
                  </span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mt-1.5">
                {coupon.name}
              </h4>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                有效期至 {coupon.validTo ? new Date(coupon.validTo).toLocaleDateString() : '永久'}
              </p>
            </div>
            <div className="text-right shrink-0">
              {isExperience ? (
                <p className="text-lg font-bold text-[var(--accent-primary)]">免费</p>
              ) : (
                <p className="text-lg font-bold text-[var(--accent-primary)]">
                  {coupon.discountRate ? `${coupon.discountRate / 10}折` : '折扣'}
                </p>
              )}
              <p className="text-[10px] text-[var(--text-muted)]">
                {isExperience ? '体验券' : '优惠券'}
              </p>
            </div>
          </div>

          {!isUsed && !isExpired && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)] flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              预约游戏时可用
            </p>
          )}
          {isUsed && coupon.usedAt && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">
              使用时间：{new Date(coupon.usedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Third-party Coupon Detail ─── */
function ThirdPartyCouponDetail({
  coupon,
  onClose,
  onBook,
}: {
  coupon: ThirdPartyCoupon
  onClose: () => void
  onBook: (coupon: ThirdPartyCoupon) => void
}) {
  const platform = platforms.find((p) => p.key === coupon.source)
  const status = couponStatusMap[coupon.status]
  const usable = coupon.status === 'UNUSED'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] shadow-2xl"
      >
        <div className="sticky top-0 z-10 bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-[var(--border-subtle)]">
          <div className="px-4 h-12 flex items-center">
            <button
              onClick={onClose}
              className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">券码详情</h2>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${status.bg}`}>
                <Clock className={`w-5 h-5 ${status.color}`} />
              </div>
              <div>
                <p className={`text-base font-bold ${status.color}`}>{status.label}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{status.hint}</p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{
                    backgroundColor: platform?.color || '#6366f1',
                    color: platform?.textColor || '#fff',
                  }}
                >
                  {sourceLabelMap[coupon.source] || coupon.source}
                </span>
                <h3 className="text-base font-bold text-[var(--text-primary)] mt-2">{coupon.name}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {coupon.description || '第三方平台兑换券，到店核销使用'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-black text-[var(--accent-primary)]">¥{coupon.discountAmount / 100}</p>
                <p className="text-[10px] text-[var(--text-muted)]">满¥{coupon.minOrderAmount / 100}可用</p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-sm font-bold text-[var(--text-primary)]">券码信息</span>
              </div>
              <span className={`text-xs font-medium ${usable ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`}>
                {usable ? '1张可用 · 未核销' : status.label}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-5">
              在线预约后支付时可选择该平台券；线下到店也可出示二维码或券码由店员抵扣。
            </p>
            <div className="flex flex-col items-center">
              <div className="p-3 bg-white rounded-xl border border-[var(--border-subtle)] shadow-sm">
                <SimpleQRCode value={coupon.code} size={160} />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-4">券码编号</p>
              <p className="text-sm font-mono font-bold text-[var(--text-primary)] mt-0.5 break-all">{coupon.code}</p>
              {coupon.usedAt && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  使用时间：{new Date(coupon.usedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20">
                使用方式
              </span>
              <span className="text-sm text-[var(--text-primary)]">线上预约/到店核销使用</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              线上预约支付时如满足满减条件，可在支付页选择该券；线下支付时由店员扫码或输入券码抵扣。
            </p>
            <button
              type="button"
              disabled={!usable}
              onClick={() => onBook(coupon)}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-accent disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-sm"
            >
              {usable ? '在线预约' : status.label}
            </button>
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Store className="w-4 h-4 text-[var(--accent-primary)]" />
              <span className="text-sm font-bold text-[var(--text-primary)]">适用门店</span>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--bg-elevated)]">
              <p className="text-sm font-bold text-[var(--text-primary)]">全部营业门店通用</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">适用于门店线下收款抵扣，实际可用规则以券面金额和满减条件为准。</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-bold text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border-subtle)]"
          >
            我知道了
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ─── Coupon Card ─── */
function CouponCard({
  coupon,
  onOpen,
}: {
  coupon: ThirdPartyCoupon
  onOpen: (coupon: ThirdPartyCoupon) => void
}) {
  const platform = platforms.find((p) => p.key === coupon.source)
  const isUsed = coupon.status === 'USED'
  const status = couponStatusMap[coupon.status]

  return (
    <button
      type="button"
      onClick={() => onOpen(coupon)}
      className="relative w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-left"
      style={{ opacity: isUsed ? 0.6 : 1 }}
    >
      <div className="flex items-stretch">
        {/* Left color strip */}
        <div
          className="w-1.5 shrink-0"
          style={{ backgroundColor: platform?.color || '#6366f1' }}
        />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{
                    backgroundColor: platform?.color || '#6366f1',
                    color: platform?.textColor || '#fff',
                  }}
                >
                  {sourceLabelMap[coupon.source] || coupon.source}
                </span>
                {isUsed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--text-muted)]/20 text-[var(--text-muted)]">
                    已使用
                  </span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mt-1.5">
                {coupon.name}
              </h4>
              {coupon.description && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{coupon.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-[var(--accent-primary)]">
                ¥{coupon.discountAmount / 100}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                满¥{coupon.minOrderAmount / 100}可用
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-2 flex items-center gap-3">
            <QrCode className="w-5 h-5 text-[var(--accent-primary)] shrink-0" />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[10px] text-[var(--text-muted)]">
                {isUsed ? '查看使用记录与券码信息' : '点开可线上预约，也可出示券码到店抵扣'}
              </p>
              <p className="mt-1 text-xs font-mono font-semibold text-[var(--text-primary)] break-all">{coupon.code}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          </div>
          {isUsed && coupon.usedAt && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)] text-left">
              使用时间：{new Date(coupon.usedAt).toLocaleString()}
            </p>
          )}
          {!isUsed && coupon.status !== 'UNUSED' && (
              <div className="min-w-0">
                <p className={`mt-2 text-[10px] ${status.color}`}>{status.label}</p>
              </div>
          )}
        </div>
      </div>
    </button>
  )
}

/* ─── Main Page ─── */
export default function Coupons() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isLoggedIn } = useAuth()

  const [selectedSource, setSelectedSource] = useState<string>('MEITUAN')
  const [code, setCode] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedCoupon, setSelectedCoupon] = useState<ThirdPartyCoupon | null>(null)

  /* Queries */
  const { data: platformConfig } = useQuery({
    queryKey: ['platform-config'],
    queryFn: getPlatformConfig,
    staleTime: 60 * 1000,
  })

  const isPlatformEnabled = (source: string) => {
    if (!platformConfig) return true
    return platformConfig[source as keyof PlatformConfigMap]?.enabled ?? true
  }

  const enabledPlatforms = platforms.filter((p) => isPlatformEnabled(p.key))
  const hasEnabledPlatform = enabledPlatforms.length > 0

  useEffect(() => {
    if (!platformConfig) return
    if (!isPlatformEnabled(selectedSource)) {
      const first = enabledPlatforms[0]
      if (first) setSelectedSource(first.key)
    }
  }, [platformConfig, selectedSource, enabledPlatforms])

  const { data: coupons, isLoading } = useQuery({
    queryKey: ['my-coupons'],
    queryFn: getMyCoupons,
    enabled: isLoggedIn,
  })

  const { data: userCoupons, isLoading: userCouponsLoading } = useQuery({
    queryKey: ['my-user-coupons'],
    queryFn: getMyUserCoupons,
    enabled: isLoggedIn,
  })

  const unusedCoupons = (coupons || []).filter((c) => c.status === 'UNUSED')
  const usedCoupons = (coupons || []).filter((c) => c.status === 'USED')

  const unusedUserCoupons = (userCoupons || []).filter((c) => c.status === 'UNUSED')
  const usedUserCoupons = (userCoupons || []).filter((c) => c.status === 'USED')

  /* Mutations */
  const verifyMut = useMutation({
    mutationFn: () => verifyCoupon(code, selectedSource),
    onSuccess: (data) => {
      setSuccessMsg(`成功绑定「${data.name}」`)
      setCode('')
      queryClient.invalidateQueries({ queryKey: ['my-coupons'] })
      setTimeout(() => setSuccessMsg(''), 3000)
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message || '兑换失败，请重试')
      setTimeout(() => setErrorMsg(''), 3000)
    },
  })

  const handleScan = useCallback((text: string) => {
    setCode(text.trim())
    setShowScanner(false)
  }, [])

  const handleVerify = () => {
    if (!hasEnabledPlatform) {
      setErrorMsg('平台券兑换已暂停')
      setTimeout(() => setErrorMsg(''), 2000)
      return
    }
    if (!code.trim()) {
      setErrorMsg('请输入兑换码')
      setTimeout(() => setErrorMsg(''), 2000)
      return
    }
    if (!isLoggedIn) {
      navigate('/login')
      return
    }
    setErrorMsg('')
    setSuccessMsg('')
    verifyMut.mutate()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">优惠券</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
        {/* ─── Verify Card ─── */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          {/* Platform icons */}
          <div className="flex items-center justify-center gap-3 mb-4">
            {platforms.map((p) => {
              const enabled = isPlatformEnabled(p.key)
              return (
                <button
                  key={p.key}
                  onClick={() => enabled && setSelectedSource(p.key)}
                  disabled={!enabled}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    selectedSource === p.key
                      ? 'ring-2 ring-offset-1 ring-offset-[var(--bg-card)]'
                      : enabled
                        ? 'opacity-50 hover:opacity-80'
                        : 'opacity-30 cursor-not-allowed'
                  }`}
                  style={{
                    backgroundColor: p.color,
                    color: p.textColor,
                    ringColor: p.color,
                    ...(selectedSource === p.key ? { '--tw-ring-color': p.color } as any : {}),
                  }}
                >
                  {p.label}
                  {!enabled && '（已停用）'}
                </button>
              )
            })}
          </div>

          {!hasEnabledPlatform && (
            <p className="text-center text-xs text-[var(--error)] mb-3">
              平台券兑换已暂停，请联系门店
            </p>
          )}

          <p className="text-center text-sm text-[var(--text-secondary)] mb-3">
            {sourceLabelMap[selectedSource] || '平台'}兑换码自助验券
          </p>

          {/* Input row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                disabled={!hasEnabledPlatform}
                placeholder={hasEnabledPlatform ? '点击输入卡券兑换码' : '平台券兑换已暂停'}
                className="w-full h-11 pl-4 pr-10 bg-[var(--bg-elevated)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => setShowScanner(true)}
                disabled={!hasEnabledPlatform}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="扫码导入"
              >
                <ScanLine className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={handleVerify}
              disabled={verifyMut.isPending || !code.trim()}
              className="h-11 px-5 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {verifyMut.isPending ? '兑换中...' : '兑换'}
            </button>
          </div>

          {/* Messages */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-center gap-1.5 text-xs text-[var(--error)]"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMsg}
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-center gap-1.5 text-xs text-[var(--success)]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─── User Coupons (from points exchange) ─── */}
        {isLoggedIn && (
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Gift className="w-4 h-4 text-[var(--accent-primary)]" />
              积分兑换券
              {unusedUserCoupons.length > 0 && (
                <span className="text-xs text-[var(--text-muted)]">({unusedUserCoupons.length}张可用)</span>
              )}
            </h3>

            {userCouponsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : unusedUserCoupons.length > 0 ? (
              <div className="space-y-3">
                {unusedUserCoupons.map((coupon) => (
                  <UserCouponCard key={coupon.id} coupon={coupon} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Gift className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)] opacity-30" />
                <p className="text-xs text-[var(--text-muted)]">暂无积分兑换券</p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">前往积分商城兑换体验券和优惠券</p>
              </div>
            )}
          </div>
        )}

        {/* ─── My Coupons ─── */}
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[var(--accent-primary)]" />
            第三方优惠券
            {unusedCoupons.length > 0 && (
              <span className="text-xs text-[var(--text-muted)]">({unusedCoupons.length}张可用)</span>
            )}
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : unusedCoupons.length > 0 ? (
            <div className="space-y-3">
              {unusedCoupons.map((coupon) => (
                <CouponCard key={coupon.id} coupon={coupon} onOpen={setSelectedCoupon} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Ticket className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
              <p className="text-xs text-[var(--text-muted)]">暂无可用优惠券</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">兑换美团、抖音、大众点评券码开始使用</p>
            </div>
          )}
        </div>

        {/* ─── Usage History ─── */}
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--text-muted)]" />
            使用记录
          </h3>

          {usedCoupons.length > 0 || usedUserCoupons.length > 0 ? (
            <div className="space-y-3">
              {usedUserCoupons.map((coupon) => (
                <UserCouponCard key={coupon.id} coupon={coupon} />
              ))}
              {usedCoupons.map((coupon) => (
                <CouponCard key={coupon.id} coupon={coupon} onOpen={setSelectedCoupon} />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-[var(--text-muted)] text-xs">
              暂无使用记录
            </div>
          )}
        </div>
      </div>

      {/* ─── QR Scanner Modal ─── */}
      <AnimatePresence>
        {showScanner && (
          <QrScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCoupon && (
          <ThirdPartyCouponDetail
            coupon={selectedCoupon}
            onClose={() => setSelectedCoupon(null)}
            onBook={(coupon) => {
              sessionStorage.setItem(preferredThirdPartyCouponCodeKey, coupon.code)
              setSelectedCoupon(null)
              navigate('/')
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
