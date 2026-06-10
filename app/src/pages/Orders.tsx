import { useState, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  CreditCard,
  Ban,
  Phone,
  Calendar,
  MapPin,
  User,
  Receipt,
  CreditCard as PaymentIcon,
  Gamepad2,
  Headset,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { getOrders, payOrder, cancelOrder, verifyOrder, completeRefundOrder, batchVerifyOrders, batchRefundOrders, markNoShow, activateOrder } from '@/api/orders'
import { createNoShowRefundApproval, createOrderRefundApproval, getApprovals, type ApprovalRequest } from '@/api/approvals'
import { PaymentMethodModal, ScanBoxSimulator, type PaymentMethod } from '@/components/PaymentModal'
import { VerifyScanModal } from '@/components/VerifyModal'
import { apiClient } from '@/api/client'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import * as XLSX from 'xlsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

interface Order {
  id: string
  orderNo: string
  venueName: string
  amount: number
  originalAmount?: number
  discountAmount?: number
  couponDiscount?: number
  userCouponId?: string
  userCoupon?: { name: string; type: string; discountRate: number | null; source?: string; giftReason?: string; giftRemark?: string }
  status: string
  bookingId?: string
  user?: { name: string; phone: string }
  customer?: string
  phone?: string
  bookingTime: string
  createdAt: string
  paidAt?: string | null
  booking?: { personName: string; personPhone: string; personCount: number; game?: { title: string } }
  payMethod?: string
  penaltyAmount?: number | null
}

type RefundDispositionAction = 'NO_REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND'

const approvalStatusLabel: Record<string, string> = {
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
  EXECUTION_FAILED: '执行失败',
}

const approvalStatusClass: Record<string, string> = {
  PENDING: 'border-vrwarning/30 bg-vrwarning/10 text-vrwarning',
  APPROVED: 'border-vrsuccess/30 bg-vrsuccess/10 text-vrsuccess',
  REJECTED: 'border-vrerror/30 bg-vrerror/10 text-vrerror',
  CANCELLED: 'border-vrborder-subtle bg-vrbg-elevated text-vrtext-muted',
  EXECUTION_FAILED: 'border-vrerror/30 bg-vrerror/10 text-vrerror',
}

function approvalActionText(approval?: ApprovalRequest | null) {
  const action = approval?.requestPayload?.action
  if (action === 'NO_REFUND') return '不退款'
  if (action === 'PARTIAL_REFUND') return '部分退款'
  if (action === 'FULL_REFUND') return '全额退款'
  if (approval?.type === 'ORDER_REFUND') return '订单退款'
  return '退款审批'
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yest = new Date(now)
  yest.setDate(yest.getDate() - 1)
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (isSameDay(d, now)) return `今天 ${t}`
  if (isSameDay(d, yest)) return `昨天 ${t}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${t}`
}

type OrderStatus = 'all' | 'pending' | 'paid' | 'ready_to_verify' | 'playing' | 'completed' | 'no_show' | 'refunding' | 'refunded' | 'cancelled'

const tabs: { key: OrderStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '未付款' },
  { key: 'paid', label: '已付款' },
  { key: 'ready_to_verify', label: '待核销' },
  { key: 'playing', label: '游戏中' },
  { key: 'completed', label: '已核销' },
  { key: 'no_show', label: '已作废' },
  { key: 'refunding', label: '退款中' },
  { key: 'refunded', label: '已退款' },
  { key: 'cancelled', label: '已取消' },
]

const payMethodLabelMap: Record<string, string> = {
  BALANCE: '余额支付',
  BALANCE_POINTS: '余额+积分',
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  CASH: '现金',
}

const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  pending: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', icon: <Clock className="w-3 h-3" /> },
  paid: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary', icon: <CreditCard className="w-3 h-3" /> },
  ready_to_verify: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess', icon: <CheckCircle2 className="w-3 h-3" /> },
  playing: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', icon: <Gamepad2 className="w-3 h-3" /> },
  completed: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess', icon: <CheckCircle2 className="w-3 h-3" /> },
  no_show: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted', icon: <Ban className="w-3 h-3" /> },
  cancelled: { bg: 'bg-vrerror/15', text: 'text-vrerror', icon: <Ban className="w-3 h-3" /> },
  refunding: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', icon: <Clock className="w-3 h-3" /> },
  refunded: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted', icon: <Ban className="w-3 h-3" /> },
}

function StatusBadge({ status, statusText }: { status: string; statusText: string }) {
  const cfg = statusConfig[status] || statusConfig.pending
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-vr-caption font-medium', cfg.bg, cfg.text)}>
      {cfg.icon}
      {statusText}
    </span>
  )
}

