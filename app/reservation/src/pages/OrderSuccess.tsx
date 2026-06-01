import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, FileText, Home } from 'lucide-react'

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
  couponName?: string
  couponDiscount?: number
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

  const { venueName, date, startTime, endTime, durationMin, totalPrice, finalPrice, originalPrice, personCount, orderId, couponName, couponDiscount } = state
  const displayOriginal = originalPrice || totalPrice?.toFixed(2) || '0.00'
  const displayFinal = finalPrice || totalPrice?.toFixed(2) || '0.00'
  const month = parseInt(date.split('-')[1])
  const day = parseInt(date.split('-')[2])
  const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date).getDay()]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-[100dvh] flex flex-col px-4 pt-12 pb-8"
    >
      {/* Success icon */}
      <motion.div
        className="relative mb-6 mx-auto"
        initial={{ scale: 0.5 }}
        animate={{ scale: [0.5, 1.1, 1] }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#1E293B" strokeWidth="3" />
          <motion.circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 36}
            initial={{ strokeDashoffset: 2 * Math.PI * 36 }}
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
          <CheckCircle2 className="w-10 h-10 text-[var(--success)]" />
        </motion.div>
      </motion.div>

      {/* Title */}
      <motion.h2
        className="text-2xl font-bold text-[var(--success)] mb-1 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
      >
        预约成功
      </motion.h2>
      <motion.p
        className="text-sm text-[var(--text-secondary)] mb-8 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.3 }}
      >
        您的场地预约已确认
      </motion.p>

      {/* Order info card */}
      <motion.div
        className="w-full max-w-lg mx-auto bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-5 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">订单号</span>
            <span className="text-sm text-[var(--accent-primary)] font-mono">{orderId.slice(0, 8)}</span>
          </div>
          <div className="border-t border-[var(--border-subtle)]" />
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">场地</span>
            <span className="text-sm text-[var(--text-primary)]">{venueName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">时间</span>
            <span className="text-sm text-[var(--text-primary)]">{startTime}-{endTime} ({durationMin}分钟)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">日期</span>
            <span className="text-sm text-[var(--text-secondary)]">{month}月{day}日 {weekDay}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">人数</span>
            <span className="text-sm text-[var(--text-primary)]">{personCount}人</span>
          </div>
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

      {/* QR placeholder */}
      <motion.div
        className="flex flex-col items-center mb-8 mx-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.3 }}
      >
        <div className="w-28 h-28 bg-white rounded-xl flex items-center justify-center mb-2">
          <div className="w-20 h-20 bg-[var(--bg-primary)] rounded-lg flex items-center justify-center">
            <span className="text-[8px] text-[var(--text-muted)] text-center">签到二维码</span>
          </div>
        </div>
        <p className="text-xs text-[var(--text-muted)]">出示二维码签到入场</p>
      </motion.div>

      {/* Spacer to push buttons down but not to the very edge */}
      <div className="flex-1 min-h-4" />

      {/* Buttons */}
      <motion.div
        className="w-full max-w-lg mx-auto flex gap-3 pb-4"
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
