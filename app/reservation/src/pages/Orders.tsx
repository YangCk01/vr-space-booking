import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ClipboardList, LogIn, XCircle, MapPin, Clock, Calendar, Users, Ticket, QrCode } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getOrders, cancelOrder } from '@/api/orders'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { SimpleQRCode } from '@/components/SimpleQRCode'

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'PAID', label: '待核销' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
]

const statusMap: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待支付', color: 'text-[var(--warning)]' },
  PAID: { label: '待核销', color: 'text-[var(--accent-primary)]' },
  COMPLETED: { label: '已完成', color: 'text-[var(--success)]' },
  CANCELLED: { label: '已取消', color: 'text-[var(--text-muted)]' },
  REFUNDED: { label: '已退款', color: 'text-[var(--text-muted)]' },
}

export default function Orders() {
  const navigate = useNavigate()
  const { isLoggedIn, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('all')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketOrder, setTicketOrder] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => getOrders({ pageSize: 50 }),
    enabled: isLoggedIn,
  })

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['usable-coupons'] })
      queryClient.invalidateQueries({ queryKey: ['points-coupons'] })
      refreshUser()
      setCancelId(null)
    },
  })

  const allOrders = data?.data || []
  const orders = activeTab === 'all'
    ? allOrders
    : allOrders.filter((o: any) => o.status === activeTab)

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">我的订单</h1>
        </div>

        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'text-sm font-medium whitespace-nowrap pb-1 transition-colors relative',
                activeTab === t.key ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {t.label}
              {activeTab === t.key && (
                <motion.div layoutId="order-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
            <LogIn className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm mb-4">请先登录后查看订单</p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-2 rounded-xl text-sm font-medium text-white bg-gradient-accent"
            >
              去登录
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
            <ClipboardList className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">此处暂无数据</p>
          </div>
        ) : (
          orders.map((o: any, i: number) => {
            const s = statusMap[o.status] || { label: o.status, color: 'text-[var(--text-muted)]' }
            return (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 cursor-pointer hover:border-[var(--accent-primary)]/40 transition-colors"
                onClick={() => { setTicketOrder(o); setTicketOpen(true) }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{o.venueName}</h3>
                  <span className={cn('text-xs font-medium', s.color)}>{s.label}</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-1">{o.bookingTime}</p>
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  {o.booking?.game?.title || 'VR体验'} · {o.booking?.personCount || 1}人
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-[var(--error)]">¥{((o.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {o.couponDiscount > 0 && (
                      <span className="text-xs text-[var(--success)]">-¥{(o.couponDiscount / 100).toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {o.status === 'PENDING' && (
                      <button
                        onClick={() => navigate('/pay/' + o.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-gradient-accent"
                      >
                        去支付
                      </button>
                    )}
                    {(o.status === 'PENDING' || o.status === 'PAID') && (
                      <button
                        onClick={() => setCancelId(o.id)}
                        disabled={cancelMutation.isPending}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {cancelMutation.isPending && cancelId === o.id ? (
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        取消订单
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>
      {/* 取消确认弹窗 */}
      <AnimatePresence>
        {cancelId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setCancelId(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl p-5 max-w-sm w-full border border-[var(--border-subtle)] shadow-2xl"
            >
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">确认取消订单？</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-5">
                取消后{data?.data?.find((o: any) => o.id === cancelId)?.payMethod === 'BALANCE' ? '，已支付的金额将退回余额' : ''}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelId(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] transition-colors"
                >
                  保留订单
                </button>
                <button
                  onClick={() => cancelMutation.mutate(cancelId)}
                  disabled={cancelMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-[var(--error)] hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  {cancelMutation.isPending ? '取消中...' : '确认取消'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 入场券弹窗 */}
      <AnimatePresence>
        {ticketOpen && ticketOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setTicketOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl w-full max-w-sm overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-[var(--accent-primary)]/20 to-[var(--accent-secondary)]/20 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-[var(--accent-primary)]" />
                    <h3 className="text-base font-bold text-[var(--text-primary)]">入场券</h3>
                  </div>
                  <button
                    onClick={() => setTicketOpen(false)}
                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  订单号：{ticketOrder.orderNo}
                </p>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                {/* 状态 */}
                <div className="flex items-center justify-center">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
                    ticketOrder.status === 'PAID' ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' :
                    ticketOrder.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                  )}>
                    {ticketOrder.status === 'PAID' ? '待核销' :
                     ticketOrder.status === 'COMPLETED' ? '已完成' :
                     ticketOrder.status === 'CANCELLED' ? '已取消' :
                     ticketOrder.status === 'REFUNDED' ? '已退款' : ticketOrder.status}
                  </span>
                </div>

                {/* 订单信息 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">场地</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.venueName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">时间</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.bookingTime}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">游戏</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.booking?.game?.title || 'VR体验'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">人数</p>
                      <p className="text-sm text-[var(--text-primary)]">{ticketOrder.booking?.personCount || 1}人</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--border-subtle)] pt-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">实付金额</span>
                  <span className="text-lg font-bold text-[var(--error)]">
                    ¥{((ticketOrder.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* QR Code */}
                {ticketOrder.status === 'PAID' || ticketOrder.status === 'COMPLETED' ? (
                  <div className="flex flex-col items-center pt-2">
                    <div className="bg-white rounded-xl p-3 shadow-sm">
                      <SimpleQRCode value={ticketOrder.id} size={160} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">出示二维码签到入场</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-mono">{ticketOrder.id.slice(0, 12)}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center pt-2 py-4">
                    <div className="w-40 h-40 bg-[var(--bg-elevated)] rounded-xl flex items-center justify-center border border-dashed border-[var(--border-subtle)]">
                      <QrCode className="w-10 h-10 text-[var(--text-muted)] opacity-30" />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      {ticketOrder.status === 'CANCELLED' ? '订单已取消，二维码已失效' :
                       ticketOrder.status === 'REFUNDED' ? '订单已退款，二维码已失效' :
                       '二维码未生成'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
