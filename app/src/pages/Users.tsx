import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import {
  Search,
  Plus,
  Users,
  User,
  Crown,
  Medal,
  Sparkles,
  Star,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Coins,
  Ticket,
  SlidersHorizontal,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { NumberFieldInput } from '@/components/ui/number-field'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { getUsers, createUser, updateUser, deleteUser, batchGiftPoints, batchGiftCoupon } from '@/api/users'
import type { User as ApiUser } from '@/api/users'
import { getSystemConfigs } from '@/api/systemConfig'
import {
  giftPoints,
  giftCoupon,
  getCouponGiftRecords,
  getMemberGiftApprovalPolicy,
  updateMemberGiftApprovalPolicy,
  type GiftCouponPayload,
  type GiftPointsPayload,
  type MemberGiftApprovalPolicy,
} from '@/api/gift'
import { getUserBalanceTransactions } from '@/api/finance'
import { getOrders, type Order } from '@/api/orders'
import { getVenues } from '@/api/venues'
import { getRechargeConfig, staffRecharge, type RechargeConfig } from '@/api/recharges'
import { buildMemberLevelsFromConfig } from '@/lib/memberLevels'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/authStore'

function useDynamicLevelTabs(levels: Array<{ key: string; name: string }>) {
  return [
    { key: 'all', label: '全部' },
    ...levels.map((l) => ({ key: l.name, label: l.name })),
  ]
}

const fallbackLevelMap: Record<string, string> = {
  NORMAL: '普通会员',
  MEMBER: '银卡会员',
  VIP: '金卡会员',
  VIP_PLUS: '钻石会员',
}

const fallbackReverseMap: Record<string, string> = {
  '普通会员': 'NORMAL',
  '银卡会员': 'MEMBER',
  '金卡会员': 'VIP',
  '钻石会员': 'VIP_PLUS',
}

const configKeyToEnum: Record<string, string> = {
  'VIP+': 'VIP_PLUS',
}

const userSearchOptions = [
  { value: 'all', label: '全部' },
  { value: 'uid', label: 'UID' },
  { value: 'phone', label: '手机号' },
  { value: 'name', label: '用户昵称' },
] as const

type UserSearchType = typeof userSearchOptions[number]['value']

const userSourceTabs = ['全部']

type ApiEnvelope = { data?: unknown; message?: string }
type GiftSubmitResult = { approvalRequired?: boolean; data?: { approvalRequired?: boolean } }
type CouponGiftRecord = {
  id: string
  source?: string | null
  name?: string | null
  type?: string | null
  createdAt: string
  giftRemark?: string | null
  giftReason?: string | null
}
type VenueOption = { id: string; name: string }

function showGiftSubmitResult(result: GiftSubmitResult, successMessage: string) {
  const approvalRequired = Boolean(result.approvalRequired || result.data?.approvalRequired)
  alert(approvalRequired ? '审批申请已提交，请等待管理员处理' : successMessage)
}

function getErrorMessage(err: unknown, fallback: string) {
  const maybe = err as { response?: { data?: ApiEnvelope }; message?: string }
  return maybe.response?.data?.message || maybe.message || fallback
}

function useMemberLevels() {
  const { data: systemConfigs } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: () => getSystemConfigs(),
    staleTime: 60000,
  })
  const levels = buildMemberLevelsFromConfig(systemConfigs, ['普通会员', '银卡会员', '金卡会员', '钻石会员'])

  const levelMap: Record<string, string> = {}
  const reverseMap: Record<string, string> = {}

  if (levels.length > 0) {
    for (const l of levels) {
      levelMap[l.key] = l.name
      reverseMap[l.name] = l.key
      // 兼容 Prisma enum 值（如 VIP_PLUS）
      const enumKey = configKeyToEnum[l.key]
      if (enumKey) {
        levelMap[enumKey] = l.name
      }
    }
  } else {
    Object.assign(levelMap, fallbackLevelMap)
    Object.assign(reverseMap, fallbackReverseMap)
  }

  return { levels, levelMap, reverseMap }
}

function LevelBadge({ level, levelsConfig }: { level: string; levelsConfig?: Array<{ key: string; name: string; discount: number }> }) {
  const displayName = levelsConfig?.find((l) => l.key === level || l.name === level)?.name || fallbackLevelMap[level] || level
  const idx = levelsConfig?.findIndex((l) => l.key === level || l.name === level) ?? -1

  const badgeConfigs = [
    { Icon: User, bg: 'bg-slate-500/15', text: 'text-slate-400', iconColor: 'text-slate-400' },
    { Icon: Medal, bg: 'bg-cyan-500/15', text: 'text-cyan-400', iconColor: 'text-cyan-400' },
    { Icon: Crown, bg: 'bg-amber-500/15', text: 'text-amber-400', iconColor: 'text-amber-400' },
    { Icon: Sparkles, bg: 'bg-purple-500/15', text: 'text-purple-400', iconColor: 'text-purple-400' },
    { Icon: Star, bg: 'bg-pink-500/15', text: 'text-pink-400', iconColor: 'text-pink-400' },
  ]
  const cfg = badgeConfigs[idx] || badgeConfigs[0]
  const IconComp = cfg.Icon

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-vr-caption font-medium whitespace-nowrap', cfg.bg, cfg.text)}>
      <IconComp className={cn('w-3 h-3 shrink-0', cfg.iconColor)} />
      {displayName}
    </span>
  )
}

function getInitials(name: string) {
  return name.charAt(0)
}

function getAvatarColor(name: string) {
  const colors = ['#3B82F6', '#06B6D4', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#F97316']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function formatDateTime(dateStr: string | null | Date) {
  if (!dateStr) return '-'
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm')
  } catch {
    return String(dateStr)
  }
}

function formatDate(dateStr: string | null | Date) {
  if (!dateStr) return '-'
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd')
  } catch {
    return String(dateStr)
  }
}

function maskPhone(phone?: string | null) {
  if (!phone) return '-'
  if (phone.length < 7) return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function getUserBalance(user: Pick<ApiUser, 'principalBalance' | 'bonusBalance' | 'balance'>) {
  return (user.principalBalance || 0) + (user.bonusBalance || 0) || user.balance || 0
}

function yuan(amount: number) {
  return (amount / 100).toFixed(2)
}

function signedYuan(amount: number) {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
  return `${sign}${yuan(Math.abs(amount))}`
}

function signedNumber(amount: number) {
  return amount > 0 ? `+${amount}` : String(amount)
}

const paymentMethodLabels: Record<string, string> = {
  BALANCE: '余额支付',
  BALANCE_POINTS: '余额+积分',
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  WXPAY: '微信支付',
  WEIXIN: '微信支付',
  WX: '微信支付',
  CASH: '现金',
  CARD: '刷卡',
  BANK_CARD: '银行卡',
  OFFLINE: '线下支付',
  FREE: '无需支付',
  NONE: '无需支付',
}

const orderStatusLabels: Record<string, string> = {
  PENDING: '待支付',
  READY_TO_VERIFY: '待核销',
  PAID: '已支付',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  REFUNDING: '退款中',
  REFUNDED: '已退款',
  NO_SHOW: '已作废',
}

const transactionTypeLabels: Record<string, string> = {
  RECHARGE: '会员充值',
  STAFF_RECHARGE: '员工充值',
  DEDUCT: '余额消费',
  BALANCE_DEDUCT: '余额消费',
  REFUND: '退款返还',
  BALANCE_REFUND: '余额退款',
  CANCEL_REFUND: '取消退款',
  CANCEL_RESTORE: '订单取消恢复余额',
  CANCEL_FEE: '取消手续费',
  RESCHEDULE_FEE: '改签费扣款',
  RESCHEDULE_SURCHARGE: '改签补差价',
  RESCHEDULE_REFUND: '改签退差价',
  GROUP_BUY: '团购购买',
  GROUP_BUY_REFUND: '团购退款',
  GROUP_BUY_REDEEM: '团购核销',
  NO_SHOW_RETAINED: '作废扣款',
  POINTS_EARN: '积分增加',
  POINTS_GIFT: '赠送积分',
  POINTS_REWARD: '奖励积分',
  POINTS_DEDUCT: '积分扣减',
  POINTS_REVOKE: '积分收回',
  POINTS_EXCHANGE: '积分兑换',
  ADJUSTMENT: '人工调整',
  FREEZE: '余额冻结',
  UNFREEZE: '余额解冻',
}

const feeTypeLabels: Record<string, string> = {
  RESCHEDULE_FEE: '改签费',
  CANCEL_FEE: '取消手续费',
  NO_SHOW_FEE: '作废扣款',
}

const couponTypeLabels: Record<string, string> = {
  EXPERIENCE_FREE: '体验券',
  DISCOUNT: '折扣券',
}

const giftReasonLabels: Record<string, string> = {
  COMPLAINT: '客诉补偿',
  EQUIPMENT_FAILURE: '设备故障',
  ENTERTAIN_CLIENT: '招待客户',
  OTHER: '其他',
}

function labelFromMap(map: Record<string, string>, value?: string | null, fallback = '-') {
  if (!value) return fallback
  const normalized = value.toUpperCase()
  return map[normalized] || map[value] || value
}

function getOrderTypeLabel(order: Order) {
  if (order.orderKind === 'FEE') return labelFromMap(feeTypeLabels, order.feeType, '费用订单')
  if (order.groupBuyPackageId || order.groupBuyPackage || order.orderNo?.startsWith('VRG')) return '团购'
  if (order.orderNo?.startsWith('VRS')) return '改签费'
  return '预约'
}

function getOrderContentLabel(order: Order) {
  const type = getOrderTypeLabel(order)
  if (type === '团购') {
    const title = order.groupBuyPackage?.title || order.groupBuyPackage?.label || order.booking?.game?.title || '团购套餐'
    const game = order.groupBuyPackage?.game?.title
    return game && !title.includes(game) ? `团购 - ${title}（${game}）` : `团购 - ${title}`
  }
  if (type === '改签费' || order.orderKind === 'FEE') {
    const parentGame = order.parentOrder?.booking?.game?.title
    const reason = order.feeReason || parentGame || order.booking?.game?.title || '预约改签'
    return `${labelFromMap(feeTypeLabels, order.feeType, '改签费')} - ${reason}`
  }
  const venue = order.venueName || '场地'
  const game = order.booking?.game?.title
  return game ? `${venue} - ${game}` : venue
}

function getOrderPayMethodLabel(order: Order) {
  if (order.payMethod) return labelFromMap(paymentMethodLabels, order.payMethod)
  if ((order.amount || 0) === 0) return '无需支付'
  if (order.status === 'PENDING') return '未支付'
  if (order.status === 'CANCELLED') return '已取消未支付'
  return '未记录'
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="flex items-center gap-3 text-[16px] font-medium text-vrtext-primary">
      <span className="h-5 w-1 rounded-full bg-vraccent-primary" />
      {children}
    </h4>
  )
}

