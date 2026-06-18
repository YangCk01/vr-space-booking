import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, FileText, Home } from 'lucide-react'
import { SimpleQRCode } from '@/components/SimpleQRCode'

interface LocationState {
  venueName: string
  date: string
  startTime: string
  endTime: string
  durationMin: number
  totalPrice: number
  finalPrice?: string
  originalPrice?: string
  personName: string
  personCount: number
  orderId: string
  orderNo?: string
  couponName?: string
  couponDiscount?: number
  isGroupBuy?: boolean
  packageName?: string
  verifyCode?: string
}

export default function OrderSuccess() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null

  if (!state) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-[var(--text-muted)]">
        <p className="text-sm">页面参数错误</p>
        <button onClick={() => navigate('/')} className="mt-4 text-[var(--accent-primary)] text-sm">返回首页</button>
      </div>
    )
  }

  const { venueName, date, startTime, endTime, durationMin, totalPrice, finalPrice, originalPrice, personCount, orderId, orderNo, couponName, couponDiscount, isGroupBuy, packageName, verifyCode } = state
  const displayOriginal = originalPrice || totalPrice?.toFixed(2) || '0.00'
  const displayFinal = finalPrice || totalPrice?.toFixed(2) || '0.00'
  const hasBookingInfo = !!date && date.includes('-')
  const month = hasBookingInfo ? parseInt(date.split('-')[1]) : 0
  const day = hasBookingInfo ? parseInt(date.split('-')[2]) : 0
  const weekDay = hasBookingInfo ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date).getDay()] : ''

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-[100dvh] flex flex-col px-4 pt-6 pb-4"
    >
      {/* Success icon */}
      <motion.div
        className="relative mb-4 mx-auto"
        initial={{ scale: 0.5 }}
        animate={{ scale: [0.5, 1.1, 1] }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" className="transform -rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#1E293B" strokeWidth="3" />
          <motion.circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 28}
            initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
          />
        </svg>
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 400 }}
        >
          <CheckCircle2 className="w-8 h-8 text-[var(--success)]" />
        </motion.div>
      </motion.div>

      {/* Title */}
      <motion.h2
        className="text-xl font-bold text-[var(--success)] mb-1 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
      >
        {isGroupBuy ? '团购券购买成功' : '预约成功'}
      </motion.h2>
      <motion.p
        className="text-sm text-[var(--text-secondary)] mb-5 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.3 }}
      >
        {isGroupBuy ? '您可在订单列表查看券码，到店核销使用' : '您的场地预约已确认'}
      </motion.p>

      {/* Order info card */}
      <motion.div
        className="w-full max-w-lg mx-auto bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-4 mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
      >
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">订单号</span>
            <span className="text-sm text-[var(--accent-primary)] font-mono">{orderId.slice(0, 8)}</span>
          </div>
          <div className="border-t border-[var(--border-subtle)]" />
          {isGroupBuy ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">套餐</span>
                <span className="text-sm text-[var(--text-primary)]">{packageName || venueName || '团购套餐'}</span>
              </div>
              {verifyCode && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-muted)]">券码</span>
                  <span className="text-sm font-mono text-[var(--accent-primary)]">{verifyCode}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">场地</span>
                <span className="text-sm text-[var(--text-primary)]">{venueName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">时间</span>
                <span className="text-sm text-[var(--text-primary)]">{startTime}-{endTime} ({durationMin}分钟)</span>
              </div>
              {hasBookingInfo && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-muted)]">日期</span>
                  <span className="text-sm text-[var(--text-secondary)]">{month}月{day}日 {weekDay}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">人数</span>
                <span className="text-sm text-[var(--text-primary)]">{personCount}人</span>
              </div>
            </>
          )}
          {couponName && couponDiscount && couponDiscount > 0 && (
            <>
              <div className="border-t border-[var(--border-subtle)]" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">优惠券</span>
                <span className="text-sm text-[var(--success)]">{couponName} · -¥{(couponDiscount / 100).toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">实付金额</span>
            <span className="text-sm font-bold text-[var(--error)]">¥{displayFinal}</span>
          </div>
        </div>
      </motion.div>

      {/* QR Code */}
      <motion.div
        className="flex flex-col items-center mb-4 mx-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.3 }}
      >
        <div className="w-28 h-28 bg-white rounded-xl flex items-center justify-center mb-2 p-2">
          <SimpleQRCode value={verifyCode || orderNo || orderId} size={100} />
        </div>
        <p className="text-xs text-[var(--text-muted)]">{verifyCode ? '出示券码二维码到店核销' : '出示二维码签到入场'}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">{verifyCode || orderNo || orderId.slice(0, 12)}</p>
      </motion.div>

      <div className="flex-1" />

      {/* Buttons */}
      <motion.div
        className="w-full max-w-lg mx-auto flex gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.3 }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex-1 h-12 rounded-xl border border-[var(--accent-primary)] text-[var(--accent-primary)] font-medium text-sm hover:bg-[var(--accent-primary)]/10 transition-colors flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" />
          再来一单
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex-1 h-12 rounded-xl bg-gradient-accent text-white font-medium text-sm shadow-glow hover:shadow-glow-sm transition-all flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          完成
        </button>
      </motion.div>
    </motion.div>
  )
}
