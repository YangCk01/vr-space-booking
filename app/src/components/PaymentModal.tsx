import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  QrCode,
  ScanLine,
  Wallet,
  CheckCircle2,
  Loader2,
  Smartphone,
  Ticket,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type PaymentMethod = 'WECHAT' | 'ALIPAY' | 'CASH'

interface PaymentMethodModalProps {
  open: boolean
  onClose: () => void
  orderNo: string
  customer?: string
  amount: number
  onSelect: (method: PaymentMethod) => void
  couponCode?: string
  couponName?: string
  couponSource?: string
  couponDiscount?: number
  couponError?: string | null
  couponLoading?: boolean
  lockedCouponName?: string
  lockedCouponSource?: string
  lockedCouponDiscount?: number
  couponLockedMessage?: string | null
  onCouponCodeChange?: (value: string) => void
  onLookupCoupon?: () => void
  onScanCoupon?: () => void
}

const methods: {
  key: PaymentMethod
  label: string
  subLabel: string
  icon: React.ReactNode
  bg: string
  hoverBg: string
  border: string
  text: string
}[] = [
  {
    key: 'WECHAT',
    label: '微信支付',
    subLabel: '顾客微信扫码支付',
    icon: <QrCode className="w-6 h-6" />,
    bg: 'bg-emerald-500/10',
    hoverBg: 'hover:bg-emerald-500/20',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
  },
  {
    key: 'ALIPAY',
    label: '支付宝',
    subLabel: '顾客支付宝扫码支付',
    icon: <Smartphone className="w-6 h-6" />,
    bg: 'bg-sky-500/10',
    hoverBg: 'hover:bg-sky-500/20',
    border: 'border-sky-500/30',
    text: 'text-sky-400',
  },
  {
    key: 'CASH',
    label: '现金收款',
    subLabel: '线下现金直接收款',
    icon: <Wallet className="w-6 h-6" />,
    bg: 'bg-amber-500/10',
    hoverBg: 'hover:bg-amber-500/20',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
  },
]

