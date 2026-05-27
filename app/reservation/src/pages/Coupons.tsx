import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  Ticket,
  Clock,
  ScanLine,
  X,
  QrCode,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { verifyCoupon, getMyCoupons, useCoupon, type ThirdPartyCoupon } from '@/api/coupons'
import { useAuth } from '@/providers/AuthProvider'

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

/* ─── Coupon Card ─── */
function CouponCard({
  coupon,
  onUse,
}: {
  coupon: ThirdPartyCoupon
  onUse?: (id: string) => void
}) {
  const platform = platforms.find((p) => p.key === coupon.source)
  const isUsed = coupon.status === 'USED'

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
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

          {!isUsed && onUse && (
            <button
              onClick={() => onUse(coupon.id)}
              className="mt-3 w-full py-2 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              立即使用
            </button>
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

  /* Queries */
  const { data: coupons, isLoading } = useQuery({
    queryKey: ['my-coupons'],
    queryFn: getMyCoupons,
    enabled: isLoggedIn,
  })

  const unusedCoupons = (coupons || []).filter((c) => c.status === 'UNUSED')
  const usedCoupons = (coupons || []).filter((c) => c.status === 'USED')

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

  const useMut = useMutation({
    mutationFn: useCoupon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coupons'] })
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || '使用失败')
    },
  })

  const handleScan = useCallback((text: string) => {
    setCode(text.trim())
    setShowScanner(false)
  }, [])

  const handleVerify = () => {
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
            {platforms.map((p) => (
              <button
                key={p.key}
                onClick={() => setSelectedSource(p.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  selectedSource === p.key
                    ? 'ring-2 ring-offset-1 ring-offset-[var(--bg-card)]'
                    : 'opacity-50 hover:opacity-80'
                }`}
                style={{
                  backgroundColor: p.color,
                  color: p.textColor,
                  ringColor: p.color,
                  ...(selectedSource === p.key ? { '--tw-ring-color': p.color } as any : {}),
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

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
                placeholder="点击输入卡券兑换码"
                className="w-full h-11 pl-4 pr-10 bg-[var(--bg-elevated)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors"
              />
              <button
                onClick={() => setShowScanner(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
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

        {/* ─── My Coupons ─── */}
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[var(--accent-primary)]" />
            我的优惠券
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
                <CouponCard
                  key={coupon.id}
                  coupon={coupon}
                  onUse={(id) => {
                    if (confirm('确认使用该优惠券？')) {
                      useMut.mutate(id)
                    }
                  }}
                />
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

          {usedCoupons.length > 0 ? (
            <div className="space-y-3">
              {usedCoupons.map((coupon) => (
                <CouponCard key={coupon.id} coupon={coupon} />
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
    </motion.div>
  )
}
