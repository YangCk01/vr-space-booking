import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Package, Truck, CheckCircle, RotateCcw, Clock, MapPin, Store, Ticket, Tag } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

interface PointsOrder {
  id: string
  orderNo: string
  productName: string
  productType: string
  pointsCost: number
  status: 'PENDING' | 'SHIPPED' | 'COMPLETED' | 'RETURNED' | 'CANCELLED'
  deliveryType: 'PICKUP' | 'DELIVERY' | null
  trackingNumber: string | null
  recipientName: string | null
  recipientPhone: string | null
  address: string | null
  returnReason: string | null
  createdAt: string
  product?: { image: string | null }
}

interface PointsExchange {
  id: string
  productName: string
  productType: string
  pointsCost: number
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  product?: { name: string; image: string | null; type: string }
}

const orderStatusMap: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: '待发货', color: 'text-amber-400', icon: Clock },
  SHIPPED: { label: '已发货', color: 'text-blue-400', icon: Truck },
  COMPLETED: { label: '已完成', color: 'text-emerald-400', icon: CheckCircle },
  RETURNED: { label: '退货中', color: 'text-orange-400', icon: RotateCcw },
  CANCELLED: { label: '已取消', color: 'text-gray-400', icon: CheckCircle },
}

const exchangeStatusMap: Record<string, { label: string; color: string }> = {
  PENDING: { label: '处理中', color: 'text-amber-400' },
  COMPLETED: { label: '已发放', color: 'text-emerald-400' },
  CANCELLED: { label: '已取消', color: 'text-gray-400' },
}

async function getMyOrders() {
  const res = await apiClient.get('/points/orders')
  return (res.data.data || []) as PointsOrder[]
}

async function getMyExchanges() {
  const res = await apiClient.get('/points/exchanges')
  return (res.data.data || []) as PointsExchange[]
}

async function requestReturn(orderId: string, reason: string) {
  const res = await apiClient.post(`/points/orders/${orderId}/return`, { reason })
  return res.data
}