function UserDetailSheet({
  user,
  open,
  onOpenChange,
  onEdit,
  onGiftPoints,
  onGiftCoupon,
  isUpdating,
  levelsConfig,
  canEditUser,
  canViewGiftRecords,
  canViewRechargeRecords,
}: {
  user: ApiUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onEdit: () => void
  onGiftPoints: () => void
  onGiftCoupon: () => void
  isUpdating: boolean
  levelsConfig?: Array<{ key: string; name: string; discount: number }>
  canEditUser: boolean
  canViewGiftRecords: boolean
  canViewRechargeRecords: boolean
}) {
  const [activeTab, setActiveTab] = useState('用户信息')
  const userId = user?.id ?? ''
  const userPhone = user?.phone ?? ''

  const { data: couponRecords } = useQuery<{ data?: { data?: CouponGiftRecord[] } }>({
    queryKey: ['gift-coupon-records', userId],
    queryFn: () => getCouponGiftRecords({ userId, pageSize: 20 }),
    enabled: open && !!userId && activeTab === '持有优惠券' && canViewGiftRecords,
  })

  const { data: balanceTransactions = [] } = useQuery({
    queryKey: ['user-balance-transactions', userId],
    queryFn: () => getUserBalanceTransactions(userId),
    enabled: open && !!userId && (activeTab === '积分明细' || activeTab === '余额变动') && canViewRechargeRecords,
  })

  const { data: ordersResponse } = useQuery({
    queryKey: ['user-consumption-orders', userId, userPhone],
    queryFn: () => getOrders({ userId, pageSize: 100 }),
    enabled: open && !!userId,
  })

  if (!user) return null

  const avatarColor = getAvatarColor(user.name)
  const shortId = user.id.length > 12 ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : user.id
  const currentLevelInfo = levelsConfig?.find((l) => l.name === user.level || l.key === user.level)
  const balance = getUserBalance(user)
  const userInfoTabs = ['用户信息', '消费记录', '积分明细', '持有优惠券', '余额变动']
  const orderList: Order[] = Array.isArray(ordersResponse?.data)
    ? ordersResponse.data
    : Array.isArray(ordersResponse?.data?.list)
      ? ordersResponse.data.list
      : Array.isArray(ordersResponse?.data?.data)
        ? ordersResponse.data.data
        : []
  const userOrders = orderList.filter((order) => {
    const orderPhone = order.user?.phone || order.booking?.personPhone
    return order.userId === user.id || orderPhone === user.phone
  })
  const paidOrders = userOrders.filter((order) => !['CANCELLED', 'REFUNDED'].includes(order.status))
  const now = new Date()
  const currentMonth = format(now, 'yyyy-MM')
  const monthOrders = paidOrders.filter((order) => format(new Date(order.paidAt || order.bookingTime || order.createdAt), 'yyyy-MM') === currentMonth)
  const totalOrderCount = paidOrders.length || user.totalVisits || 0
  const totalConsumption = paidOrders.length > 0
    ? paidOrders.reduce((sum, order) => sum + (order.amount || 0) - (order.refundAmount || 0), 0)
    : user.totalSpent || 0
  const monthConsumption = monthOrders.reduce((sum, order) => sum + (order.amount || 0) - (order.refundAmount || 0), 0)
  const pointRows = balanceTransactions
    .filter((record) => record.pointsAmount)
    .map((record, index, records) => {
      const newerDelta = records.slice(0, index).reduce((sum, item) => sum + (item.pointsAmount || 0), 0)
      return {
        ...record,
        afterPoints: (user.points || 0) - newerDelta,
      }
    })
  const balanceRows = balanceTransactions
    .filter((record) => (record.totalAmount ?? record.amount ?? 0) !== 0)
    .map((record, index, records) => {
      const newerDelta = records.slice(0, index).reduce((sum, item) => sum + (item.totalAmount ?? item.amount ?? 0), 0)
      return {
        ...record,
        balanceDelta: record.totalAmount ?? record.amount ?? 0,
        afterBalance: balance - newerDelta,
      }
    })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(1120px,calc(100vw-72px))] bg-white border-l border-slate-200 p-0 sm:max-w-none">
        <SheetHeader className="h-14 px-6 border-b border-slate-200 flex-row items-center justify-between">
          <SheetTitle className="text-[16px] text-slate-900 font-medium">用户详情</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-white">
          <div className="px-8 py-6 flex items-center gap-10 border-b border-slate-100">
            <div className="flex items-center gap-5 min-w-[330px]">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {getInitials(user.name)}
              </div>
              <div>
                <h3 className="text-[18px] text-slate-950 font-semibold">{maskPhone(user.phone)}</h3>
                <p className="text-[14px] text-slate-600 mt-2">余额：{yuan(balance)}</p>
                <p className="text-[14px] text-slate-600 mt-1">积分：{user.points || 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-20 gap-y-2 text-[14px] text-slate-600 flex-1">
              <span>总计订单：{totalOrderCount}</span>
              <span>总消费金额：{yuan(totalConsumption)}</span>
              <span>本月订单：{monthOrders.length}</span>
              <span>本月消费金额：{yuan(monthConsumption)}</span>
            </div>
            <div className="flex items-center gap-2">
              {canViewGiftRecords && (
                <>
                  <button
                    onClick={onGiftPoints}
                    disabled={isUpdating}
                    className="h-10 px-4 rounded-md border border-slate-200 bg-white text-slate-700 text-[14px] font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    赠送积分
                  </button>
                  <button
                    onClick={onGiftCoupon}
                    disabled={isUpdating}
                    className="h-10 px-4 rounded-md border border-slate-200 bg-white text-slate-700 text-[14px] font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    赠送优惠券
                  </button>
                </>
              )}
              {canEditUser && (
                <button
                  onClick={onEdit}
                  disabled={isUpdating}
                  className="h-10 px-6 rounded-md bg-vraccent-primary text-white text-[14px] font-medium hover:bg-vraccent-primary/90 disabled:opacity-50"
                >
                  编辑
                </button>
              )}
            </div>
          </div>

          <div className="flex bg-slate-50 border-b border-slate-100">
            {userInfoTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'h-12 px-7 text-[14px] transition-colors border-t-2',
                  activeTab === tab
                    ? 'bg-white border-vraccent-primary text-vraccent-primary'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="px-10 py-7 space-y-8">

          {activeTab === '用户信息' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="space-y-8 text-[14px] text-slate-600"
            >
              <section className="space-y-5 border-b border-dashed border-slate-200 pb-8">
                <SectionTitle>基本信息</SectionTitle>
                <div className="grid grid-cols-3 gap-x-14 gap-y-5">
                  <span>用户ID：<span className="font-mono">{shortId}</span></span>
                  <span>手机号：{user.phone || '-'}</span>
                  <span>生日：{user.birthday ? formatDate(user.birthday) : '-'}</span>
                  <span>用户地址：-</span>
                </div>
              </section>

              <section className="space-y-5 border-b border-dashed border-slate-200 pb-8">
                <SectionTitle>密码</SectionTitle>
                <div>登录密码：********</div>
              </section>

              <section className="space-y-5 border-b border-dashed border-slate-200 pb-8">
                <SectionTitle>用户概况</SectionTitle>
                <div className="grid grid-cols-3 gap-x-14 gap-y-5">
                  <span>用户状态：{user.status === 'ACTIVE' ? '开启' : '锁定'}</span>
                  <span>用户等级：{currentLevelInfo?.name || user.level || '-'}</span>
                  <span>注册时间：{formatDateTime(user.registerDate)}</span>
                  <span>登录时间：{formatDateTime(user.lastLogin)}</span>
                </div>
              </section>

              <section className="space-y-5 border-b border-dashed border-slate-200 pb-8">
                <SectionTitle>用户备注</SectionTitle>
                <div>备注：-</div>
              </section>
            </motion.div>
          )}

          {activeTab !== '用户信息' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className={cn(
              'grid gap-4 text-[14px]',
              canViewGiftRecords && canViewRechargeRecords ? 'grid-cols-2' : 'grid-cols-1'
            )}
          >
            {activeTab === '积分明细' && canViewGiftRecords && (
              <div className="col-span-full rounded-md border border-slate-200 overflow-hidden">
                {pointRows.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">暂无积分明细</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-[#e8f1ff] text-slate-600">
                      <tr>
                        <th className="px-8 py-4 font-medium">来源/用途</th>
                        <th className="px-8 py-4 font-medium">积分变化</th>
                        <th className="px-8 py-4 font-medium">变化后积分</th>
                        <th className="px-8 py-4 font-medium">日期</th>
                        <th className="px-8 py-4 font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pointRows.map((record) => (
                        <tr key={record.id} className="border-t border-slate-100">
                          <td className="px-8 py-4 text-slate-700">{labelFromMap(transactionTypeLabels, record.type)}</td>
                          <td className={cn('px-8 py-4', (record.pointsAmount || 0) >= 0 ? 'text-red-500' : 'text-emerald-600')}>
                            {signedNumber(record.pointsAmount || 0)}
                          </td>
                          <td className="px-8 py-4 text-slate-700">{record.afterPoints}</td>
                          <td className="px-8 py-4 text-slate-700">{formatDateTime(record.createdAt)}</td>
                          <td className="px-8 py-4 text-slate-700">{record.remark || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === '持有优惠券' && canViewGiftRecords && <div className="col-span-full">
              <div className="w-full rounded-md border border-slate-200 overflow-hidden">
                {(couponRecords?.data?.data || []).length === 0 ? (
                  <div className="py-16 text-center text-slate-400">暂无优惠券记录</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-[#e8f1ff] text-slate-600">
                      <tr>
                        <th className="px-8 py-4 font-medium w-[18%]">来源/用途</th>
                        <th className="px-8 py-4 font-medium w-[26%]">优惠券名称</th>
                        <th className="px-8 py-4 font-medium w-[16%]">券类型</th>
                        <th className="px-8 py-4 font-medium w-[20%]">日期</th>
                        <th className="px-8 py-4 font-medium w-[20%]">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(couponRecords?.data?.data || []).map((record) => (
                        <tr key={record.id} className="border-t border-slate-100">
                          <td className="px-8 py-5 text-slate-700">
                            {record.source === 'CAMPAIGN' ? '活动发放' : '优惠券赠送'}
                          </td>
                          <td className="px-8 py-5 text-slate-700">{record.name || '-'}</td>
                          <td className="px-8 py-5 text-slate-700">{labelFromMap(couponTypeLabels, record.type)}</td>
                          <td className="px-8 py-5 text-slate-700 whitespace-nowrap">{formatDateTime(record.createdAt)}</td>
                          <td className="px-8 py-5 text-slate-700">
                            {record.giftRemark || labelFromMap(giftReasonLabels, record.giftReason, '备注')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>}

            {activeTab === '余额变动' && canViewRechargeRecords && (
              <div className="col-span-full rounded-md border border-slate-200 overflow-hidden">
                {balanceRows.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">暂无余额变动</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-[#e8f1ff] text-slate-600">
                      <tr>
                        <th className="px-8 py-4 font-medium">动作</th>
                        <th className="px-8 py-4 font-medium">余额变动</th>
                        <th className="px-8 py-4 font-medium">当前余额</th>
                        <th className="px-8 py-4 font-medium">创建时间</th>
                        <th className="px-8 py-4 font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balanceRows.map((record) => (
                        <tr key={record.id} className="border-t border-slate-100">
                          <td className="px-8 py-4 text-slate-700">{labelFromMap(transactionTypeLabels, record.type)}</td>
                          <td className={cn('px-8 py-4', record.balanceDelta >= 0 ? 'text-red-500' : 'text-emerald-600')}>
                            {signedYuan(record.balanceDelta)}
                          </td>
                          <td className="px-8 py-4 text-slate-700">{yuan(record.afterBalance)}</td>
                          <td className="px-8 py-4 text-slate-700">{formatDateTime(record.createdAt)}</td>
                          <td className="px-8 py-4 text-slate-700">{record.remark || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {activeTab === '消费记录' && (
              <div className="col-span-full rounded-xl border border-slate-200 overflow-hidden">
                {userOrders.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">暂无消费记录</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">订单号</th>
                        <th className="px-4 py-3 font-medium">类型</th>
                        <th className="px-4 py-3 font-medium">场地/内容</th>
                        <th className="px-4 py-3 font-medium">消费金额</th>
                        <th className="px-4 py-3 font-medium">支付方式</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">消费时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userOrders.map((order) => (
                        <tr key={order.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-mono text-slate-600">{order.orderNo}</td>
                          <td className="px-4 py-3 text-slate-600">{getOrderTypeLabel(order)}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {getOrderContentLabel(order)}
                          </td>
                          <td className="px-4 py-3 text-slate-900">{yuan((order.amount || 0) - (order.refundAmount || 0))}</td>
                          <td className="px-4 py-3 text-slate-600">{getOrderPayMethodLabel(order)}</td>
                          <td className="px-4 py-3 text-slate-600">{labelFromMap(orderStatusLabels, order.status)}</td>
                          <td className="px-4 py-3 text-slate-500">{formatDateTime(order.paidAt || order.bookingTime || order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </motion.div>
          )}

          {/* Membership Upgrade */}
          {/* 会员等级已改为由充值系统自动计算，禁止手动修改 */}
        </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}

function UserEditSheet({
  user,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  levelsConfig,
}: {
  user: ApiUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (data: Partial<ApiUser>) => void
  isPending: boolean
  levelsConfig?: Array<{ key: string; name: string; discount: number }>
}) {
  const [form, setForm] = useState<Partial<ApiUser>>({})
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')

  // Sync form when user changes
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        name: user.name,
        phone: user.phone,
        email: user.email || '',
        birthday: user.birthday ? user.birthday.slice(0, 10) : '',
        level: user.level,
        status: user.status,
        userGroup: user.userGroup || '',
        address: user.address || '',
        idCard: user.idCard || '',
        password: '',
      })
      setConfirmPassword('')
      setFormError('')
    }
  }, [user, user?.id])

  if (!user) return null

  const handleSubmit = () => {
    if (form.password && form.password !== confirmPassword) {
      setFormError('两次输入的密码不一致')
      return
    }
    setFormError('')
    onSubmit({
      name: form.name,
      phone: form.phone,
      email: form.email,
      birthday: form.birthday || null,
      status: form.status,
      password: form.password || undefined,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(1120px,calc(100vw-72px))] bg-white border-l border-slate-200 p-0 sm:max-w-none flex flex-col">
        <SheetHeader className="h-14 px-6 border-b border-slate-200 shrink-0 flex-row items-center justify-between">
          <SheetTitle className="text-[16px] text-slate-900 font-medium">用户详情</SheetTitle>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-9 px-5 rounded-md border border-slate-200 text-slate-600 text-[14px] hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="h-9 px-5 rounded-md bg-vraccent-primary text-white text-[14px] hover:bg-vraccent-primary/90 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 bg-white">
          <div className="px-8 py-6 flex items-center gap-10 border-b border-slate-100">
            <div className="flex items-center gap-5 min-w-[330px]">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold shrink-0"
                style={{ backgroundColor: getAvatarColor(user.name) }}
              >
                {getInitials(user.name)}
              </div>
              <div>
                <h3 className="text-[18px] text-slate-950 font-semibold">{maskPhone(user.phone)}</h3>
                <p className="text-[14px] text-slate-600 mt-2">余额：{yuan(getUserBalance(user))}</p>
                <p className="text-[14px] text-slate-600 mt-1">积分：{user.points || 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-20 gap-y-2 text-[14px] text-slate-600 flex-1">
              <span>总计订单：{user.totalVisits || 0}</span>
              <span>总消费金额：{yuan(user.totalSpent || 0)}</span>
              <span>本月订单：0</span>
              <span>本月消费金额：0.00</span>
            </div>
          </div>

          <div className="flex bg-slate-50 border-b border-slate-100">
            {['用户信息', '消费记录', '积分明细', '持有优惠券', '余额变动'].map((tab, index) => (
              <button
                key={tab}
                className={cn(
                  'h-12 px-7 text-[14px] transition-colors border-t-2',
                  index === 0 ? 'bg-white border-vraccent-primary text-vraccent-primary' : 'border-transparent text-slate-600'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="px-10 py-7 space-y-8 text-[14px] text-slate-700">
            {formError && <div className="rounded-md border border-vrerror/20 bg-vrerror/10 px-4 py-3 text-vrerror">{formError}</div>}

            <section className="space-y-5 border-b border-dashed border-slate-200 pb-8">
              <SectionTitle>基本信息</SectionTitle>
              <div className="grid grid-cols-2 gap-x-24 gap-y-5">
                <label className="flex items-center gap-4">
                  <span className="w-24 text-right">用户ID:</span>
                  <input disabled value={user.id} className="h-10 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 text-slate-400" />
                </label>
                <label className="flex items-center gap-4">
                  <span className="w-24 text-right"><span className="text-vrerror">*</span> 手机号码:</span>
                  <input value={form.phone || ''} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="h-10 flex-1 rounded-md border border-slate-200 px-3 focus:outline-none focus:border-vraccent-primary" />
                </label>
                <label className="flex items-center gap-4">
                  <span className="w-24 text-right">生日:</span>
                  <input type="date" value={form.birthday || ''} onChange={(e) => setForm((p) => ({ ...p, birthday: e.target.value }))} className="h-10 flex-1 rounded-md border border-slate-200 px-3 focus:outline-none focus:border-vraccent-primary" />
                </label>
                <label className="flex items-center gap-4">
                  <span className="w-24 text-right">用户地址:</span>
                  <input value={form.address || ''} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="请输入用户地址" className="h-10 flex-1 rounded-md border border-slate-200 px-3 focus:outline-none focus:border-vraccent-primary" />
                </label>
              </div>
            </section>

            <section className="space-y-5">
              <SectionTitle>用户概况</SectionTitle>
              <div className="grid grid-cols-2 gap-x-24 gap-y-5">
                <label className="flex items-center gap-4">
                  <span className="w-24 text-right">用户等级:</span>
                  <div className="h-10 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 flex items-center text-slate-500">
                    {levelsConfig?.find((level) => level.key === user.level || level.name === user.level)?.name || user.level || '-'}
                    <span className="ml-3 text-xs text-slate-400">由累计充值金额自动计算</span>
                  </div>
                </label>
                <div className="flex items-center gap-4">
                  <span className="w-24 text-right">用户状态:</span>
                  <label className="flex items-center gap-2"><input type="radio" checked={form.status !== 'INACTIVE'} onChange={() => setForm((p) => ({ ...p, status: 'ACTIVE' }))} />开启</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={form.status === 'INACTIVE'} onChange={() => setForm((p) => ({ ...p, status: 'INACTIVE' }))} />锁定</label>
                </div>
              </div>
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DeleteConfirmDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  user: ApiUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-vrtext-primary">确认删除</AlertDialogTitle>
          <AlertDialogDescription className="text-vrtext-secondary">
            确定要删除用户 <span className="text-vrtext-primary font-medium">{user?.name}</span> 吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary">
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isPending}
            className="bg-vrerror text-white hover:bg-vrerror/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function MemberRechargeSheet({
  user,
  open,
  onOpenChange,
}: {
  user: ApiUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [venueId, setVenueId] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'CARD'>('CASH')
  const [remark, setRemark] = useState('')
  const [rechargeError, setRechargeError] = useState('')

  const { data: configs = [] } = useQuery({
    queryKey: ['rechargeConfig'],
    queryFn: getRechargeConfig,
    enabled: open,
  })

  const { data: venueData } = useQuery({
    queryKey: ['venues', 'recharge-options'],
    queryFn: () => getVenues({ pageSize: 100 }),
    enabled: open,
  })

  const venues: VenueOption[] = useMemo(() => venueData?.data || [], [venueData?.data])
  const selectedConfig = configs.find((cfg: RechargeConfig) => String(cfg.amount) === amount)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRechargeError('')
    setPayMethod('CASH')
    setRemark('')
  }, [open, user?.id])

  useEffect(() => {
    if (!open) return
    if (!amount && configs.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(String(configs[0].amount))
    }
    if (!venueId && venues.length > 0) {
      setVenueId(venues[0].id)
    }
  }, [open, amount, configs, venueId, venues])

  const rechargeMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('会员不能为空')
      if (!amount) throw new Error('请选择充值档位')
      if (!venueId) throw new Error('请选择归属门店')
      return staffRecharge({
        userId: user.id,
        amount: Number(amount),
        venueId,
        payMethod,
        remark: remark.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['user-recharge-records', user.id] })
      }
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      setRechargeError(getErrorMessage(err, '充值失败'))
    },
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[420px]">
        <SheetHeader className="p-6 border-b border-vrborder-subtle">
          <SheetTitle className="text-vr-h3 text-vrtext-primary">会员储值入账</SheetTitle>
        </SheetHeader>

        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-vrbg-elevated border border-vrborder-subtle p-4">
            <p className="text-vr-caption text-vrtext-muted">充值会员</p>
            <p className="text-vr-body text-vrtext-primary font-medium mt-1">{user?.name || '-'}</p>
            <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{user?.phone || '-'}</p>
          </div>

          {rechargeError && (
            <div className="p-3 rounded-lg bg-vrerror/10 border border-vrerror/20 text-vr-body-sm text-vrerror">
              {rechargeError}
            </div>
          )}

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">充值档位</label>
            <select
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
            >
              <option value="">请选择充值档位</option>
              {configs.map((cfg: RechargeConfig) => (
                <option key={cfg.amount} value={cfg.amount}>
                  充 ¥{(cfg.amount / 100).toFixed(2)}，赠 ¥{(cfg.bonus / 100).toFixed(2)}，到账 ¥{(cfg.total / 100).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">归属门店</label>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
            >
              <option value="">请选择归属门店</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">收款方式</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'CASH' as const, label: '现金收款' },
                { key: 'CARD' as const, label: '刷卡收款' },
              ].map((method) => (
                <button
                  key={method.key}
                  type="button"
                  onClick={() => setPayMethod(method.key)}
                  className={cn(
                    'h-10 rounded-lg border text-vr-body-sm font-medium transition-colors',
                    payMethod === method.key
                      ? 'border-vraccent-primary bg-vraccent-primary/10 text-vraccent-primary'
                      : 'border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated',
                  )}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {selectedConfig && (
            <div className="rounded-xl border border-vrsuccess/25 bg-vrsuccess/10 p-4 space-y-1">
              <div className="flex justify-between text-vr-body-sm">
                <span className="text-vrtext-secondary">实收本金</span>
                <span className="text-vrtext-primary">¥{(selectedConfig.amount / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-vr-body-sm">
                <span className="text-vrtext-secondary">赠送金额</span>
                <span className="text-vrsuccess">+¥{(selectedConfig.bonus / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-vr-body font-semibold pt-1">
                <span className="text-vrtext-primary">入账合计</span>
                <span className="text-vraccent-primary">¥{(selectedConfig.total / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="例如：门店 POS 小票号、收款说明"
              rows={3}
              className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary resize-none"
            />
          </div>

          <div className="rounded-lg bg-vrwarning/10 border border-vrwarning/25 px-3 py-2 text-vr-caption text-vrwarning">
            请确认门店已实际收到现金或刷卡款项后再入账。
          </div>
        </div>

        <div className="p-6 border-t border-vrborder-subtle flex gap-3">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => rechargeMutation.mutate()}
            disabled={rechargeMutation.isPending || !user || !amount || !venueId}
            className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {rechargeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            确认入账
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const canEditUsers = hasPermission(currentUser, 'user:edit')
  const canGiftUsers = hasPermission(currentUser, 'user:gift')
  const canManageGiftApprovalPolicy = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN'
  const canViewRechargeRecords = hasPermission(currentUser, 'finance:read')
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<UserSearchType>('all')
  const [sourceTab, setSourceTab] = useState('全部')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<ApiUser | null>(null)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    password: '',
    email: '',
    birthday: '',
    level: 'NORMAL',
    status: 'ACTIVE',
  })
  const [createError, setCreateError] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [rechargeSheetOpen, setRechargeSheetOpen] = useState(false)
  const [rechargingUser, setRechargingUser] = useState<ApiUser | null>(null)

  /* ─── Gift states ─── */
  const [giftPointsOpen, setGiftPointsOpen] = useState(false)
  const [giftCouponOpen, setGiftCouponOpen] = useState(false)
  const [giftingUser, setGiftingUser] = useState<ApiUser | null>(null)
  const [giftPointsForm, setGiftPointsForm] = useState({ points: '', reason: 'COMPLAINT', remark: '' })
  const [giftCouponForm, setGiftCouponForm] = useState({
    name: '', type: 'EXPERIENCE_FREE' as 'EXPERIENCE_FREE' | 'DISCOUNT',
    discountRate: '', validityDays: '30', reason: 'COMPLAINT', remark: '',
  })
  const [giftError, setGiftError] = useState('')
  const [giftLoading, setGiftLoading] = useState(false)

  /* ─── Batch states ─── */
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchPointsOpen, setBatchPointsOpen] = useState(false)
  const [batchCouponOpen, setBatchCouponOpen] = useState(false)
  const [batchPointsForm, setBatchPointsForm] = useState({ points: '', remark: '' })
  const [batchCouponForm, setBatchCouponForm] = useState({
    name: '', type: 'EXPERIENCE_FREE' as 'EXPERIENCE_FREE' | 'DISCOUNT',
    discountRate: '', validDays: '30', reason: '', remark: '',
  })
  const [batchGiftError, setBatchGiftError] = useState('')
  const [giftPolicyOpen, setGiftPolicyOpen] = useState(false)
  const [giftPolicyForm, setGiftPolicyForm] = useState<MemberGiftApprovalPolicy>({
    enabled: true,
    requirePointsGiftApproval: true,
    requireCouponGiftApproval: true,
    forceExperienceCouponApproval: true,
    pointsThreshold: 500,
    batchSizeThreshold: 2,
  })
  const [giftPolicyError, setGiftPolicyError] = useState('')

  const { levels: memberLevels, levelMap, reverseMap } = useMemberLevels()
  const levelTabs = useDynamicLevelTabs(memberLevels)
  const levelParam = activeTab === 'all' ? undefined : reverseMap[activeTab]

  const { data: userData } = useQuery({
    queryKey: ['users', levelParam, searchType, searchQuery, currentPage, pageSize],
    queryFn: () => getUsers({
      level: levelParam,
      search: searchQuery || undefined,
      searchType,
      page: currentPage,
      pageSize,
    }),
  })

  const { data: giftPolicy } = useQuery({
    queryKey: ['member-gift-approval-policy'],
    queryFn: getMemberGiftApprovalPolicy,
    enabled: canManageGiftApprovalPolicy,
  })

  useEffect(() => {
    if (giftPolicy) setGiftPolicyForm(giftPolicy)
  }, [giftPolicy])

  const updateGiftPolicyMutation = useMutation({
    mutationFn: updateMemberGiftApprovalPolicy,
    onSuccess: (data) => {
      setGiftPolicyForm(data)
      setGiftPolicyError('')
      setGiftPolicyOpen(false)
      queryClient.invalidateQueries({ queryKey: ['member-gift-approval-policy'] })
    },
    onError: (err: unknown) => {
      setGiftPolicyError(getErrorMessage(err, '保存失败'))
    },
  })

  const users: ApiUser[] = useMemo(() => userData?.data || [], [userData?.data])
  const totalUsers = userData?.meta?.total || 0

  const filteredUsers = useMemo(() => {
    return users.map((u) => ({ ...u, level: levelMap[u.level] || u.level }))
  }, [users, levelMap])

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ApiUser> }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const batchGiftPointsMutation = useMutation({
    mutationFn: ({ userIds, points, remark }: { userIds: string[]; points: number; remark?: string }) =>
      batchGiftPoints(userIds, points, '批量赠送积分', remark),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelectedIds([])
      setBatchPointsOpen(false)
      setBatchPointsForm({ points: '', remark: '' })
      setBatchGiftError('')
      showGiftSubmitResult(result, '批量积分赠送成功')
    },
  })

  const batchGiftCouponMutation = useMutation({
    mutationFn: ({ userIds, data }: { userIds: string[]; data: Parameters<typeof batchGiftCoupon>[1] }) =>
      batchGiftCoupon(userIds, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelectedIds([])
      setBatchCouponOpen(false)
      setBatchCouponForm({ name: '', type: 'EXPERIENCE_FREE', discountRate: '', validDays: '30', reason: '', remark: '' })
      setBatchGiftError('')
      showGiftSubmitResult(result, '批量优惠券赠送成功')
    },
  })
  const batchGiftLoading = batchGiftPointsMutation.isPending || batchGiftCouponMutation.isPending

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds([])
  }, [activeTab, sourceTab, searchType, searchQuery, currentPage, pageSize])

  const handleOpenDetail = (user: ApiUser) => {
    setSelectedUser(user)
    setDrawerOpen(true)
  }

  const handleOpenRecharge = (user: ApiUser) => {
    setRechargingUser(user)
    setRechargeSheetOpen(true)
  }

  const handleOpenGiftPoints = (user: ApiUser) => {
    setGiftingUser(user)
    setGiftPointsForm({ points: '', reason: 'COMPLAINT', remark: '' })
    setGiftError('')
    setGiftPointsOpen(true)
  }

  const handleOpenGiftCoupon = (user: ApiUser) => {
    setGiftingUser(user)
    setGiftCouponForm({ name: '', type: 'EXPERIENCE_FREE', discountRate: '', validityDays: '30', reason: 'COMPLAINT', remark: '' })
    setGiftError('')
    setGiftCouponOpen(true)
  }

  const handleExportUsers = () => {
    if (filteredUsers.length === 0) {
      window.alert('暂无可导出的用户数据')
      return
    }

    const rows = filteredUsers.map((user) => ({
      用户ID: user.id,
      姓名: user.name || '',
      手机号: user.phone,
      付费会员: getUserBalance(user) > 0 ? '是' : '否',
      用户等级: levelMap[user.level] || user.level,
      积分: user.points || 0,
      余额: yuan(getUserBalance(user)),
      注册时间: formatDateTime(user.registerDate),
      最近登录: formatDateTime(user.lastLogin),
      状态: user.status === 'ACTIVE' ? '开启' : '锁定',
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '会员列表')
    XLSX.writeFile(workbook, `会员列表_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
  }

  const handleEditSubmit = (data: Partial<ApiUser>) => {
    if (!editingUser) return
    updateMutation.mutate(
      { id: editingUser.id, data },
      {
        onSuccess: () => {
          setEditSheetOpen(false)
          setEditingUser(null)
        },
      }
    )
  }

  const handleDeleteConfirm = () => {
    if (!deletingUser) return
    deleteMutation.mutate(deletingUser.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false)
        setDeletingUser(null)
      },
    })
  }

  return (
    <Layout breadcrumb={['会员管理']}>
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
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">会员管理</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">用户信息、会员等级、权限管理</p>
          </motion.div>

        </div>

        {/* Search Filters */}
        <div className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex items-center gap-2"
            >
              <span className="text-vr-body-sm text-vrtext-secondary whitespace-nowrap">用户搜索:</span>
              <div className="flex h-9 overflow-hidden rounded-lg border border-vrborder-subtle bg-vrbg-surface focus-within:border-vraccent-primary focus-within:ring-1 focus-within:ring-vraccent-primary/15 transition-all">
                <select
                  value={searchType}
                  onChange={(e) => {
                    setSearchType(e.target.value as UserSearchType)
                    setCurrentPage(1)
                  }}
                  className="w-[108px] border-r border-vrborder-subtle bg-transparent px-3 text-vr-body-sm text-vrtext-primary focus:outline-none"
                >
                  {userSearchOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
                  <input
                    type="text"
                    placeholder="请输入用户"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                    className="w-[220px] h-full pl-9 pr-4 bg-transparent text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none"
                  />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.12 }}
              className="flex items-center gap-2"
            >
              <span className="text-vr-body-sm text-vrtext-secondary whitespace-nowrap">用户等级:</span>
              <select
                value={activeTab}
                onChange={(e) => { setActiveTab(e.target.value); setCurrentPage(1) }}
                className="w-[180px] h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                {levelTabs.map((tab) => (
                  <option key={tab.key} value={tab.key}>{tab.label}</option>
                ))}
              </select>
            </motion.div>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setCurrentPage(1)}
                className="h-9 px-5 bg-vraccent-primary text-white rounded-lg text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors"
              >
                查询
              </button>
              <button
                onClick={() => {
                  setSearchType('all')
                  setSearchQuery('')
                  setActiveTab('all')
                  setSourceTab('全部')
                  setCurrentPage(1)
                }}
                className="h-9 px-5 bg-vrbg-surface border border-vrborder-subtle text-vrtext-secondary rounded-lg text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                重置
              </button>
            </div>
          </div>
        </div>

        {/* User List Panel */}
        <div className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden">
          <div className="flex items-center justify-between border-b border-vrborder-subtle px-5">
            <div className="flex gap-8">
            {userSourceTabs.map((tab, idx) => (
              <motion.button
                key={tab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                onClick={() => { setSourceTab(tab); setCurrentPage(1) }}
                className={cn(
                  'relative py-3 text-vr-body-sm font-medium transition-colors',
                  sourceTab === tab ? 'text-vraccent-primary' : 'text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                {tab}
                {sourceTab === tab && (
                  <motion.div
                    layoutId="user-active-tab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-vraccent-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            ))}
            </div>
            <span className="text-vr-caption text-vrtext-tertiary">
              {totalUsers} 位用户
            </span>
          </div>

          <div className="flex items-center gap-3 px-5 py-4">
            {canEditUsers && (
              <button
                onClick={() => {
                  setCreateForm({ name: '', phone: '', password: '', email: '', birthday: '', level: 'NORMAL', status: 'ACTIVE' })
                  setCreateError('')
                  setCreateSheetOpen(true)
                }}
                className="h-9 px-4 bg-vraccent-primary text-white rounded-lg text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                添加用户
              </button>
            )}
            <button
              onClick={handleExportUsers}
              className="h-9 px-4 bg-vrbg-surface border border-vrborder-subtle text-vrtext-secondary rounded-lg text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
            >
              导出
            </button>
            {canManageGiftApprovalPolicy && (
              <button
                onClick={() => {
                  if (giftPolicy) setGiftPolicyForm(giftPolicy)
                  setGiftPolicyError('')
                  setGiftPolicyOpen(true)
                }}
                className="h-9 px-4 bg-vrbg-surface border border-vrborder-subtle text-vrtext-secondary rounded-lg text-vr-body-sm font-medium hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-4 h-4" />
                赠送审批
              </button>
            )}
          </div>

        {/* Batch Action Bar */}
        <AnimatePresence>
          {canGiftUsers && selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between px-4 py-2.5 mb-3 bg-vrbg-elevated border border-vrborder-subtle rounded-xl"
            >
              <span className="text-vr-body-sm text-vrtext-primary font-medium">
                已选择 {selectedIds.length} 项
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBatchPointsForm({ points: '', remark: '' })
                    setBatchGiftError('')
                    setBatchPointsOpen(true)
                  }}
                  className="h-8 px-3 rounded-lg bg-vrsuccess/10 text-vrsuccess text-vr-caption font-medium hover:bg-vrsuccess/20 transition-colors flex items-center gap-1.5"
                >
                  <Coins className="w-3.5 h-3.5" />
                  批量赠送积分
                </button>
                <button
                  onClick={() => {
                    setBatchCouponForm({ name: '', type: 'EXPERIENCE_FREE', discountRate: '', validDays: '30', reason: '', remark: '' })
                    setBatchGiftError('')
                    setBatchCouponOpen(true)
                  }}
                  className="h-8 px-3 rounded-lg bg-vraccent-primary/10 text-vraccent-primary text-vr-caption font-medium hover:bg-vraccent-primary/20 transition-colors flex items-center gap-1.5"
                >
                  <Ticket className="w-3.5 h-3.5" />
                  批量赠送优惠券
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="h-8 px-3 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-caption font-medium hover:bg-vrbg-surface transition-colors"
                >
                  清空选择
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-vrbg-elevated">
                  <th className="px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[38px]"></th>
                  {canGiftUsers && (
                    <th className="px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[38px]">
                      <input
                        type="checkbox"
                        checked={filteredUsers.length > 0 && selectedIds.length === filteredUsers.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filteredUsers.map((u) => u.id))
                          } else {
                            setSelectedIds([])
                          }
                        }}
                        className="w-4 h-4 accent-vraccent-primary cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="text-left px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[15%]">用户ID</th>
                  <th className="text-left px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[72px]">头像</th>
                  <th className="text-left px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[15%]">姓名</th>
                  <th className="text-center px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[9%]">付费会员</th>
                  <th className="text-center px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[13%]">用户等级</th>
                  <th className="text-left px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[14%]">手机号</th>
                  <th className="text-center px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[9%]">积分</th>
                  <th className="text-right px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[10%]">余额</th>
                  <th className="text-right px-3 py-3 text-vr-caption text-vrtext-secondary font-medium w-[11%]">操作</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredUsers.map((user, idx) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.2) }}
                      className="h-[60px] border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                    >
                      <td className="px-3 py-3 text-vrtext-tertiary">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                      {canGiftUsers && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(user.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds((prev) => [...prev, user.id])
                              } else {
                                setSelectedIds((prev) => prev.filter((id) => id !== user.id))
                              }
                            }}
                            className="w-4 h-4 accent-vraccent-primary cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <span className="block truncate text-vr-caption text-vrtext-tertiary font-mono" title={user.id}>
                          {user.id.length > 12 ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : user.id}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-medium shrink-0"
                          style={{ backgroundColor: getAvatarColor(user.name) }}
                        >
                          {getInitials(user.name)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate text-vr-body-sm text-vrtext-primary font-medium" title={user.name || maskPhone(user.phone)}>
                          {user.name || maskPhone(user.phone)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-vr-body-sm text-vrtext-secondary">{getUserBalance(user) > 0 ? '是' : '否'}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <LevelBadge level={user.level} levelsConfig={memberLevels} />
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate text-vr-body-sm text-vrtext-primary font-mono">{user.phone}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-vr-body-sm text-vrtext-secondary">{user.points || 0}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-vr-body-sm text-vrtext-primary">{yuan(getUserBalance(user))}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="relative flex items-center justify-end gap-3 text-vr-body-sm">
                          <button
                            onClick={() => handleOpenDetail(user)}
                            className="text-vraccent-primary hover:underline"
                            title="详情"
                          >
                            详情
                          </button>
                          {canGiftUsers && (
                            <button
                              onClick={() => handleOpenRecharge(user)}
                              className="text-vraccent-primary hover:underline"
                              title="会员充值"
                            >
                              充值
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="w-12 h-12 text-vrtext-muted mb-3" />
              <p className="text-vr-body text-vrtext-secondary">暂无用户数据</p>
            </div>
          )}

          {/* Pagination */}
          {filteredUsers.length > 0 && (
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
                <span className="text-vr-caption text-vrtext-tertiary ml-2">共 {totalUsers} 条</span>
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
        </div>
      </motion.div>

      {/* User Detail Drawer */}
      <UserDetailSheet
        user={selectedUser}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onEdit={() => {
          if (selectedUser) {
            setEditingUser(selectedUser)
            setDrawerOpen(false)
            setEditSheetOpen(true)
          }
        }}
        onGiftPoints={() => {
          if (selectedUser) {
            handleOpenGiftPoints(selectedUser)
          }
        }}
        onGiftCoupon={() => {
          if (selectedUser) {
            handleOpenGiftCoupon(selectedUser)
          }
        }}
        isUpdating={updateMutation.isPending}
        levelsConfig={memberLevels}
        canEditUser={canEditUsers}
        canViewGiftRecords={canGiftUsers}
        canViewRechargeRecords={canViewRechargeRecords}
      />

      {/* User Edit Sheet */}
      <UserEditSheet
        user={editingUser}
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        onSubmit={handleEditSubmit}
        isPending={updateMutation.isPending}
        levelsConfig={memberLevels}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        user={deletingUser}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />

      <MemberRechargeSheet
        user={rechargingUser}
        open={rechargeSheetOpen}
        onOpenChange={(open) => {
          setRechargeSheetOpen(open)
          if (!open) setRechargingUser(null)
        }}
      />

      {/* Create User Sheet */}
      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="right" className="w-[420px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[420px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary">新增用户</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            {createError && (
              <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-vr-body-sm text-vrerror">
                {createError}
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">姓名 <span className="text-vrerror">*</span></label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="请输入用户姓名"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">手机号 <span className="text-vrerror">*</span></label>
              <input
                type="text"
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="请输入手机号"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">密码</label>
              <input
                type="text"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="不填则默认 123456"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">邮箱</label>
              <input
                type="text"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="请输入邮箱（选填）"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">生日</label>
              <input
                type="date"
                value={createForm.birthday}
                onChange={(e) => setCreateForm((f) => ({ ...f, birthday: e.target.value }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">会员等级</label>
              <select
                value={createForm.level}
                onChange={(e) => setCreateForm((f) => ({ ...f, level: e.target.value }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                {memberLevels.map((l) => (
                  <option key={l.key} value={configKeyToEnum[l.key] || l.key}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">状态</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                <option value="ACTIVE">正常</option>
                <option value="INACTIVE">禁用</option>
              </select>
            </div>
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setCreateSheetOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={createLoading || !createForm.name || !createForm.phone}
                onClick={async () => {
                  setCreateLoading(true)
                  setCreateError('')
                  try {
                    await createUser({
                      name: createForm.name,
                      phone: createForm.phone,
                      password: createForm.password || undefined,
                      email: createForm.email || undefined,
                      birthday: createForm.birthday || undefined,
                      level: createForm.level,
                      status: createForm.status,
                    })
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                    setCreateSheetOpen(false)
                  } catch (e: unknown) {
                    setCreateError(getErrorMessage(e, '创建失败'))
                  } finally {
                    setCreateLoading(false)
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
              >
                {createLoading ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {/* ─── Gift Points Sheet ─── */}
      <Sheet open={giftPointsOpen} onOpenChange={setGiftPointsOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">赠送积分</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            {giftingUser && (
              <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
                <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center text-vraccent-primary font-semibold">
                  {giftingUser.name.charAt(0)}
                </div>
                <div>
                  <p className="text-vr-body-sm text-vrtext-primary font-medium">{giftingUser.name}</p>
                  <p className="text-vr-caption text-vrtext-secondary">当前积分 {giftingUser.points || 0}</p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送积分 <span className="text-vr-error">*</span></label>
              <NumberFieldInput
                value={giftPointsForm.points ? Number(giftPointsForm.points) : undefined}
                minValue={1}
                placeholder="请输入积分数量"
                onChange={(value) => setGiftPointsForm((f) => ({ ...f, points: String(value) }))}
                required
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送原因 <span className="text-vr-error">*</span></label>
              <div className="space-y-2">
                {[
                  { key: 'COMPLAINT', label: '客诉' },
                  { key: 'EQUIPMENT_FAILURE', label: '设备故障' },
                  { key: 'ENTERTAIN_CLIENT', label: '招待客户' },
                  { key: 'OTHER', label: '备注' },
                ].map((r) => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="giftReason"
                      checked={giftPointsForm.reason === r.key}
                      onChange={() => setGiftPointsForm((f) => ({ ...f, reason: r.key }))}
                      className="w-4 h-4 accent-vraccent-primary"
                    />
                    <span className="text-vr-body-sm text-vrtext-primary">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注说明</label>
              <textarea
                value={giftPointsForm.remark}
                onChange={(e) => setGiftPointsForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder={giftPointsForm.reason === 'OTHER' ? '请输入具体原因（必填）' : '请输入补充说明（选填）'}
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {giftError && (
              <p className="text-vr-body-sm text-vr-error">{giftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setGiftPointsOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={giftLoading || !giftPointsForm.points || parseInt(giftPointsForm.points) < 1 || (giftPointsForm.reason === 'OTHER' && !giftPointsForm.remark.trim())}
                onClick={async () => {
                  if (!giftingUser) return
                  setGiftLoading(true)
                  setGiftError('')
                  try {
                    const result = await giftPoints({
                      userId: giftingUser.id,
                      points: parseInt(giftPointsForm.points),
                      reason: giftPointsForm.reason as GiftPointsPayload['reason'],
                      remark: giftPointsForm.remark || undefined,
                    })
                    setGiftPointsOpen(false)
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                    showGiftSubmitResult(result, '积分赠送成功')
                  } catch (err: unknown) {
                    setGiftError(getErrorMessage(err, '赠送失败'))
                  } finally {
                    setGiftLoading(false)
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-vrsuccess text-white text-vr-body-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50"
              >
                {giftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Gift Coupon Sheet ─── */}
      <Sheet open={giftCouponOpen} onOpenChange={setGiftCouponOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">赠送优惠券</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            {giftingUser && (
              <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
                <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center text-vraccent-primary font-semibold">
                  {giftingUser.name.charAt(0)}
                </div>
                <div>
                  <p className="text-vr-body-sm text-vrtext-primary font-medium">{giftingUser.name}</p>
                  <p className="text-vr-caption text-vrtext-secondary">{giftingUser.phone}</p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">优惠券名称 <span className="text-vr-error">*</span></label>
              <input
                type="text"
                value={giftCouponForm.name}
                onChange={(e) => setGiftCouponForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：VR体验补偿券"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">优惠券类型 <span className="text-vr-error">*</span></label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="couponType"
                    checked={giftCouponForm.type === 'EXPERIENCE_FREE'}
                    onChange={() => setGiftCouponForm((f) => ({ ...f, type: 'EXPERIENCE_FREE' }))}
                    className="w-4 h-4 accent-vraccent-primary"
                  />
                  <span className="text-vr-body-sm text-vrtext-primary">体验券（免单1人）</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="couponType"
                    checked={giftCouponForm.type === 'DISCOUNT'}
                    onChange={() => setGiftCouponForm((f) => ({ ...f, type: 'DISCOUNT' }))}
                    className="w-4 h-4 accent-vraccent-primary"
                  />
                  <span className="text-vr-body-sm text-vrtext-primary">折扣券</span>
                </label>
              </div>
            </div>
            {giftCouponForm.type === 'DISCOUNT' && (
              <div>
                <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">折扣率（%）<span className="text-vr-error">*</span></label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={giftCouponForm.discountRate}
                  onChange={(e) => setGiftCouponForm((f) => ({ ...f, discountRate: e.target.value }))}
                  placeholder="例如：85 表示85折"
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                />
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">有效期（天）<span className="text-vr-error">*</span></label>
              <input
                type="number"
                min={1}
                value={giftCouponForm.validityDays}
                onChange={(e) => setGiftCouponForm((f) => ({ ...f, validityDays: e.target.value }))}
                placeholder="默认30天"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送原因 <span className="text-vr-error">*</span></label>
              <div className="space-y-2">
                {[
                  { key: 'COMPLAINT', label: '客诉' },
                  { key: 'EQUIPMENT_FAILURE', label: '设备故障' },
                  { key: 'ENTERTAIN_CLIENT', label: '招待客户' },
                  { key: 'OTHER', label: '备注' },
                ].map((r) => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="giftCouponReason"
                      checked={giftCouponForm.reason === r.key}
                      onChange={() => setGiftCouponForm((f) => ({ ...f, reason: r.key }))}
                      className="w-4 h-4 accent-vraccent-primary"
                    />
                    <span className="text-vr-body-sm text-vrtext-primary">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注说明</label>
              <textarea
                value={giftCouponForm.remark}
                onChange={(e) => setGiftCouponForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder={giftCouponForm.reason === 'OTHER' ? '请输入具体原因（必填）' : '请输入补充说明（选填）'}
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {giftError && (
              <p className="text-vr-body-sm text-vr-error">{giftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setGiftCouponOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={
                  giftLoading ||
                  !giftCouponForm.name.trim() ||
                  !giftCouponForm.validityDays ||
                  parseInt(giftCouponForm.validityDays) < 1 ||
                  (giftCouponForm.type === 'DISCOUNT' && (!giftCouponForm.discountRate || parseInt(giftCouponForm.discountRate) < 1 || parseInt(giftCouponForm.discountRate) > 99)) ||
                  (giftCouponForm.reason === 'OTHER' && !giftCouponForm.remark.trim())
                }
                onClick={async () => {
                  if (!giftingUser) return
                  setGiftLoading(true)
                  setGiftError('')
                  try {
                    const result = await giftCoupon({
                      userId: giftingUser.id,
                      name: giftCouponForm.name.trim(),
                      type: giftCouponForm.type,
                      discountRate: giftCouponForm.type === 'DISCOUNT' ? parseInt(giftCouponForm.discountRate) : undefined,
                      validityDays: parseInt(giftCouponForm.validityDays),
                      reason: giftCouponForm.reason as GiftCouponPayload['reason'],
                      remark: giftCouponForm.remark || undefined,
                    })
                    setGiftCouponOpen(false)
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                    showGiftSubmitResult(result, '优惠券赠送成功')
                  } catch (err: unknown) {
                    setGiftError(getErrorMessage(err, '赠送失败'))
                  } finally {
                    setGiftLoading(false)
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
              >
                {giftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Batch Gift Points Sheet ─── */}
      <Sheet open={batchPointsOpen} onOpenChange={setBatchPointsOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">批量赠送积分</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
              <div className="w-10 h-10 rounded-full bg-vrsuccess/10 flex items-center justify-center text-vrsuccess font-semibold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-vr-body-sm text-vrtext-primary font-medium">共选择 {selectedIds.length} 位用户</p>
                <p className="text-vr-caption text-vrtext-secondary">积分将赠送给所有选中用户</p>
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">积分数量 <span className="text-vr-error">*</span></label>
              <input
                type="number"
                min={1}
                value={batchPointsForm.points}
                onChange={(e) => setBatchPointsForm((f) => ({ ...f, points: e.target.value }))}
                placeholder="请输入积分数量"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注</label>
              <textarea
                value={batchPointsForm.remark}
                onChange={(e) => setBatchPointsForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="请输入备注（选填）"
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {batchGiftError && (
              <p className="text-vr-body-sm text-vr-error">{batchGiftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setBatchPointsOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={batchGiftLoading || !batchPointsForm.points || parseInt(batchPointsForm.points) < 1}
                onClick={() => {
                  batchGiftPointsMutation.mutate({
                    userIds: selectedIds,
                    points: parseInt(batchPointsForm.points),
                    remark: batchPointsForm.remark || undefined,
                  })
                }}
                className="flex-1 h-10 rounded-lg bg-vrsuccess text-white text-vr-body-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50"
              >
                {batchGiftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Batch Gift Coupon Sheet ─── */}
      <Sheet open={batchCouponOpen} onOpenChange={setBatchCouponOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">批量赠送优惠券</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
              <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center text-vraccent-primary font-semibold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-vr-body-sm text-vrtext-primary font-medium">共选择 {selectedIds.length} 位用户</p>
                <p className="text-vr-caption text-vrtext-secondary">优惠券将分别赠送给所有选中用户</p>
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">券类型 <span className="text-vr-error">*</span></label>
              <select
                value={batchCouponForm.type}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, type: e.target.value as 'EXPERIENCE_FREE' | 'DISCOUNT' }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                <option value="EXPERIENCE_FREE">体验券（免单1人）</option>
                <option value="DISCOUNT">折扣券</option>
              </select>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">券名称 <span className="text-vr-error">*</span></label>
              <input
                type="text"
                value={batchCouponForm.name}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：VR体验补偿券"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            {batchCouponForm.type === 'DISCOUNT' && (
              <div>
                <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">折扣率（%）<span className="text-vr-error">*</span></label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={batchCouponForm.discountRate}
                  onChange={(e) => setBatchCouponForm((f) => ({ ...f, discountRate: e.target.value }))}
                  placeholder="例如：85 表示85折"
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                />
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">有效天数 <span className="text-vr-error">*</span></label>
              <input
                type="number"
                min={1}
                value={batchCouponForm.validDays}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, validDays: e.target.value }))}
                placeholder="默认30天"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送原因</label>
              <input
                type="text"
                value={batchCouponForm.reason}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="请输入赠送原因（选填）"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注</label>
              <textarea
                value={batchCouponForm.remark}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="请输入备注（选填）"
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {batchGiftError && (
              <p className="text-vr-body-sm text-vr-error">{batchGiftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setBatchCouponOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={
                  batchGiftLoading ||
                  !batchCouponForm.name.trim() ||
                  !batchCouponForm.validDays ||
                  parseInt(batchCouponForm.validDays) < 1 ||
                  (batchCouponForm.type === 'DISCOUNT' && (!batchCouponForm.discountRate || parseInt(batchCouponForm.discountRate) < 1 || parseInt(batchCouponForm.discountRate) > 99))
                }
                onClick={() => {
                  batchGiftCouponMutation.mutate({
                    userIds: selectedIds,
                    data: {
                      name: batchCouponForm.name.trim(),
                      type: batchCouponForm.type,
                      discountRate: batchCouponForm.type === 'DISCOUNT' ? parseInt(batchCouponForm.discountRate) : undefined,
                      validDays: parseInt(batchCouponForm.validDays),
                      giftReason: batchCouponForm.reason || undefined,
                      giftRemark: batchCouponForm.remark || undefined,
                    },
                  })
                }}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
              >
                {batchGiftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Member Gift Approval Policy Sheet ─── */}
      <Sheet open={giftPolicyOpen} onOpenChange={setGiftPolicyOpen}>
        <SheetContent side="right" className="w-[520px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[520px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">赠送审批策略</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            <div className="p-4 rounded-xl bg-vrbg-elevated border border-vrborder-subtle">
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-vr-body-sm text-vrtext-primary font-medium">启用会员赠送审批</span>
                  <span className="block text-vr-caption text-vrtext-tertiary mt-1">
                    开启后，达到规则的积分或优惠券赠送会先生成审批单。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={giftPolicyForm.enabled}
                  onChange={(e) => setGiftPolicyForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="w-4 h-4 accent-[#3B82F6]"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle">
                <input
                  type="checkbox"
                  checked={giftPolicyForm.requirePointsGiftApproval}
                  onChange={(e) => setGiftPolicyForm((f) => ({ ...f, requirePointsGiftApproval: e.target.checked }))}
                  className="w-4 h-4 accent-[#3B82F6]"
                />
                <span className="text-vr-body-sm text-vrtext-primary">积分赠送审批</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle">
                <input
                  type="checkbox"
                  checked={giftPolicyForm.requireCouponGiftApproval}
                  onChange={(e) => setGiftPolicyForm((f) => ({ ...f, requireCouponGiftApproval: e.target.checked }))}
                  className="w-4 h-4 accent-[#3B82F6]"
                />
                <span className="text-vr-body-sm text-vrtext-primary">优惠券赠送审批</span>
              </label>
              <label className="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle">
                <input
                  type="checkbox"
                  checked={giftPolicyForm.forceExperienceCouponApproval}
                  onChange={(e) => setGiftPolicyForm((f) => ({ ...f, forceExperienceCouponApproval: e.target.checked }))}
                  className="w-4 h-4 accent-[#3B82F6]"
                />
                <span className="text-vr-body-sm text-vrtext-primary">免单体验券始终需要审批</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-vr-caption text-vrtext-secondary">积分阈值</span>
                <input
                  type="number"
                  min={1}
                  value={giftPolicyForm.pointsThreshold}
                  onChange={(e) => setGiftPolicyForm((f) => ({ ...f, pointsThreshold: Math.max(1, Number(e.target.value) || 1) }))}
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15"
                />
                <span className="block text-[11px] text-vrtext-muted">单次赠送达到该积分后进入审批。</span>
              </label>
              <label className="space-y-1.5">
                <span className="text-vr-caption text-vrtext-secondary">批量人数阈值</span>
                <input
                  type="number"
                  min={1}
                  value={giftPolicyForm.batchSizeThreshold}
                  onChange={(e) => setGiftPolicyForm((f) => ({ ...f, batchSizeThreshold: Math.max(1, Number(e.target.value) || 1) }))}
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15"
                />
                <span className="block text-[11px] text-vrtext-muted">一次赠送人数达到该值后进入审批。</span>
              </label>
            </div>

            {giftPolicyError && <p className="text-vr-body-sm text-vr-error">{giftPolicyError}</p>}

            <div className="pt-3 flex gap-3">
              <button
                onClick={() => setGiftPolicyOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={updateGiftPolicyMutation.isPending}
                onClick={() => updateGiftPolicyMutation.mutate(giftPolicyForm)}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {updateGiftPolicyMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                保存策略
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Layout>
  )
}
