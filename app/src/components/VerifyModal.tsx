import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ScanLine, CheckCircle2, User, Calendar, MapPin, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type VerifyScanStatus = 'scanning' | 'recognized' | 'verifying' | 'success' | 'error'

interface VerifyScanModalProps {
  open: boolean
  onClose: () => void
  order: {
    id: string
    orderNo: string
    customer?: string
    venueName?: string
    bookingTime?: string
    amount?: number
    personCount?: number
  } | null
  onVerify: (id: string) => void
  skipScan?: boolean
}

export function VerifyScanModal({ open, onClose, order, onVerify, skipScan = false }: VerifyScanModalProps) {
  const [status, setStatus] = useState<VerifyScanStatus>('scanning')

  useEffect(() => {
    if (!open) {
      setStatus('scanning')
      return
    }

    // 真实扫码完成后直接展示订单信息，跳过假扫描动画
    if (skipScan) {
      setStatus('recognized')
      return
    }

    setStatus('scanning')

    // Phase 1: 扫描中（扫描线动画）
    const t1 = setTimeout(() => {
      setStatus('recognized')
    }, 2500)

    return () => {
      clearTimeout(t1)
    }
  }, [open, skipScan])

  const handleVerify = () => {
    if (!order) return
    setStatus('verifying')

    // 模拟核销处理
    const t2 = setTimeout(() => {
      onVerify(order.id)
      setStatus('success')
    }, 1200)

    return () => clearTimeout(t2)
  }

  const handleClose = () => {
    setStatus('scanning')
    onClose()
  }

  if (!open || !order) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={status === 'success' ? handleClose : undefined}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 设备外壳 */}
            <div className="bg-slate-800 rounded-[2rem] p-3 shadow-2xl border-4 border-slate-700">
              {/* 设备顶部装饰 */}
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="w-16 h-1.5 bg-slate-600 rounded-full" />
              </div>

              {/* 屏幕区域 */}
              <div className="bg-slate-900 rounded-2xl overflow-hidden relative">
                {/* 顶部状态栏 */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-mono">扫码核销</span>
                  <div className="flex items-center gap-1">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full animate-pulse',
                      status === 'scanning' ? 'bg-emerald-400' :
                      status === 'recognized' ? 'bg-amber-400' :
                      status === 'verifying' ? 'bg-sky-400' :
                      status === 'success' ? 'bg-emerald-500' : 'bg-red-400'
                    )} />
                    <span className="text-[10px] text-slate-400">
                      {status === 'scanning' ? '等待扫码' :
                       status === 'recognized' ? '已识别' :
                       status === 'verifying' ? '核销中' :
                       status === 'success' ? '核销成功' : '失败'}
                    </span>
                  </div>
                </div>

                {/* 主显示区 */}
                <div className="relative aspect-[4/5] bg-white flex flex-col items-center justify-center p-4">
                  <AnimatePresence mode="wait">
                    {status === 'scanning' && (
                      <motion.div
                        key="scanning"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="relative w-48 h-48"
                      >
                        {/* 扫描框 */}
                        <div className="absolute inset-0 border-2 border-slate-300 rounded-xl" />
                        {/* 四角 */}
                        <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-vraccent-primary rounded-tl-lg" />
                        <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-vraccent-primary rounded-tr-lg" />
                        <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-vraccent-primary rounded-bl-lg" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-vraccent-primary rounded-br-lg" />

                        {/* 扫描线 */}
                        <motion.div
                          className="absolute left-0 right-0 h-0.5 bg-vraccent-primary shadow-lg shadow-vraccent-primary/50"
                          animate={{ top: ['0%', '100%', '0%'] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />

                        {/* 中心图标 */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ScanLine className="w-10 h-10 text-slate-300" />
                        </div>
                      </motion.div>
                    )}

                    {status === 'recognized' && (
                      <motion.div
                        key="recognized"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full space-y-3"
                      >
                        {/* 识别成功提示 */}
                        <div className="flex flex-col items-center gap-2 mb-4">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400 }}
                            className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"
                          >
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                          </motion.div>
                          <span className="text-sm font-medium text-vrtext-primary">识别成功</span>
                        </div>

                        {/* 订单信息卡片 */}
                        <div className="bg-vrbg-elevated rounded-xl p-4 border border-vrborder-subtle space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-vrtext-tertiary">订单号</span>
                            <span className="text-xs font-mono text-vrtext-secondary">{order.orderNo}</span>
                          </div>
                          {order.customer && (
                            <div className="flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-vrtext-tertiary" />
                              <span className="text-sm text-vrtext-secondary">{order.customer}</span>
                            </div>
                          )}
                          {order.venueName && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-vrtext-tertiary" />
                              <span className="text-sm text-vrtext-secondary">{order.venueName}</span>
                            </div>
                          )}
                          {order.bookingTime && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-vrtext-tertiary" />
                              <span className="text-sm text-vrtext-secondary">{order.bookingTime}</span>
                            </div>
                          )}
                          {order.personCount && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-vrtext-tertiary" />
                              <span className="text-sm text-vrtext-secondary">{order.personCount}人</span>
                            </div>
                          )}
                          <div className="border-t border-vrborder-subtle pt-2 flex items-center justify-between">
                            <span className="text-xs text-vrtext-tertiary">实付金额</span>
                            <span className="text-lg font-bold text-vrtext-primary">
                              ¥{((order.amount || 0) / 100).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* 确认按钮 */}
                        <button
                          onClick={handleVerify}
                          className="w-full h-11 rounded-xl bg-vraccent-primary text-white text-sm font-semibold hover:bg-vraccent-primary/90 transition-colors"
                        >
                          确认核销
                        </button>
                        <button
                          onClick={handleClose}
                          className="w-full h-10 rounded-xl border border-vrborder-subtle text-vrtext-secondary text-sm hover:bg-vrbg-hover transition-colors"
                        >
                          取消
                        </button>
                      </motion.div>
                    )}

                    {status === 'verifying' && (
                      <motion.div
                        key="verifying"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <Loader2 className="w-10 h-10 text-vraccent-primary animate-spin" />
                        <span className="text-sm text-vrtext-secondary">正在核销...</span>
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
                          <div className="text-emerald-600 text-lg font-bold">核销成功</div>
                          <div className="text-slate-500 text-sm mt-1">{order.orderNo}</div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 底部金额栏 */}
                <div className="px-4 py-3 bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">扫码核销设备</span>
                    <span className="text-xs text-slate-400">VR-SCAN-01</span>
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
            {status !== 'scanning' && status !== 'verifying' && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -bottom-14 left-1/2 -translate-x-1/2 text-slate-400 hover:text-white text-sm transition-colors"
                onClick={handleClose}
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