function AssignedEquipmentCard({ bookingId, status }: { bookingId: string; status: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['booking-equipment', bookingId],
    queryFn: () => apiClient.get(`/bookings/${bookingId}/equipment`).then((r) => r.data.data),
    enabled: !!bookingId,
  })

  if (isLoading) {
    return (
      <div className="bg-vrbg-elevated rounded-lg p-4">
        <div className="flex items-center gap-2 text-vr-caption text-vrtext-muted">
          <Headset className="w-4 h-4" />
          加载设备信息...
        </div>
      </div>
    )
  }

  const devices = data || []
  const isReleased = status === 'completed' || status === 'no_show'

  return (
    <div className="bg-vrbg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Headset className="w-4 h-4 text-vrtext-secondary" />
        <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">已分配设备</h4>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full',
          isReleased ? 'bg-vrtext-muted/10 text-vrtext-muted' : 'bg-vraccent-primary/10 text-vraccent-primary'
        )}>
          {isReleased ? '已释放' : `使用中 (${devices.length}台)`}
        </span>
      </div>
      {devices.length === 0 ? (
        <p className="text-vr-caption text-vrtext-muted">未分配设备</p>
      ) : (
        <div className="space-y-1.5">
          {devices.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between text-vr-body-sm">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  isReleased ? 'bg-vrtext-muted' : 'bg-vraccent-primary'
                )} />
                <span className="text-vrtext-primary">{d.name}</span>
                <span className="text-vr-caption text-vrtext-muted font-mono">{d.code}</span>
              </div>
              <span className="text-vr-caption text-vrtext-muted">{d.type === 'HEADSET' ? 'VR头盔' : d.type === 'CONTROLLER' ? '手柄' : d.type === 'TRACKER' ? '定位器' : d.type === 'COMPUTER' ? '主机' : d.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OrderDetailSheet({ order, open, onOpenChange, onPay, onCancel, onRefund, onVerify, onMarkNoShow, onActivate, onCompleteRefund, onDelete, onReschedule, canHandleNoShowRefund, hasPendingNoShowApproval, hasPendingRefundApproval, latestApproval, payPending, cancelPending, refundPending, verifyPending, markNoShowPending, activatePending, completeRefundPending, deletePending }: {
  order: Order | null; open: boolean; onOpenChange: (v: boolean) => void;
  onPay: (id: string) => void; onCancel: (order: Order) => void; onRefund: (order: Order) => void; onVerify: (id: string) => void; onMarkNoShow: (order: Order) => void; onActivate: (order: Order) => void; onCompleteRefund: (id: string) => void; onDelete: (id: string) => void; onReschedule: (order: Order) => void; canHandleNoShowRefund: boolean; hasPendingNoShowApproval: boolean; hasPendingRefundApproval: boolean; latestApproval?: ApprovalRequest | null;
  payPending: boolean; cancelPending: boolean; refundPending: boolean; verifyPending: boolean; markNoShowPending: boolean; activatePending: boolean; completeRefundPending: boolean; deletePending: boolean;
}) {
  if (!order) return null

  const statusLower = order.status.toLowerCase()
  const cfg = statusConfig[statusLower]
  const timeline = [
    { time: formatDateTime(order.createdAt), status: '已提交', desc: '订单已创建', completed: true },
    { time: statusLower === 'pending' ? formatDateTime(order.createdAt) : statusLower !== 'cancelled' ? formatDateTime(order.createdAt) : '', status: statusLower === 'cancelled' ? '已取消' : '未付款', desc: statusLower === 'cancelled' ? '订单已取消' : '等待用户付款', completed: statusLower !== 'pending' },
    { time: ['paid', 'ready_to_verify', 'playing', 'completed', 'no_show'].includes(statusLower) ? formatDateTime(order.paidAt || order.createdAt) : '', status: '已付款', desc: '订单已付款', completed: ['paid', 'ready_to_verify', 'playing', 'completed', 'no_show'].includes(statusLower) },
    { time: ['completed', 'no_show'].includes(statusLower) ? (order.bookingTime?.split(' ')[0] || '-') : '', status: statusLower === 'no_show' ? '已作废' : '已核销', desc: statusLower === 'no_show' ? '顾客超时未到场' : '体验已核销', completed: ['completed', 'no_show'].includes(statusLower) },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
        <SheetHeader className="p-6 border-b border-vrborder-subtle">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">订单详情</SheetTitle>
              <SheetDescription className="text-vr-caption text-vrtext-tertiary mt-1">
                订单号: {order.orderNo}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Timeline */}
          <div className="space-y-4">
            <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">订单状态</h4>
            <div className="relative pl-3">
              {timeline.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.08, duration: 0.3 }}
                  className="relative flex gap-4 pb-5 last:pb-0"
                >
                  {/* Line */}
                  {idx < timeline.length - 1 && (
                    <div className={cn(
                      'absolute left-[7px] top-4 w-[2px] h-[calc(100%-16px)]',
                      item.completed && timeline[idx + 1].completed ? 'bg-vraccent-primary' : 'bg-vrbg-elevated'
                    )} />
                  )}
                  {/* Dot */}
                  <div className={cn(
                    'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5',
                    item.completed ? 'bg-vraccent-primary border-vraccent-primary' : 'bg-transparent border-vrborder-subtle'
                  )} />
                  <div className="flex-1 -mt-0.5">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-vr-body-sm font-medium', item.completed ? 'text-vrtext-primary' : 'text-vrtext-muted')}>
                        {item.status}
                      </span>
                      {item.time && (
                        <span className="text-vr-caption text-vrtext-tertiary">{item.time}</span>
                      )}
                    </div>
                    <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Order Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="bg-vrbg-elevated rounded-xl p-5 space-y-4"
          >
            <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">订单信息</h4>
            <div className="space-y-3">
              {[
                { label: '预约场地', value: order.venueName || '-', icon: <MapPin className="w-4 h-4 text-vrtext-muted" /> },
                { label: '预约时间', value: order.bookingTime, icon: <Calendar className="w-4 h-4 text-vrtext-muted" /> },
                { label: '游戏', value: order.booking?.game?.title || 'VR体验', icon: <Gamepad2 className="w-4 h-4 text-vrtext-muted" /> },
                { label: '预约类型', value: '散客预约', icon: <User className="w-4 h-4 text-vrtext-muted" /> },
                { label: '预约人数', value: order.booking?.personCount ?? '-', icon: <User className="w-4 h-4 text-vrtext-muted" /> },
                { label: '预约人', value: order.booking?.personName || '-', icon: <User className="w-4 h-4 text-vrtext-muted" /> },
                { label: '联系电话', value: order.booking?.personPhone || '-', icon: <Phone className="w-4 h-4 text-vrtext-muted" /> },
                { label: '订单金额', value: '', icon: <Receipt className="w-4 h-4 text-vrtext-muted" /> },
                ...(order.couponDiscount && order.couponDiscount > 0 ? [{ label: '优惠券抵扣', value: `-¥${(order.couponDiscount / 100).toFixed(2)} ${order.userCoupon ? '(' + order.userCoupon.name + ')' : ''}${order.userCoupon?.source === 'MANUAL_GIFT' ? ' [管理员赠送]' : ''}`, icon: <Receipt className="w-4 h-4 text-vrtext-muted" /> }] : []),
                ...(order.discountAmount && order.discountAmount > 0 ? [{ label: '会员优惠', value: `-¥${(order.discountAmount / 100).toFixed(2)}`, icon: <Receipt className="w-4 h-4 text-vrtext-muted" /> }] : []),
                { label: '实付金额', value: `¥${((order.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: <Receipt className="w-4 h-4 text-vrtext-muted" /> },
                { label: '支付方式', value: payMethodLabelMap[order.payMethod || ''] || order.payMethod || '-', icon: <PaymentIcon className="w-4 h-4 text-vrtext-muted" /> },
                { label: '创建时间', value: formatDateTime(order.createdAt), icon: <Clock className="w-4 h-4 text-vrtext-muted" /> },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-vrtext-tertiary">
                    {item.icon}
                    <span className="text-vr-caption">{item.label}</span>
                  </div>
                  <span className={cn(
                    'text-vr-body-sm text-vrtext-primary',
                    item.label === '订单金额' && 'font-semibold text-vrwarning'
                  )}>
                    {item.label === '订单金额' ? `¥${((order.originalAmount || order.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : item.value}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Current Status */}
          <div className="flex items-center justify-center py-2">
            <span className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-vr-body-sm font-medium', cfg?.bg, cfg?.text)}>
              {cfg?.icon}
              {({ PENDING: '未付款', PAID: '已付款', READY_TO_VERIFY: '待核销', PLAYING: '游戏中', COMPLETED: '已核销', NO_SHOW: '已作废', CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款' } as Record<string,string>)[order.status] || order.status}
            </span>
          </div>

          {latestApproval && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.3 }}
              className={cn(
                'rounded-xl border p-4 space-y-3',
                approvalStatusClass[latestApproval.status] || 'border-vrborder-subtle bg-vrbg-elevated text-vrtext-secondary'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-vr-body-sm font-semibold">最近审批</h4>
                  <p className="text-vr-caption opacity-80 mt-0.5">
                    {approvalActionText(latestApproval)} · ¥{((latestApproval.amount || 0) / 100).toFixed(2)}
                  </p>
                </div>
                <span className="rounded-full bg-black/10 px-2.5 py-1 text-vr-caption font-medium">
                  {approvalStatusLabel[latestApproval.status] || latestApproval.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-vr-caption">
                <div>
                  <span className="opacity-70">申请人</span>
                  <p className="font-medium mt-0.5">{latestApproval.requesterName}</p>
                </div>
                <div>
                  <span className="opacity-70">申请原因</span>
                  <p className="font-medium mt-0.5 line-clamp-2">{latestApproval.reason}</p>
                </div>
              </div>
              {latestApproval.status === 'REJECTED' && latestApproval.approvalComment && (
                <div className="rounded-lg bg-black/10 p-3 text-vr-caption leading-5">
                  拒绝原因：{latestApproval.approvalComment}
                </div>
              )}
              {latestApproval.status === 'EXECUTION_FAILED' && latestApproval.approvalComment && (
                <div className="rounded-lg bg-black/10 p-3 text-vr-caption leading-5">
                  执行失败：{latestApproval.approvalComment}
                </div>
              )}
            </motion.div>
          )}

          {/* 已分配设备 */}
          {order.bookingId && ['checked_in', 'playing', 'completed', 'no_show'].includes(statusLower) && (
            <AssignedEquipmentCard bookingId={order.bookingId} status={statusLower} />
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-6 border-t border-vrborder-subtle flex gap-3">
          {statusLower === 'pending' && (
            <>
              <button
                onClick={() => onCancel(order)}
                disabled={cancelPending}
                className="flex-1 h-10 rounded-lg border border-vrerror text-vrerror text-vr-body-sm font-medium hover:bg-vrerror/10 transition-colors disabled:opacity-50"
              >
                {cancelPending ? '取消中...' : '取消订单'}
              </button>
              <button
                onClick={() => onPay(order.id)}
                disabled={payPending}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
              >
                {payPending ? '处理中...' : '确认收款'}
              </button>
            </>
          )}
          {['paid', 'ready_to_verify'].includes(statusLower) && (
            <>
              <button
                onClick={() => onReschedule(order)}
                className="flex-1 h-10 rounded-lg border border-vraccent-primary text-vraccent-primary text-vr-body-sm font-medium hover:bg-vraccent-primary/10 transition-colors"
              >
                改签
              </button>
              <button
                onClick={() => onRefund(order)}
                disabled={refundPending || hasPendingRefundApproval}
                className="flex-1 h-10 rounded-lg border border-vrerror text-vrerror text-vr-body-sm font-medium hover:bg-vrerror/10 transition-colors disabled:opacity-50"
              >
                {hasPendingRefundApproval ? '审批中' : refundPending ? '提交中...' : '申请退款'}
              </button>
              <button
                onClick={() => onMarkNoShow(order)}
                disabled={markNoShowPending}
                className="flex-1 h-10 rounded-lg border border-vrwarning text-vrwarning text-vr-body-sm font-medium hover:bg-vrwarning/10 transition-colors disabled:opacity-50"
              >
                {markNoShowPending ? '处理中...' : '标记爽约'}
              </button>
              {statusLower === 'ready_to_verify' && (
                <button
                  onClick={() => onVerify(order.id)}
                  disabled={verifyPending}
                  className="flex-1 h-10 rounded-lg bg-vrsuccess text-white text-vr-body-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50"
                >
                  {verifyPending ? '处理中...' : '核销订单'}
                </button>
              )}
            </>
          )}
          {statusLower === 'playing' && (
            <>
              <button
                onClick={() => onMarkNoShow(order)}
                disabled={markNoShowPending}
                className="flex-1 h-10 rounded-lg border border-vrwarning text-vrwarning text-vr-body-sm font-medium hover:bg-vrwarning/10 transition-colors disabled:opacity-50"
              >
                {markNoShowPending ? '处理中...' : '标记爽约'}
              </button>
              <button className="flex-1 h-10 rounded-lg bg-emerald-500/20 text-emerald-500 text-vr-body-sm font-medium cursor-default">
                游戏中
              </button>
            </>
          )}
          {['completed', 'no_show'].includes(statusLower) && (
            <>
              {statusLower === 'no_show' && (
                <button
                  onClick={() => onActivate(order)}
                  disabled={activatePending}
                  className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
                >
                  {activatePending ? '处理中...' : '撤销作废'}
                </button>
              )}
              {statusLower === 'no_show' && canHandleNoShowRefund && (
                <button
                  onClick={() => onRefund(order)}
                  disabled={refundPending || hasPendingNoShowApproval}
                  className="flex-1 h-10 rounded-lg border border-vrerror text-vrerror text-vr-body-sm font-medium hover:bg-vrerror/10 transition-colors disabled:opacity-50"
                >
                  {hasPendingNoShowApproval ? '审批中' : refundPending ? '提交中...' : '申请处置'}
                </button>
              )}
              {statusLower === 'completed' && (() => {
                const today = new Date().toISOString().slice(0, 10)
                const bookingDate = order.bookingTime?.split(' ')[0]
                const isToday = bookingDate === today
                return isToday ? (
                  <button
                    onClick={() => onRefund(order)}
                    disabled={refundPending || hasPendingRefundApproval}
                    className="flex-1 h-10 rounded-lg border border-vrerror text-vrerror text-vr-body-sm font-medium hover:bg-vrerror/10 transition-colors disabled:opacity-50"
                  >
                    {hasPendingRefundApproval ? '审批中' : refundPending ? '提交中...' : '申请退款'}
                  </button>
                ) : null
              })()}
              <button className={cn('h-10 rounded-lg bg-vrbg-elevated text-vrtext-secondary text-vr-body-sm font-medium cursor-default', statusLower === 'no_show' ? 'flex-1' : 'w-full')}>
                {statusLower === 'no_show' ? '已作废' : '已核销'}
              </button>
            </>
          )}
          {statusLower === 'refunding' && (
            <button
              onClick={() => onCompleteRefund(order.id)}
              disabled={completeRefundPending}
              className="w-full h-10 rounded-lg bg-vrwarning text-white text-vr-body-sm font-medium hover:bg-vrwarning/90 transition-colors disabled:opacity-50"
            >
              {completeRefundPending ? '处理中...' : '确认退款完成'}
            </button>
          )}
          {statusLower === 'refunded' && (
            <button className="w-full h-10 rounded-lg bg-vrbg-elevated text-vrtext-muted text-vr-body-sm font-medium cursor-default">
              已退款
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function Orders() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<OrderStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ONLINE' | 'OFFLINE'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 收款弹窗状态
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [scanBoxOpen, setScanBoxOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [paymentTargetOrder, setPaymentTargetOrder] = useState<Order | null>(null)

  // 核销扫码弹窗状态
  const [verifyScanOpen, setVerifyScanOpen] = useState(false)
  const [verifyTargetOrder, setVerifyTargetOrder] = useState<Order | null>(null)

  // 改签弹窗状态
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<Order | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<Order | null>(null)
  const [restoreReason, setRestoreReason] = useState('')
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundTarget, setRefundTarget] = useState<Order | null>(null)
  const [refundAction, setRefundAction] = useState<RefundDispositionAction>('FULL_REFUND')
  const [refundAmountYuan, setRefundAmountYuan] = useState('')
  const [refundReason, setRefundReason] = useState('')

  useEffect(() => {
    setSelectedIds([])
  }, [activeTab, currentPage, searchQuery, startDate, endDate, sourceFilter])

  const { data: orderData, isFetching } = useQuery({
    queryKey: ['orders', activeTab, searchQuery, startDate, endDate, sourceFilter, currentPage, pageSize],
    queryFn: () =>
      getOrders({
        status: activeTab === 'all' ? undefined : activeTab.toUpperCase(),
        search: searchQuery || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        source: sourceFilter === 'all' ? undefined : sourceFilter,
        page: currentPage,
        pageSize,
      }),
    staleTime: 1000 * 30, // 30秒内不重新请求
    placeholderData: (previousData: any) => previousData, // 切换标签时保持旧数据，减少闪烁
  })

  const { data: approvalData } = useQuery({
    queryKey: ['approvals', 'order-actions-latest'],
    queryFn: () => getApprovals({ page: 1, pageSize: 500 }),
    staleTime: 1000 * 20,
  })

  const pendingNoShowApprovalMap = useMemo(() => {
    const items = approvalData?.data || []
    return new Set<string>(items.filter((item: any) => item.status === 'PENDING' && item.type === 'NO_SHOW_REFUND').map((item: any) => item.targetId))
  }, [approvalData])

  const pendingRefundApprovalMap = useMemo(() => {
    const items = approvalData?.data || []
    return new Set<string>(items.filter((item: any) => item.status === 'PENDING' && item.type === 'ORDER_REFUND').map((item: any) => item.targetId))
  }, [approvalData])

  const latestApprovalMap = useMemo(() => {
    const items: ApprovalRequest[] = approvalData?.data || []
    const map = new Map<string, ApprovalRequest>()
    for (const item of items) {
      if (!['NO_SHOW_REFUND', 'ORDER_REFUND'].includes(item.type)) continue
      const existing = map.get(item.targetId)
      if (!existing || new Date(item.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        map.set(item.targetId, item)
      }
    }
    return map
  }, [approvalData])

  // Sync currentPage when totalPages shrinks (e.g. after filter change or data deletion)
  const total = orderData?.meta?.total || 0
  const totalPages = orderData?.meta?.totalPages || 1
  const safePage = Math.min(currentPage, totalPages)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages)
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['revenue'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['venues'], exact: false })
  }

  const canHandleNoShowRefund = ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'MANAGER', 'OPERATOR'].includes(currentUser?.role || '')

  const payMutation = useMutation({
    mutationFn: ({ id, method }: { id: string; method?: string }) => payOrder(id, method || 'CASH'),
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
      setPaymentModalOpen(false)
      setScanBoxOpen(false)
      setPaymentTargetOrder(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (order: Order) => cancelOrder(order.id),
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
    },
    onError: (error: any) => {
      alert('取消订单失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const openRefundDialog = (order: Order) => {
    const defaultRefund = Math.max(0, (order.amount || 0) - (order.penaltyAmount || 0))
    setRefundTarget(order)
    setRefundAction(order.status === 'NO_SHOW' ? (defaultRefund > 0 ? 'PARTIAL_REFUND' : 'NO_REFUND') : 'FULL_REFUND')
    setRefundAmountYuan(((order.status === 'NO_SHOW' ? defaultRefund : order.amount || 0) / 100).toFixed(2))
    setRefundReason('')
    setRefundOpen(true)
  }

  const closeRefundDialog = () => {
    setRefundOpen(false)
    setRefundTarget(null)
    setRefundAction('FULL_REFUND')
    setRefundAmountYuan('')
    setRefundReason('')
  }

  const refundMutation = useMutation({
    mutationFn: async ({
      order,
      action,
      amount,
      reason,
    }: {
      order: Order
      action: RefundDispositionAction
      amount: number
      reason: string
    }) => {
      if (order.status === 'NO_SHOW') {
        return createNoShowRefundApproval(order.id, { action, amount, reason })
      }
      return createOrderRefundApproval(order.id, { amount, reason })
    },
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
      closeRefundDialog()
    },
    onError: (error: any) => {
      alert('提交失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const completeRefundMutation = useMutation({
    mutationFn: completeRefundOrder,
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
    },
    onError: (error: any) => {
      alert('确认退款失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const verifyMutation = useMutation({
    mutationFn: verifyOrder,
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
      setVerifyScanOpen(false)
      setVerifyTargetOrder(null)
    },
    onError: (error: any) => {
      alert('核销失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
      setVerifyScanOpen(false)
      setVerifyTargetOrder(null)
    },
  })

  const markNoShowMutation = useMutation({
    mutationFn: (order: Order) => markNoShow(order.id, 'manual'),
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
    },
    onError: (error: any) => {
      alert('标记爽约失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const openRestoreDialog = (order: Order) => {
    setRestoreTarget(order)
    setRestoreReason('')
    setRestoreOpen(true)
  }

  const activateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => activateOrder(id, reason),
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
      setRestoreOpen(false)
      setRestoreTarget(null)
      setRestoreReason('')
    },
    onError: (error: any) => {
      alert('撤销作废失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const rescheduleMutation = useMutation({
    mutationFn: async ({ orderId, date, startTime }: { orderId: string; date: string; startTime: string }) => {
      const res = await apiClient.post(`/bookings/${orderId}/reschedule`, { date, startTime })
      return res.data
    },
    onSuccess: (data: any) => {
      invalidateAll()
      setRescheduleOpen(false)
      setRescheduleTarget(null)
      const fee = data.data?.feeAmount ?? 0
      const delta = data.data?.deltaAmount ?? 0
      const freeUsed = data.data?.freeRescheduleUsed
      let msg = '改签成功！'
      if (freeUsed) msg += '已使用本月免费改签权益，免手续费。'
      else if (fee > 0) msg += `手续费：¥${(fee / 100).toFixed(2)}。`
      if (delta > 0) msg += `需补差价：¥${(delta / 100).toFixed(2)}。`
      else if (delta < 0) msg += `退回差价：¥${(Math.abs(delta) / 100).toFixed(2)}。`
      alert(msg)
    },
    onError: (error: any) => {
      alert('改签失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/orders/${id}`),
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
    },
  })

  const batchVerifyMutation = useMutation({
    mutationFn: batchVerifyOrders,
    onSuccess: () => {
      invalidateAll()
      setSelectedIds([])
    },
    onError: (error: any) => {
      alert('批量核销失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const batchRefundMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) => batchRefundOrders(ids, reason),
    onSuccess: () => {
      invalidateAll()
      setSelectedIds([])
    },
    onError: (error: any) => {
      alert('批量退款失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const batchCancelMutation = useMutation({
    mutationFn: async (orders: Order[]) => {
      const results = await Promise.allSettled(
        orders.map((order) => cancelOrder(order.id))
      )
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failures.length > 0) {
        alert(`${failures.length} 个订单取消失败`)
      }
      return results
    },
    onSuccess: () => {
      invalidateAll()
      setSelectedIds([])
    },
  })

  const statusLabelMap: Record<string, string> = {
    PENDING: '未付款',
    PAID: '已付款',
    READY_TO_VERIFY: '待核销',
    PLAYING: '游戏中',
    COMPLETED: '已核销',
    NO_SHOW: '已作废',
    CANCELLED: '已取消',
    REFUNDING: '退款中',
    REFUNDED: '已退款',
  }

  const handleExport = async () => {
    // Fetch all orders matching current filters
    const res = await getOrders({
      status: activeTab === 'all' ? undefined : activeTab.toUpperCase(),
      search: searchQuery || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      source: sourceFilter === 'all' ? undefined : sourceFilter,
      page: 1,
      pageSize: 9999,
    })
    const allOrders: Order[] = res?.data || []

    if (allOrders.length === 0) {
      alert('暂无数据可导出')
      return
    }

    // Format data for Excel
    const rows = allOrders.map((o) => ({
      订单号: o.orderNo,
      用户: o.user?.name || o.booking?.personName || o.customer || '-',
      场地: o.venueName,
      预约时间: o.bookingTime,
      游戏: (o as any).booking?.game?.title || 'VR体验',
      人数: o.booking?.personCount ?? '-',
      原价: (o.originalAmount || o.amount || 0) / 100,
      会员优惠: (o.discountAmount || 0) / 100,
      优惠券抵扣: (o.couponDiscount || 0) / 100,
      实付金额: (o.amount || 0) / 100,
      状态: statusLabelMap[o.status] || o.status,
      支付方式: payMethodLabelMap[o.payMethod || ''] || o.payMethod || '-',
      创建时间: o.createdAt ? format(new Date(o.createdAt), 'yyyy-MM-dd HH:mm:ss') : '-',
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)

    // Auto-width for columns
    const colWidths = [
      { wch: 20 }, // 订单号
      { wch: 12 }, // 用户
      { wch: 12 }, // 场地
      { wch: 20 }, // 预约时间
      { wch: 16 }, // 游戏
      { wch: 8 },  // 人数
      { wch: 12 }, // 原价
      { wch: 12 }, // 会员优惠
      { wch: 12 }, // 优惠券抵扣
      { wch: 12 }, // 实付金额
      { wch: 10 }, // 状态
      { wch: 12 }, // 支付方式
      { wch: 20 }, // 创建时间
    ]
    worksheet['!cols'] = colWidths

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '订单列表')

    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(workbook, `orders_${today}.xlsx`)
  }

  const apiOrders: Order[] = orderData?.data || []

  const paginatedOrders = apiOrders

  const selectedOrders = useMemo(() => paginatedOrders.filter(o => selectedIds.includes(o.id)), [paginatedOrders, selectedIds])
  const hasPaidSelected = selectedOrders.some(o => o.status === 'PAID')
  const hasReadyToVerifySelected = selectedOrders.some(o => o.status === 'READY_TO_VERIFY')
  const hasPendingSelected = selectedOrders.some(o => o.status === 'PENDING')

  // 标签计数：优先使用后端返回的 statusCounts（全量统计），否则回退到当前页数据
  const tabCounts = useMemo(() => {
    const backendCounts = orderData?.meta?.statusCounts as Record<string, number> | undefined
    if (backendCounts) {
      const all = Object.values(backendCounts).reduce((a, b) => a + b, 0)
      return { all, ...backendCounts }
    }
    // fallback：基于当前页数据（不准确，仅作兜底）
    const counts: Record<string, number> = { all: total }
    for (const o of apiOrders) {
      const key = o.status.toLowerCase()
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [orderData?.meta?.statusCounts, apiOrders, total])

  const handleOpenDetail = (order: Order) => {
    setSelectedOrder(order)
    setDrawerOpen(true)
  }

  const handleCollect = (order: Order) => {
    setPaymentTargetOrder(order)
    setPaymentModalOpen(true)
  }

  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method)
    setPaymentModalOpen(false)

    if (method === 'CASH') {
      // 现金直接收款，不走扫码流程
      if (paymentTargetOrder) {
        payMutation.mutate({ id: paymentTargetOrder.id, method: 'CASH' })
      }
      return
    }

    // 微信、支付宝、扫码盒 → 打开扫码模拟器
    setScanBoxOpen(true)
  }

  const handleScanBoxSuccess = () => {
    // 模拟支付成功后的真实收款调用
    // TODO: 接入真实扫码支付 API（轮询支付结果）
    if (paymentTargetOrder && paymentMethod) {
      payMutation.mutate({ id: paymentTargetOrder.id, method: paymentMethod === 'SCANBOX' ? undefined : paymentMethod })
    }
  }

  return (
    <Layout breadcrumb={['订单管理']}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">订单管理</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">订单处理、支付管理、退款处理</p>
          </motion.div>

          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="relative"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
              <input
                type="text"
                placeholder="搜索订单号、预约人..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                className="w-[300px] h-9 pl-9 pr-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </motion.div>

            {/* Date Range Filter */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.12 }}
              className="flex items-center gap-2"
            >
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1) }}
                className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
              <span className="text-vr-caption text-vrtext-tertiary">至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1) }}
                className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); setCurrentPage(1) }}
                  className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors"
                >
                  清除
                </button>
              )}
            </motion.div>

            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              onClick={handleExport}
              className="h-9 px-4 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出订单
            </motion.button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center justify-between border-b border-vrborder-subtle">
          <div className="flex gap-6">
            {tabs.map((tab, idx) => (
              <motion.button
                key={tab.key}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.06 }}
                onClick={() => { setActiveTab(tab.key); setCurrentPage(1) }}
                className={cn(
                  'relative py-3 text-vr-body-sm font-medium transition-colors',
                  activeTab === tab.key ? 'text-vraccent-primary' : 'text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {tabCounts[tab.key] !== undefined && tabCounts[tab.key] > 0 && (
                    <span
                      className={cn(
                        'min-w-[18px] h-[18px] px-1 rounded-full text-[11px] leading-none font-semibold flex items-center justify-center',
                        activeTab === tab.key
                          ? 'bg-vraccent-primary/15 text-vraccent-primary'
                          : 'bg-vrbg-elevated text-vrtext-muted'
                      )}
                    >
                      {tabCounts[tab.key]}
                    </span>
                  )}
                </span>
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="order-active-tab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-vraccent-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {/* 来源筛选 */}
            <div className="flex items-center gap-1 bg-vrbg-surface rounded-lg p-1">
              {([
                { key: 'all', label: '全部' },
                { key: 'ONLINE', label: '线上' },
                { key: 'OFFLINE', label: '线下' },
              ] as const).map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setSourceFilter(s.key); setCurrentPage(1) }}
                  className={cn(
                    'px-3 py-1 rounded text-vr-body-sm font-medium transition-colors',
                    sourceFilter === s.key
                      ? 'bg-vraccent-primary text-white'
                      : 'text-vrtext-secondary hover:text-vrtext-primary'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-vr-caption text-vrtext-tertiary">
              {total} 条记录
            </span>
          </div>
        </div>

        {/* Batch Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-between bg-vrbg-elevated rounded-xl border border-vraccent-primary/20 px-4 py-3"
            >
              <div className="flex items-center gap-4">
                <span className="text-vr-body-sm text-vrtext-primary font-medium">
                  已选择 {selectedIds.length} 项
                </span>
                {hasReadyToVerifySelected && (
                  <button
                    onClick={() => {
                      const ids = selectedOrders.filter(o => o.status === 'READY_TO_VERIFY').map(o => o.id)
                      if (!window.confirm(`确定要批量核销 ${ids.length} 个订单吗？`)) return
                      batchVerifyMutation.mutate(ids)
                    }}
                    disabled={batchVerifyMutation.isPending}
                    className="h-8 px-3 rounded-lg bg-vrsuccess text-white text-vr-body-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50"
                  >
                    {batchVerifyMutation.isPending ? '核销中...' : '批量核销'}
                  </button>
                )}
                {hasPaidSelected && (
                  <button
                    onClick={() => {
                      const ids = selectedOrders.filter(o => o.status === 'PAID').map(o => o.id)
                      if (!window.confirm(`确定要批量退款 ${ids.length} 个订单吗？`)) return
                      batchRefundMutation.mutate({ ids, reason: '批量退款' })
                    }}
                    disabled={batchRefundMutation.isPending}
                    className="h-8 px-3 rounded-lg bg-vrerror text-white text-vr-body-sm font-medium hover:bg-vrerror/90 transition-colors disabled:opacity-50"
                  >
                    {batchRefundMutation.isPending ? '退款中...' : '批量退款'}
                  </button>
                )}
                {hasPendingSelected && (
                  <button
                    onClick={() => {
                      const orders = selectedOrders.filter(o => o.status === 'PENDING')
                      if (!window.confirm(`确定要批量取消 ${orders.length} 个订单吗？`)) return
                      batchCancelMutation.mutate(orders)
                    }}
                    disabled={batchCancelMutation.isPending}
                    className="h-8 px-3 rounded-lg bg-vrwarning text-white text-vr-body-sm font-medium hover:bg-vrwarning/90 transition-colors disabled:opacity-50"
                  >
                    {batchCancelMutation.isPending ? '取消中...' : '批量取消'}
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedIds([])}
                className="text-vr-body-sm text-vrtext-secondary hover:text-vrtext-primary transition-colors"
              >
                清空选择
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-vrbg-elevated">
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[48px]">
                    <input
                      type="checkbox"
                      checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.includes(o.id))}
                      onChange={() => {
                        const allSelected = paginatedOrders.every(o => selectedIds.includes(o.id))
                        if (allSelected) {
                          setSelectedIds(prev => prev.filter(id => !paginatedOrders.some(o => o.id === id)))
                        } else {
                          setSelectedIds(prev => [...new Set([...prev, ...paginatedOrders.map(o => o.id)])])
                        }
                      }}
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">订单号</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">用户</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">场地</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[130px]">创建时间</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[170px]">预约时间</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">游戏</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[70px]">人数</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[110px]">实付</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">优惠</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[130px]">状态</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[130px]">操作</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="wait">
                  {paginatedOrders.map((order, idx) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.06 }}
                      className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(order.id)}
                          onChange={() => {
                            setSelectedIds(prev =>
                              prev.includes(order.id)
                                ? prev.filter(id => id !== order.id)
                                : [...prev, order.id]
                            )
                          }}
                          className="w-4 h-4 rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary font-mono">{order.orderNo}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{order.user?.name || order.booking?.personName || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{order.venueName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{formatDateTime(order.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-vr-body-sm text-vrtext-primary">{order.bookingTime?.split(' ')?.[1] || order.bookingTime}</span>
                          <span className="text-vr-caption text-vrtext-tertiary">{order.bookingTime?.split(' ')?.[0]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{order.booking?.game?.title || 'VR体验'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-vr-body-sm text-vrtext-primary">{order.booking?.personCount ?? '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-vr-body-sm text-vrtext-primary font-semibold">¥{((order.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(order.couponDiscount && order.couponDiscount > 0) || (order.discountAmount && order.discountAmount > 0) ? (
                          <div className="flex flex-col items-end">
                            <span className="text-vr-caption text-vrsuccess">
                              -¥{(((order.couponDiscount || 0) + (order.discountAmount || 0)) / 100).toFixed(2)}
                            </span>
                            {order.userCoupon && (
                              <span className="text-[10px] text-vrtext-muted">{order.userCoupon.name}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-vr-caption text-vrtext-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={order.status.toLowerCase()} statusText={
                          { PENDING: '未付款', PAID: '已付款', READY_TO_VERIFY: '待核销', PLAYING: '游戏中', COMPLETED: '已核销', NO_SHOW: '已作废', CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款' }[order.status] || order.status
                        } />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {order.status.toLowerCase() === 'pending' && (
                            <>
                              <button
                                onClick={() => handleCollect(order)}
                                className="text-vr-body-sm text-vrwarning hover:underline transition-all"
                              >
                                收款
                              </button>
                              <button
                                onClick={() => {
                                  if (!window.confirm(`确定取消订单 ${order.orderNo} 吗？`)) return
                                  cancelMutation.mutate(order)
                                }}
                                disabled={cancelMutation.isPending}
                                className="text-vr-body-sm text-vrerror hover:underline transition-all disabled:opacity-50"
                              >
                                取消
                              </button>
                            </>
                          )}
                          {['paid', 'ready_to_verify'].includes(order.status.toLowerCase()) && (
                            <>
                              {order.status.toLowerCase() === 'ready_to_verify' && (
                                <button
                                  onClick={() => { setVerifyTargetOrder(order); setVerifyScanOpen(true) }}
                                  className="text-vr-body-sm text-vrsuccess hover:underline transition-all"
                                >
                                  核销
                                </button>
                              )}
                              <button
                                onClick={() => { setSelectedOrder(order); markNoShowMutation.mutate(order) }}
                                className="text-vr-body-sm text-vrwarning hover:underline transition-all"
                              >
                                标记爽约
                              </button>
                              <button
                                onClick={() => { setSelectedOrder(order); openRefundDialog(order) }}
                                disabled={pendingRefundApprovalMap.has(order.id)}
                                className="text-vr-body-sm text-vrerror hover:underline transition-all disabled:text-vrtext-muted disabled:no-underline disabled:cursor-not-allowed"
                              >
                                {pendingRefundApprovalMap.has(order.id) ? '审批中' : '申请退款'}
                              </button>
                            </>
                          )}
                          {order.status.toLowerCase() === 'playing' && (
                            <>
                              <button
                                onClick={() => { setSelectedOrder(order); markNoShowMutation.mutate(order) }}
                                className="text-vr-body-sm text-vrwarning hover:underline transition-all"
                              >
                                标记爽约
                              </button>
                              <span className="text-vr-body-sm text-emerald-500">游戏中</span>
                            </>
                          )}
                          {order.status.toLowerCase() === 'no_show' && (
                            <>
                              <button
                                onClick={() => openRestoreDialog(order)}
                                className="text-vr-body-sm text-vraccent-primary hover:underline transition-all"
                              >
                                撤销作废
                              </button>
                              {canHandleNoShowRefund && (
                                <button
                                  onClick={() => { setSelectedOrder(order); openRefundDialog(order) }}
                                  disabled={pendingNoShowApprovalMap.has(order.id)}
                                  className="text-vr-body-sm text-vrerror hover:underline transition-all disabled:text-vrtext-muted disabled:no-underline disabled:cursor-not-allowed"
                                >
                                  {pendingNoShowApprovalMap.has(order.id) ? '审批中' : '申请处置'}
                                </button>
                              )}
                            </>
                          )}
                          {order.status.toLowerCase() === 'refunding' && (
                            <button
                              onClick={() => { setSelectedOrder(order); completeRefundMutation.mutate(order.id) }}
                              className="text-vr-body-sm text-vrwarning hover:underline transition-all"
                            >
                              确认退款
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenDetail(order)}
                            className="text-vr-body-sm text-vraccent-primary hover:underline transition-all"
                          >
                            详情
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {paginatedOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Receipt className="w-12 h-12 text-vrtext-muted mb-3" />
              <p className="text-vr-body text-vrtext-secondary">暂无订单数据</p>
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-vrborder-subtle">
              <div className="flex items-center gap-2">
                <span className="text-vr-caption text-vrtext-tertiary">每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="h-7 px-2 bg-vrbg-surface border border-vrborder-subtle rounded text-vr-caption text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span className="text-vr-caption text-vrtext-tertiary">条</span>
                <span className="text-vr-caption text-vrtext-tertiary ml-2">共 {total} 条</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      'w-8 h-8 flex items-center justify-center rounded-lg text-vr-body-sm font-medium transition-colors',
                      page === safePage
                        ? 'bg-vraccent-primary text-white'
                        : 'border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated'
                    )}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Order Detail Drawer */}
      <OrderDetailSheet
        order={selectedOrder}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onPay={(id) => payMutation.mutate({ id, method: 'CASH' })}
        onCancel={(o) => cancelMutation.mutate(o)}
        onRefund={openRefundDialog}
        onVerify={(id) => {
          const order = selectedOrder
          if (order) {
            setVerifyTargetOrder(order)
            setVerifyScanOpen(true)
          }
        }}
        onMarkNoShow={(o) => markNoShowMutation.mutate(o)}
        onActivate={openRestoreDialog}
        onCompleteRefund={(id) => completeRefundMutation.mutate(id)}
        onDelete={(id) => deleteMutation.mutate(id)}
        onReschedule={(o) => { setRescheduleTarget(o); setRescheduleDate(o.bookingTime?.split(' ')[0] || ''); setRescheduleTime(o.bookingTime?.split(' ')[1]?.split('-')[0] || ''); setRescheduleOpen(true) }}
        canHandleNoShowRefund={canHandleNoShowRefund}
        hasPendingNoShowApproval={selectedOrder ? pendingNoShowApprovalMap.has(selectedOrder.id) : false}
        hasPendingRefundApproval={selectedOrder ? pendingRefundApprovalMap.has(selectedOrder.id) : false}
        latestApproval={selectedOrder ? latestApprovalMap.get(selectedOrder.id) : null}
        payPending={payMutation.isPending}
        cancelPending={cancelMutation.isPending}
        refundPending={refundMutation.isPending}
        verifyPending={verifyMutation.isPending}
        markNoShowPending={markNoShowMutation.isPending}
        activatePending={activateMutation.isPending}
        completeRefundPending={completeRefundMutation.isPending}
        deletePending={deleteMutation.isPending}
      />

      {/* Payment Method Selector */}
      <PaymentMethodModal
        open={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false)
          setPaymentTargetOrder(null)
        }}
        orderNo={paymentTargetOrder?.orderNo || ''}
        customer={paymentTargetOrder?.customer || paymentTargetOrder?.user?.name || paymentTargetOrder?.booking?.personName}
        amount={(paymentTargetOrder?.amount || 0) / 100}
        onSelect={handleSelectPaymentMethod}
      />

      {/* Scan Box Simulator */}
      <ScanBoxSimulator
        open={scanBoxOpen}
        onClose={() => {
          setScanBoxOpen(false)
          setPaymentMethod(null)
          setPaymentTargetOrder(null)
        }}
        method={paymentMethod || 'SCANBOX'}
        orderNo={paymentTargetOrder?.orderNo || ''}
        amount={(paymentTargetOrder?.amount || 0) / 100}
        onSuccess={handleScanBoxSuccess}
      />

      {/* Verify Scan Modal */}
      <VerifyScanModal
        open={verifyScanOpen}
        onClose={() => {
          setVerifyScanOpen(false)
          setVerifyTargetOrder(null)
        }}
        order={verifyTargetOrder ? {
          id: verifyTargetOrder.id,
          orderNo: verifyTargetOrder.orderNo,
          customer: verifyTargetOrder.customer || verifyTargetOrder.user?.name || verifyTargetOrder.booking?.personName,
          venueName: verifyTargetOrder.venueName,
          bookingTime: verifyTargetOrder.bookingTime,
          amount: verifyTargetOrder.amount,
          personCount: verifyTargetOrder.booking?.personCount,
        } : null}
        onVerify={(id) => verifyMutation.mutate(id)}
      />

      {/* Restore No-show Modal */}
      <AnimatePresence>
        {restoreOpen && restoreTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setRestoreOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-vrbg-card border border-vrborder-subtle rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <h3 className="text-vr-h3 text-vrtext-primary font-semibold mb-1">撤销作废</h3>
              <p className="text-vr-caption text-vrtext-muted mb-4">
                订单：{restoreTarget.orderNo}
              </p>
              <div className="rounded-xl border border-vrwarning/30 bg-vrwarning/10 p-3 text-vr-caption text-vrtext-secondary leading-5">
                确认后订单将从“已作废”恢复为“待核销”，顾客可继续核销入场；爽约状态和违约金记录会被撤销。
              </div>
              <div className="mt-4">
                <label className="text-vr-caption text-vrtext-secondary block mb-1">恢复原因</label>
                <textarea
                  value={restoreReason}
                  onChange={(e) => setRestoreReason(e.target.value)}
                  placeholder="例如：顾客已到店，因扫码异常被系统自动作废"
                  className="w-full min-h-24 px-3 py-2 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary resize-none"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setRestoreOpen(false)}
                  className="flex-1 h-10 rounded-lg text-vr-body-sm font-medium text-vrtext-secondary bg-vrbg-elevated hover:bg-vrborder-subtle transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const reason = restoreReason.trim()
                    if (!reason) {
                      alert('请填写恢复原因')
                      return
                    }
                    activateMutation.mutate({ id: restoreTarget.id, reason })
                  }}
                  disabled={activateMutation.isPending}
                  className="flex-1 h-10 rounded-lg text-vr-body-sm font-medium text-white bg-vraccent-primary hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
                >
                  {activateMutation.isPending ? '处理中...' : '确认恢复'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Refund Disposition Modal */}
      <AnimatePresence>
        {refundOpen && refundTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={closeRefundDialog}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-vrbg-card border border-vrborder-subtle rounded-2xl p-6 w-full max-w-lg shadow-2xl"
            >
              {(() => {
                const isNoShow = refundTarget.status === 'NO_SHOW'
                const amount = refundTarget.amount || 0
                const penalty = refundTarget.penaltyAmount ?? amount
                const suggestedRefund = Math.max(0, amount - penalty)
                return (
                  <>
                    <h3 className="text-vr-h3 text-vrtext-primary font-semibold mb-1">
                      {isNoShow ? '申请已作废退款审批' : '订单退款'}
                    </h3>
                    <p className="text-vr-caption text-vrtext-muted mb-4">
                      订单：{refundTarget.orderNo}
                    </p>

                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="rounded-xl bg-vrbg-surface border border-vrborder-subtle p-3">
                        <p className="text-vr-caption text-vrtext-muted">实付金额</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary mt-1">¥{(amount / 100).toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl bg-vrbg-surface border border-vrborder-subtle p-3">
                        <p className="text-vr-caption text-vrtext-muted">违约金</p>
                        <p className="text-vr-body font-semibold text-vrwarning mt-1">¥{(penalty / 100).toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl bg-vrbg-surface border border-vrborder-subtle p-3">
                        <p className="text-vr-caption text-vrtext-muted">建议退回</p>
                        <p className="text-vr-body font-semibold text-vrsuccess mt-1">¥{(suggestedRefund / 100).toFixed(2)}</p>
                      </div>
                    </div>

                    {isNoShow && (
                      <div className="space-y-2 mb-4">
                        {[
                          { key: 'NO_REFUND' as const, title: '不退款', desc: '维持作废结果，仅记录处置原因。' },
                          { key: 'PARTIAL_REFUND' as const, title: '部分退款', desc: '扣除违约金后退还剩余金额，可手动调整。' },
                          { key: 'FULL_REFUND' as const, title: '全额退款', desc: '用于门店原因、设备故障或误操作等特殊情况。' },
                        ].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              setRefundAction(item.key)
                              if (item.key === 'NO_REFUND') setRefundAmountYuan('0.00')
                              if (item.key === 'PARTIAL_REFUND') setRefundAmountYuan((suggestedRefund / 100).toFixed(2))
                              if (item.key === 'FULL_REFUND') setRefundAmountYuan((amount / 100).toFixed(2))
                            }}
                            className={cn(
                              'w-full text-left rounded-xl border p-3 transition-colors',
                              refundAction === item.key
                                ? 'border-vraccent-primary bg-vraccent-primary/10'
                                : 'border-vrborder-subtle bg-vrbg-surface hover:border-vrborder-strong'
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-vr-body-sm font-semibold text-vrtext-primary">{item.title}</span>
                              <span className={cn(
                                'w-3 h-3 rounded-full border',
                                refundAction === item.key ? 'bg-vraccent-primary border-vraccent-primary' : 'border-vrtext-muted'
                              )} />
                            </div>
                            <p className="text-vr-caption text-vrtext-muted mt-1">{item.desc}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label className="text-vr-caption text-vrtext-secondary block mb-1">退款金额</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vrtext-muted text-vr-body-sm">¥</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={refundAmountYuan}
                            onChange={(e) => setRefundAmountYuan(e.target.value)}
                            disabled={refundAction === 'NO_REFUND' || refundAction === 'FULL_REFUND'}
                            className="w-full h-10 pl-8 pr-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary disabled:opacity-60"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-vr-caption text-vrtext-secondary block mb-1">处置原因</label>
                        <textarea
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          placeholder={isNoShow ? '例如：设备故障导致无法体验，同意退还部分费用' : '例如：用户取消，管理员确认退款'}
                          className="w-full min-h-24 px-3 py-2 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary resize-none"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-vrwarning/30 bg-vrwarning/10 p-3 text-vr-caption text-vrtext-secondary leading-5 mt-4">
                      {isNoShow
                        ? '提交后进入审批中心，管理员/财务/店长按权限通过后才会真正退款或记录不退款处置。'
                        : '提交后进入审批中心，通过后才会真正退款、关闭订单、释放关联排场，并按退款金额收回对应赠送积分。'}
                    </div>

                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={closeRefundDialog}
                        className="flex-1 h-10 rounded-lg text-vr-body-sm font-medium text-vrtext-secondary bg-vrbg-elevated hover:bg-vrborder-subtle transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          const reason = refundReason.trim()
                          if (!reason) {
                            alert('请填写处置原因')
                            return
                          }
                          const refundCents = refundAction === 'NO_REFUND'
                            ? 0
                            : refundAction === 'FULL_REFUND'
                              ? amount
                              : Math.round(Number(refundAmountYuan) * 100)
                          if (refundAction === 'PARTIAL_REFUND' && (!Number.isInteger(refundCents) || refundCents <= 0 || refundCents >= amount)) {
                            alert('部分退款金额必须大于0且小于订单实付金额')
                            return
                          }
                          refundMutation.mutate({
                            order: refundTarget,
                            action: isNoShow ? refundAction : 'FULL_REFUND',
                            amount: isNoShow ? refundCents : amount,
                            reason,
                          })
                        }}
                        disabled={refundMutation.isPending}
                        className="flex-1 h-10 rounded-lg text-vr-body-sm font-medium text-white bg-vrerror hover:bg-vrerror/90 transition-colors disabled:opacity-50"
                      >
                        {refundMutation.isPending ? '提交中...' : '提交审批'}
                      </button>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reschedule Modal */}
      <AnimatePresence>
        {rescheduleOpen && rescheduleTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setRescheduleOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-vrbg-card border border-vrborder-subtle rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-vr-h3 text-vrtext-primary font-semibold mb-1">预约改签</h3>
              <p className="text-vr-caption text-vrtext-muted mb-4">
                订单：{rescheduleTarget.orderNo}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-vr-caption text-vrtext-secondary block mb-1">新日期</label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                  />
                </div>
                <div>
                  <label className="text-vr-caption text-vrtext-secondary block mb-1">新开始时间</label>
                  <input
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setRescheduleOpen(false)}
                  className="flex-1 h-10 rounded-lg text-vr-body-sm font-medium text-vrtext-secondary bg-vrbg-elevated hover:bg-vrborder-subtle transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (!rescheduleDate || !rescheduleTime) {
                      alert('请选择新日期和时间')
                      return
                    }
                    if (!rescheduleTarget.bookingId) {
                      alert('订单未关联预约')
                      return
                    }
                    rescheduleMutation.mutate({
                      orderId: rescheduleTarget.bookingId,
                      date: rescheduleDate,
                      startTime: rescheduleTime,
                    })
                  }}
                  disabled={rescheduleMutation.isPending}
                  className="flex-1 h-10 rounded-lg text-vr-body-sm font-medium text-white bg-vraccent-primary hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
                >
                  {rescheduleMutation.isPending ? '处理中...' : '确认改签'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