export default function MyPointsOrders() {
  const navigate = useNavigate()
  const { user, isLoggedIn, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const { toast, success: toastSuccess, error: toastError } = useToast()
  const [returningId, setReturningId] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState('')

  useEffect(() => {
    if (isLoggedIn) refreshUser()
  }, [isLoggedIn, refreshUser])

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['points-orders'],
    queryFn: getMyOrders,
    enabled: isLoggedIn,
  })

  const { data: exchanges, isLoading: exchangesLoading } = useQuery({
    queryKey: ['points-exchanges'],
    queryFn: getMyExchanges,
    enabled: isLoggedIn,
  })

  const isLoading = ordersLoading || exchangesLoading

  // 合并两种记录，按时间倒序
  const allRecords = [
    ...(orders || []).map((o) => ({ ...o, recordType: 'order' as const, sortTime: o.createdAt })),
    ...(exchanges || []).map((e) => ({ ...e, recordType: 'exchange' as const, sortTime: e.createdAt })),
  ].sort((a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime())

  const returnMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) => requestReturn(orderId, reason),
    onSuccess: () => {
      toastSuccess('退货申请已提交')
      setReturningId(null)
      setReturnReason('')
      queryClient.invalidateQueries({ queryKey: ['points-orders'] })
      refreshUser()
    },
    onError: (err: any) => {
      toastError(err?.response?.data?.message || '退货申请失败')
    },
  })

  const handleReturn = (orderId: string) => {
    if (!returnReason.trim()) {
      toastError('请填写退货原因')
      return
    }
    returnMutation.mutate({ orderId, reason: returnReason })
  }

  const canReturn = (status: string) => status === 'PENDING' || status === 'SHIPPED'

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav-xl"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">我的兑换</h1>
        </div>
      </div>

      {/* Points Banner */}
      <div className="bg-gradient-accent px-4 pt-4 pb-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-2">
            <span className="text-white font-bold text-xl">{isLoggedIn ? (user?.points || 0) : 0}</span>
            <span className="text-white/80 text-sm">可用积分</span>
          </div>
        </div>
      </div>

      {/* Records List */}
      <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-3">
        {isLoading && (
          <div className="text-center text-[var(--text-muted)] text-sm py-8">加载中...</div>
        )}

        {!isLoggedIn && (
          <div className="text-center text-[var(--text-muted)] py-12">
            <p className="text-sm">请先登录查看兑换记录</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-3 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-lg text-sm"
            >
              去登录
            </button>
          </div>
        )}

        {isLoggedIn && !isLoading && allRecords.length === 0 && (
          <div className="text-center text-[var(--text-muted)] py-12">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无兑换记录</p>
          </div>
        )}

        {isLoggedIn && allRecords.map((record) => {
          if (record.recordType === 'exchange') {
            const ex = record as PointsExchange & { recordType: 'exchange'; sortTime: string }
            const statusInfo = exchangeStatusMap[ex.status] || exchangeStatusMap.PENDING
            const TypeIcon = ex.productType === 'COUPON' ? Tag : Ticket
            return (
              <div key={ex.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] px-1.5 py-0.5 rounded">兑换</span>
                    <span className={`text-xs ${statusInfo.color}`}>{statusInfo.label}</span>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">{new Date(ex.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                    {ex.product?.image ? (
                      <img src={ex.product.image} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <TypeIcon className="w-5 h-5 text-[var(--accent-primary)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{ex.productName || ex.product?.name || '积分兑换'}</p>
                    <p className="text-xs text-amber-500 mt-0.5">{ex.pointsCost} 积分</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">已发放到优惠券，预约时可使用</p>
                  </div>
                </div>
              </div>
            )
          }

          const order = record as PointsOrder & { recordType: 'order'; sortTime: string }
          const statusInfo = orderStatusMap[order.status] || orderStatusMap.PENDING
          const StatusIcon = statusInfo.icon
          return (
            <div key={order.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded">订单</span>
                  <span className="text-xs text-[var(--text-muted)]">{order.orderNo}</span>
                </div>
                <div className={`flex items-center gap-1 text-xs ${statusInfo.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusInfo.label}
                </div>
              </div>

              <div className="flex items-start gap-3 mb-3">
                <div className="w-14 h-14 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                  {order.product?.image ? (
                    <img src={order.product.image} alt="" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Package className="w-6 h-6 text-[var(--text-muted)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{order.productName}</p>
                  <p className="text-xs text-amber-500 mt-0.5">{order.pointsCost} 积分</p>
                  {order.deliveryType === 'DELIVERY' && order.address && (
                    <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {order.address}
                    </p>
                  )}
                  {order.deliveryType === 'PICKUP' && (
                    <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                      <Store className="w-3 h-3" />
                      线下领取
                    </p>
                  )}
                  {order.trackingNumber && (
                    <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      物流：{order.trackingNumber}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-muted)]">
                  {new Date(order.createdAt).toLocaleString()}
                </span>
                {canReturn(order.status) && (
                  <button
                    onClick={() => { setReturningId(order.id); setReturnReason('') }}
                    className="text-xs text-[var(--error)] border border-[var(--error)]/30 px-3 py-1 rounded-full hover:bg-[var(--error)]/10 transition-colors"
                  >
                    申请退货
                  </button>
                )}
              </div>

              {/* Return Reason Input */}
              <AnimatePresence>
                {returningId === order.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-3 border-t border-[var(--border-subtle)]"
                  >
                    <textarea
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="请填写退货原因"
                      className="w-full bg-[var(--bg-elevated)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] outline-none resize-none h-20"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button
                        onClick={() => { setReturningId(null); setReturnReason('') }}
                        className="text-xs text-[var(--text-muted)] px-3 py-1.5 rounded-lg"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleReturn(order.id)}
                        disabled={returnMutation.isPending}
                        className="text-xs bg-[var(--error)] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        {returnMutation.isPending ? '提交中...' : '确认退货'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Toast */}
      {toast.visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={cn(
            'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm text-white shadow-lg',
            toast.type === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
          )}
        >
          {toast.message}
        </motion.div>
      )}
    </motion.div>
  )
}