export function PaymentMethodModal({
  open,
  onClose,
  orderNo,
  customer,
  amount,
  onSelect,
  couponCode = '',
  couponName,
  couponSource,
  couponDiscount = 0,
  couponError,
  couponLoading,
  lockedCouponName,
  lockedCouponSource,
  lockedCouponDiscount = 0,
  couponLockedMessage,
  onCouponCodeChange,
  onLookupCoupon,
  onScanCoupon,
}: PaymentMethodModalProps) {
  if (!open) return null
  const payableAmount = Math.max(0, amount - couponDiscount)
  const sourceLabelMap: Record<string, string> = {
    MEITUAN: '美团',
    DOUYIN: '抖音',
    DIANPING: '大众点评',
  }
  const couponTitle = couponName
    ? `${couponSource ? `${sourceLabelMap[couponSource] || couponSource} · ` : ''}${couponName}`
    : ''
  const lockedCouponTitle = lockedCouponName
    ? `${lockedCouponSource ? `${sourceLabelMap[lockedCouponSource] || lockedCouponSource} · ` : ''}${lockedCouponName}`
    : ''

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md mx-4 bg-vrbg-card border border-vrborder-subtle rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-vr-h3 text-vrtext-primary font-semibold">
                  选择收款方式
                </h3>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-vrtext-muted hover:text-vrtext-primary hover:bg-vrbg-elevated transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Order Info */}
              <div className="bg-vrbg-elevated rounded-xl p-4 border border-vrborder-subtle">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-vr-caption text-vrtext-muted">订单号</span>
                  <span className="text-vr-body-sm text-vrtext-primary font-mono">
                    {orderNo}
                  </span>
                </div>
                {customer && (
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-vr-caption text-vrtext-muted">预约人</span>
                    <span className="text-vr-body-sm text-vrtext-primary">{customer}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-vr-caption text-vrtext-muted">应收金额</span>
                  <span className="text-vr-h2 text-vraccent-primary font-bold">
                    ¥{payableAmount.toFixed(2)}
                  </span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-vr-caption text-vrtext-muted">本次平台券抵扣</span>
                    <span className="text-vr-body-sm text-vrsuccess font-medium">-¥{couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                {lockedCouponDiscount > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-vr-caption text-vrtext-muted">已用平台券抵扣</span>
                    <span className="text-vr-body-sm text-vrsuccess font-medium">-¥{lockedCouponDiscount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 pb-3">
              <div className="rounded-xl border border-vrborder-subtle bg-vrbg-elevated p-3 space-y-2">
                <div className="flex items-center gap-2 text-vr-body-sm font-medium text-vrtext-primary">
                  <Ticket className="w-4 h-4 text-vraccent-primary" />
                  第三方券抵扣
                </div>
                {lockedCouponName ? (
                  <div className="rounded-xl border border-vrsuccess/25 bg-vrsuccess/10 px-3 py-2">
                    <p className="text-vr-body-sm text-vrtext-primary font-medium">{lockedCouponTitle}</p>
                    <p className="text-vr-caption text-vrsuccess mt-1">
                      已抵扣 ¥{lockedCouponDiscount.toFixed(2)}。平台优惠券已使用，不能再使用第二张。
                    </p>
                  </div>
                ) : couponLockedMessage ? (
                  <div className="rounded-xl border border-vrwarning/25 bg-vrwarning/10 px-3 py-2 text-vr-caption text-vrwarning">
                    {couponLockedMessage}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        value={couponCode}
                        onChange={(e) => onCouponCodeChange?.(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onLookupCoupon?.()
                        }}
                        placeholder="扫码或输入券码"
                        className="soft-input flex-1 h-9 px-3 text-vr-body-sm"
                      />
                      <button
                        type="button"
                        onClick={onScanCoupon}
                        className="h-9 w-9 rounded-xl border border-vrborder-subtle text-vrtext-secondary hover:text-vraccent-primary hover:border-vraccent-primary transition-colors flex items-center justify-center"
                        title="扫码识别"
                      >
                        <ScanLine className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={onLookupCoupon}
                        disabled={couponLoading || !couponCode.trim()}
                        className="h-9 px-3 rounded-xl bg-vraccent-primary text-white text-xs font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
                      >
                        {couponLoading ? '识别中' : '验券'}
                      </button>
                    </div>
                    {couponName && (
                      <p className="text-vr-caption text-vrsuccess">{couponTitle} 已抵扣 ¥{couponDiscount.toFixed(2)}</p>
                    )}
                  </>
                )}
                {couponError && (
                  <p className="text-vr-caption text-vrerror">{couponError}</p>
                )}
              </div>
            </div>

            {/* Methods */}
            <div className="px-6 pb-6 space-y-2.5">
              {methods.map((m) => (
                <button
                  key={m.key}
                  onClick={() => onSelect(m.key)}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left',
                    m.bg,
                    m.hoverBg,
                    m.border,
                    'hover:scale-[1.02] active:scale-[0.98]'
                  )}
                >
                  <div
                    className={cn(
                      'w-11 h-11 rounded-lg flex items-center justify-center shrink-0',
                      m.bg,
                      m.text
                    )}
                  >
                    {m.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-vr-body font-semibold', m.text)}>
                      {m.label}
                    </div>
                    <div className="text-vr-caption text-vrtext-muted mt-0.5">
                      {m.subLabel}
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-vrtext-muted/30 shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ──────────────────────────────────────────────── */
/* 扫码盒模拟器                                      */
/* ──────────────────────────────────────────────── */

type ScanStatus = 'waiting' | 'scanned' | 'processing' | 'success' | 'error'

interface ScanBoxSimulatorProps {
  open: boolean
  onClose: () => void
  method: PaymentMethod
  orderNo: string
  amount: number
  onSuccess: () => void
  onError?: (msg: string) => void
}

export function ScanBoxSimulator({
  open,
  onClose,
  method,
  orderNo,
  amount,
  onSuccess,
  onError,
}: ScanBoxSimulatorProps) {
  const [status, setStatus] = useState<ScanStatus>('waiting')
  const [scanCount, setScanCount] = useState(0)

  const methodLabel = method === 'WECHAT' ? '微信支付' : method === 'ALIPAY' ? '支付宝' : '扫码支付'
  const methodColor = method === 'WECHAT' ? 'text-emerald-400' : method === 'ALIPAY' ? 'text-sky-400' : 'text-vraccent-primary'
  const methodBg = method === 'WECHAT' ? 'bg-emerald-500' : method === 'ALIPAY' ? 'bg-sky-500' : 'bg-vraccent-primary'

  // 模拟扫码流程
  useEffect(() => {
    if (!open) {
      setStatus('waiting')
      setScanCount(0)
      return
    }

    setStatus('waiting')
    setScanCount(0)

    // Phase 1: 等待扫码（扫描线动画）
    const t1 = setTimeout(() => {
      setStatus('scanned')
      setScanCount((c) => c + 1)
    }, 2200)

    // Phase 2: 扫码成功，处理中
    const t2 = setTimeout(() => {
      setStatus('processing')
    }, 3200)

    // Phase 3: 支付成功
    const t3 = setTimeout(() => {
      setStatus('success')
      onSuccess()
    }, 4500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [open, onSuccess])

  const handleRetry = useCallback(() => {
    setStatus('waiting')
    setScanCount(0)

    const t1 = setTimeout(() => {
      setStatus('scanned')
      setScanCount((c) => c + 1)
    }, 2200)

    const t2 = setTimeout(() => {
      setStatus('processing')
    }, 3200)

    const t3 = setTimeout(() => {
      setStatus('success')
      onSuccess()
    }, 4500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onSuccess])

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={status === 'success' ? onClose : undefined}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 设备外壳 */}
            <div className="bg-slate-800 rounded-[2rem] p-3 shadow-2xl border-4 border-slate-700 w-[340px]">
              {/* 设备顶部装饰 */}
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="w-16 h-1.5 bg-slate-600 rounded-full" />
              </div>

              {/* 屏幕区域 */}
              <div className="bg-slate-900 rounded-2xl overflow-hidden relative">
                {/* 顶部状态栏 */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-mono">{methodLabel}</span>
                  <div className="flex items-center gap-1">
                    <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', methodBg)} />
                    <span className="text-[10px] text-slate-400">
                      {status === 'waiting' ? '等待扫码' : status === 'scanned' ? '已扫码' : status === 'processing' ? '处理中' : status === 'success' ? '已完成' : '异常'}
                    </span>
                  </div>
                </div>

                {/* 主显示区 */}
                <div className="relative aspect-square bg-white flex flex-col items-center justify-center p-6">
                  {/* 二维码区域 */}
                  <AnimatePresence mode="wait">
                    {status === 'waiting' && (
                      <motion.div
                        key="qr"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="relative w-40 h-40"
                      >
                        {/* 模拟二维码 */}
                        <div className="w-full h-full grid grid-cols-7 grid-rows-7 gap-0.5">
                          {Array.from({ length: 49 }).map((_, i) => {
                            const isCorner =
                              (i < 12 && i % 7 < 3) ||
                              (i >= 4 && i < 7) ||
                              (i >= 42 && i % 7 >= 4) ||
                              (i % 7 === 3 && i >= 21 && i <= 27)
                            return (
                              <div
                                key={i}
                                className={cn(
                                  'rounded-[1px]',
                                  isCorner || Math.random() > 0.45
                                    ? 'bg-slate-900'
                                    : 'bg-white'
                                )}
                              />
                            )
                          })}
                        </div>
                        {/* 中间Logo */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                            {method === 'WECHAT' ? (
                              <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
                                <span className="text-white text-[10px] font-bold">微</span>
                              </div>
                            ) : method === 'ALIPAY' ? (
                              <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center">
                                <span className="text-white text-[10px] font-bold">支</span>
                              </div>
                            ) : (
                              <ScanLine className="w-5 h-5 text-slate-700" />
                            )}
                          </div>
                        </div>

                        {/* 扫描线动画 */}
                        <motion.div
                          className={cn(
                            'absolute left-0 right-0 h-0.5 rounded-full shadow-lg',
                            method === 'WECHAT'
                              ? 'bg-emerald-400 shadow-emerald-400/50'
                              : method === 'ALIPAY'
                                ? 'bg-sky-400 shadow-sky-400/50'
                                : 'bg-vraccent-primary shadow-vraccent-primary/50'
                          )}
                          animate={{
                            top: ['0%', '100%', '0%'],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        />
                      </motion.div>
                    )}

                    {status === 'scanned' && (
                      <motion.div
                        key="scanned"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        </div>
                        <span className="text-slate-700 text-sm font-medium">扫码成功</span>
                      </motion.div>
                    )}

                    {status === 'processing' && (
                      <motion.div
                        key="processing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <Loader2 className="w-10 h-10 text-slate-400 animate-spin" />
                        <span className="text-slate-500 text-sm">正在处理支付...</span>
                      </motion.div>
                    )}

                    {status === 'success' && (
                      <motion.div
                        key="success"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 15 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.1, type: 'spring' }}
                          className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
                        >
                          <CheckCircle2 className="w-10 h-10 text-white" />
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="text-center"
                        >
                          <div className="text-emerald-600 text-lg font-bold">支付成功</div>
                          <div className="text-slate-500 text-sm mt-1">
                            ¥{amount.toFixed(2)}
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 底部金额栏 */}
                <div className="px-4 py-3 bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">订单 {orderNo.slice(-8)}</span>
                    <span className="text-lg font-bold text-white">
                      ¥{amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 设备底部装饰 */}
              <div className="flex items-center justify-center gap-3 mt-3">
                <div className="w-8 h-8 rounded-full bg-slate-700/50" />
                <div className="w-20 h-1 bg-slate-700/50 rounded-full" />
              </div>
            </div>

            {/* 关闭按钮 */}
            {status !== 'waiting' && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -bottom-14 left-1/2 -translate-x-1/2 text-slate-400 hover:text-white text-sm transition-colors"
                onClick={onClose}
              >
                {status === 'success' ? '点击关闭' : '取消'}
              </motion.button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
