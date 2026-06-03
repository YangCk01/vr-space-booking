import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Coins,
  Download,
  Calendar,
  ChevronDown,
  Filter,
  Clock,
  MapPin,
  User,
  Receipt,
  CreditCard as PaymentIcon,
  Gamepad2,
  Phone,
  X,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  getFinanceOverview,
  getFinanceFlow,
  getFinanceRefunds,
  getDailyReport,
  getDailyReports,
  generateDailyReport,
  reconcileFinance,
  getReconcileDetails,
  fixReconcileDiff,
  getTotalSummary,
  type FlowItem,
  type DailyReport,
  type ReconcileDetailsResult,
  type TotalSummary,
} from '@/api/finance'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { getVenues } from '@/api/venues'
import { getOrderByNo } from '@/api/orders'
import ReconExceptionsPanel from '@/components/ReconExceptionsPanel'
import DeviceLogPanel from '@/components/DeviceLogPanel'

type TabKey = 'overview' | 'flow' | 'refunds' | 'recon' | 'deviceLogs'
type ReconSubTab = 'daily' | 'exceptions'

const tabs = [
  { key: 'overview' as TabKey, label: '收支概览' },
  { key: 'flow' as TabKey, label: '收支明细' },
  { key: 'refunds' as TabKey, label: '退款记录' },
  { key: 'recon' as TabKey, label: '对账中心' },
  { key: 'deviceLogs' as TabKey, label: '设备日志' },
]

const typeLabelMap: Record<string, string> = {
  ORDER: '订单收入',
  REFUND: '退款',
  RECHARGE: '充值',
  BALANCE_DEDUCT: '余额扣款',
  BALANCE_REFUND: '余额退款',
}

const reconcileTypeMap: Record<string, string> = {
  '本金余额': 'BALANCE_PRINCIPAL',
  '赠送余额': 'BALANCE_BONUS',
  '积分余额': 'BALANCE_POINTS',
  '充值本金': 'RECHARGE_PRINCIPAL',
  '充值赠送': 'RECHARGE_BONUS',
  '在线直付': 'DIRECT_PAY',
  '消费本金': 'CONSUME_PRINCIPAL',
  '消费赠送': 'CONSUME_BONUS',
  '退款总额': 'REFUND',
  '消费赠送积分': 'POINTS_EARN',
  '管理员赠送积分': 'POINTS_GIFT',
  '积分兑换消耗': 'POINTS_EXCHANGE',
  '手动发放折扣券': 'COUPON_GIFT',
  '手动发放体验券': 'EXPERIENCE_GIFT',
  '活动发放折扣券': 'COUPON_CAMPAIGN',
  '活动发放体验券': 'EXPERIENCE_CAMPAIGN',
  '折扣券核销': 'COUPON_USED',
  '体验券核销': 'EXPERIENCE_USED',
}

const typeColorMap: Record<string, string> = {
  ORDER: '#10B981',
  REFUND: '#EF4444',
  RECHARGE: '#3B82F6',
  BALANCE_DEDUCT: '#F59E0B',
  BALANCE_REFUND: '#8B5CF6',
}

const payMethodLabelMap: Record<string, string> = {
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  BALANCE: '余额支付',
  BALANCE_POINTS: '余额+积分',
  CASH: '现金',
  CARD: '刷卡',
}

const payMethodColorMap: Record<string, string> = {
  WECHAT: '#10B981',
  ALIPAY: '#3B82F6',
  BALANCE: '#F59E0B',
  BALANCE_POINTS: '#F59E0B',
  CASH: '#64748B',
  CARD: '#8B5CF6',
}

const tooltipStyle = {
  backgroundColor: '#1E293B',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '8px 12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
}

/* ─── Helpers ─── */
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0)
  const startRef = useState<number | null>(null)
  const rafRef = useState<number>(0)

  // Run once on mount/target change
  useState(() => {
    const step = (ts: number) => {
      if (startRef[0] === null) startRef[1](ts)
      const progress = Math.min((ts - (startRef[0] || ts)) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setVal(Math.round(eased * target))
      if (progress < 1) rafRef[1](requestAnimationFrame(step))
    }
    rafRef[1](requestAnimationFrame(step))
    return () => cancelAnimationFrame(rafRef[0])
  })

  return val
}

/* ─── Export helper ─── */
function exportFlowToExcel(items: FlowItem[], filename: string) {
  const rows = items.map((i) => ({
    时间: i.createdAt ? format(new Date(i.createdAt), 'yyyy-MM-dd HH:mm:ss') : '-',
    类型: typeLabelMap[i.type] || i.type,
    订单号: i.orderNo,
    用户: i.userName,
    手机号: i.userPhone,
    金额: i.amount / 100,
    支付方式: payMethodLabelMap[i.payMethod] || i.payMethod || '-',
    备注: i.remark,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '收支明细')
  XLSX.writeFile(wb, filename)
}

/* ─── Main Page ─── */
export default function Finance() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [reconSubTab, setReconSubTab] = useState<ReconSubTab>('daily')
  const [venueId, setVenueId] = useState('')

  /* Venues list */
  const { data: venuesData } = useQuery({
    queryKey: ['venues', 'all'],
    queryFn: () => getVenues({ pageSize: 100 }),
  })
  const venues = venuesData?.data || []

  /* Overview states */
  const [overviewRange, setOverviewRange] = useState('7days')

  /* Flow states */
  const [flowStart, setFlowStart] = useState('')
  const [flowEnd, setFlowEnd] = useState('')
  const [flowTypes, setFlowTypes] = useState<string[]>([])
  const [flowPayMethod, setFlowPayMethod] = useState<string[]>([])
  const [flowPage, setFlowPage] = useState(1)
  const flowPageSize = 20

  /* Order detail drawer states */
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const handleOpenDetail = async (orderNo: string) => {
    if (!orderNo) return
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const order = await getOrderByNo(orderNo)
      setDetailOrder(order)
    } catch (err) {
      setDetailOrder(null)
    } finally {
      setDetailLoading(false)
    }
  }

  /* Refund states */
  const [refundStart, setRefundStart] = useState('')
  const [refundEnd, setRefundEnd] = useState('')
  const [refundPage, setRefundPage] = useState(1)
  const refundPageSize = 20

  /* Daily report states */
  const [dailyDate, setDailyDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reconcileMode, setReconcileMode] = useState<'total' | 'daily'>('daily')

  /* Queries */
  const { data: overviewData } = useQuery({
    queryKey: ['finance', 'overview', overviewRange, venueId],
    queryFn: () => getFinanceOverview(overviewRange, undefined, undefined, venueId || undefined),
  })

  const { data: flowData } = useQuery({
    queryKey: ['finance', 'flow', flowStart, flowEnd, flowTypes.join(','), flowPayMethod.join(','), venueId, flowPage],
    queryFn: () =>
      getFinanceFlow({
        startDate: flowStart || undefined,
        endDate: flowEnd || undefined,
        types: flowTypes.length ? flowTypes.join(',') : undefined,
        payMethod: flowPayMethod.length ? flowPayMethod.join(',') : undefined,
        venueId: venueId || undefined,
        page: flowPage,
        pageSize: flowPageSize,
      }),
  })

  const { data: refundData } = useQuery({
    queryKey: ['finance', 'refunds', refundStart, refundEnd, venueId, refundPage],
    queryFn: () =>
      getFinanceRefunds({
        startDate: refundStart || undefined,
        endDate: refundEnd || undefined,
        venueId: venueId || undefined,
        page: refundPage,
        pageSize: refundPageSize,
      }),
  })

  const { data: dailyReport, refetch: refetchDailyReport } = useQuery({
    queryKey: ['finance', 'daily', dailyDate],
    queryFn: () => getDailyReport(dailyDate),
  })

  const { data: totalSummary } = useQuery({
    queryKey: ['finance', 'total-summary'],
    queryFn: () => getTotalSummary(),
  })

  const generateReportMut = useMutation({
    mutationFn: generateDailyReport,
    onSuccess: () => {
      refetchDailyReport()
    },
  })

  const fixReconcileDiffMut = useMutation({
    mutationFn: fixReconcileDiff,
    onSuccess: () => {
      toast.success('修复成功')
      // 刷新明细和对账结果
      queryClient.invalidateQueries({ queryKey: ['finance', 'reconcile-detail'] })
      queryClient.invalidateQueries({ queryKey: ['finance', 'reconcile'] })
      refetchReconcile()
    },
    onError: (err: any) => {
      toast.error(err?.message || '修复失败')
    },
  })

  const { data: reconcileData, refetch: refetchReconcile } = useQuery({
    queryKey: ['finance', 'reconcile', reconcileMode, reconcileMode === 'daily' ? dailyDate : 'total'],
    queryFn: () => reconcileFinance(reconcileMode === 'daily' ? dailyDate : undefined),
    enabled: false,
  })

  /* Reconcile detail drawer */
  const [reconcileDetailOpen, setReconcileDetailOpen] = useState(false)
  const [reconcileDetailParams, setReconcileDetailParams] = useState<{type: string, date?: string} | null>(null)

  const { data: reconcileDetailData } = useQuery<ReconcileDetailsResult | null>({
    queryKey: ['finance', 'reconcile-detail', reconcileDetailParams],
    queryFn: async () => {
      if (!reconcileDetailParams) return null
      return getReconcileDetails(reconcileDetailParams.type, reconcileDetailParams.date)
    },
    enabled: !!reconcileDetailParams,
  })

  const openReconcileDetail = (name: string) => {
    const typeCode = reconcileTypeMap[name]
    if (!typeCode) return
    setReconcileDetailParams({
      type: typeCode,
      date: reconcileMode === 'daily' ? dailyDate : undefined,
    })
    setReconcileDetailOpen(true)
  }

  const flowItems: FlowItem[] = flowData?.data || []
  const flowTotal = flowData?.meta?.total || 0
  const flowTotalPages = flowData?.meta?.totalPages || 1

  const refundItems = refundData?.data || []
  const refundTotal = refundData?.meta?.total || 0
  const refundTotalPages = refundData?.meta?.totalPages || 1

  /* ─── Period label helper ─── */
  const periodLabel = overviewRange === 'today' ? '今日' : overviewRange === '7days' ? '近7天' : '近30天'

  /* ─── KPI Cards (period-based) ─── */
  const kpis = overviewData
    ? [
        {
          icon: <TrendingUp className="w-6 h-6 text-vraccent-primary" />,
          iconBg: 'rgba(59,130,246,0.1)',
          label: `${periodLabel}营收`,
          value: `¥${((overviewData.periodRevenue || 0) / 100).toLocaleString()}`,
        },
        {
          icon: <TrendingDown className="w-6 h-6 text-vrerror" />,
          iconBg: 'rgba(239,68,68,0.1)',
          label: `${periodLabel}退款`,
          value: `¥${((overviewData.periodRefund || 0) / 100).toLocaleString()}`,
        },
        {
          icon: <PiggyBank className="w-6 h-6 text-vrsuccess" />,
          iconBg: 'rgba(16,185,129,0.1)',
          label: `${periodLabel}充值`,
          value: `¥${((overviewData.periodRecharge || 0) / 100).toLocaleString()}`,
        },
      ]
    : []

  /* ─── Trend data ─── */
  const trendData = overviewData?.revenueTrend.map((d) => ({
    date: d.date.slice(5), // MM-dd
    revenue: d.revenue / 100,
    refund: d.refund / 100,
    recharge: d.recharge / 100,
  })) || []

  /* ─── Pie data (period-based) ─── */
  const pieData = overviewData
    ? [
        { name: '营收', value: overviewData.periodRevenue || 0, color: '#10B981' },
        { name: '退款', value: overviewData.periodRefund || 0, color: '#EF4444' },
        { name: '充值', value: overviewData.periodRecharge || 0, color: '#3B82F6' },
      ].filter((d) => d.value > 0)
    : []

  return (
    <Layout breadcrumb={['财务管理']}>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">财务管理</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">收支概览、流水明细、退款记录</p>
          </div>
          <Wallet className="w-8 h-8 text-vraccent-primary" />
        </motion.div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-vrborder-subtle">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative py-3 text-vr-body-sm font-medium transition-colors',
                activeTab === tab.key ? 'text-vraccent-primary' : 'text-vrtext-secondary hover:text-vrtext-primary'
              )}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="finance-tab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-vraccent-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ─── Overview Tab ─── */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Range selector + Venue filter */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {(['today', '7days', '30days'] as string[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setOverviewRange(r)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-vr-body-sm transition-colors',
                        overviewRange === r
                          ? 'bg-vrbg-active text-vraccent-primary'
                          : 'text-vrtext-secondary hover:bg-vrbg-elevated'
                      )}
                    >
                      {r === 'today' ? '今天' : r === '7days' ? '近7天' : '近30天'}
                    </button>
                  ))}
                </div>
                <div className="h-5 w-[1px] bg-vrborder-subtle" />
                <select
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
                  className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                >
                  <option value="">全部门店</option>
                  {venues.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                {venueId && (
                  <button
                    onClick={() => setVenueId('')}
                    className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors"
                  >
                    清除
                  </button>
                )}
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {kpis.map((kpi, i) => (
                  <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: kpi.iconBg }}
                      >
                        {kpi.icon}
                      </div>
                      <div>
                        <p className="text-vr-caption text-vrtext-tertiary">{kpi.label}</p>
                        <p className="text-vr-data-lg text-vrtext-primary mt-1">{kpi.value}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Member Recharge Overview */}
              {overviewData && (
                <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-5">
                  <h3 className="text-vr-body text-vrtext-primary font-medium mb-4 flex items-center gap-2">
                    <PiggyBank className="w-4 h-4 text-vrsuccess" />
                    会员储值概览
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-vrbg-surface/50 rounded-lg p-4">
                      <p className="text-vr-caption text-vrtext-tertiary">{periodLabel}充值</p>
                      <p className="text-vr-data-lg text-vrsuccess mt-1">
                        ¥{((overviewData.periodRecharge || 0) / 100).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-vrbg-surface/50 rounded-lg p-4">
                      <p className="text-vr-caption text-vrtext-tertiary">{periodLabel}储值消费</p>
                      <p className="text-vr-data-lg text-vrwarning mt-1">
                        ¥{((overviewData.periodRechargeConsumption || 0) / 100).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-vrbg-surface/50 rounded-lg p-4">
                      <p className="text-vr-caption text-vrtext-tertiary">用户储值总余额</p>
                      <p className="text-vr-data-lg text-vraccent-primary mt-1">
                        ¥{((overviewData.totalUserBalance || 0) / 100).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Trend chart */}
                <div className="lg:col-span-2 bg-vrbg-card border border-vrborder-subtle rounded-xl p-5">
                  <h3 className="text-vr-body text-vrtext-primary font-medium mb-4">营收趋势</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="refGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#EF4444" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={{ stroke: '#1E293B' }} tickLine={false} />
                        <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `¥${v}`} />
                        <Tooltip
                          formatter={(v: number, name: string) => [`¥${v.toLocaleString()}`, name]}
                          contentStyle={tooltipStyle as any}
                          labelStyle={{ color: '#F1F5F9', fontSize: 12, fontWeight: 500, marginBottom: 4 }}
                          itemStyle={{ color: '#94A3B8', fontSize: 12 }}
                        />
                        <Area type="monotone" dataKey="revenue" name="营收" stroke="#10B981" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="refund" name="退款" stroke="#EF4444" fill="url(#refGrad)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="recharge" name="充值" stroke="#3B82F6" fill="url(#recGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie chart */}
                <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-vr-body text-vrtext-primary font-medium">收支构成</h3>
                    <span
                      className="text-vr-caption text-vrtext-muted cursor-help"
                      title="展示所选周期内营收、退款、充值三类资金流向的占比关系，帮助了解资金结构的健康度"
                    >
                      ?
                    </span>
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number, name: string) => [`¥${(v / 100).toLocaleString()}`, name]}
                          contentStyle={tooltipStyle as any}
                          itemStyle={{ color: '#94A3B8', fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {pieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-vr-caption text-vrtext-secondary">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Flow Tab ─── */}
          {activeTab === 'flow' && (
            <motion.div
              key="flow"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-vrtext-muted" />
                  <input
                    type="date"
                    value={flowStart}
                    onChange={(e) => { setFlowStart(e.target.value); setFlowPage(1) }}
                    className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                  />
                  <span className="text-vr-caption text-vrtext-tertiary">至</span>
                  <input
                    type="date"
                    value={flowEnd}
                    onChange={(e) => { setFlowEnd(e.target.value); setFlowPage(1) }}
                    className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                  />
                  {(flowStart || flowEnd) && (
                    <button
                      onClick={() => { setFlowStart(''); setFlowEnd(''); setFlowPage(1) }}
                      className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors"
                    >
                      清除
                    </button>
                  )}
                </div>

                {/* Venue filter */}
                <div className="h-5 w-[1px] bg-vrborder-subtle" />
                <select
                  value={venueId}
                  onChange={(e) => { setVenueId(e.target.value); setFlowPage(1) }}
                  className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                >
                  <option value="">全部门店</option>
                  {venues.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>

                {/* Type filter */}
                <div className="relative group">
                  <button className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    <span>类型</span>
                    {flowTypes.length > 0 && <span className="text-vraccent-primary">({flowTypes.length})</span>}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute top-full left-0 mt-1 w-40 bg-vrbg-elevated border border-vrborder-hover rounded-lg shadow-lg z-50 hidden group-hover:block p-2 space-y-1">
                    {Object.entries(typeLabelMap).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-vrbg-surface cursor-pointer">
                        <input
                          type="checkbox"
                          checked={flowTypes.includes(key)}
                          onChange={(e) => {
                            setFlowTypes((prev) =>
                              e.target.checked ? [...prev, key] : prev.filter((t) => t !== key)
                            )
                            setFlowPage(1)
                          }}
                          className="rounded border-vrborder-subtle"
                        />
                        <span className="text-vr-body-sm text-vrtext-secondary">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Pay method filter */}
                <div className="relative group">
                  <button className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    <span>支付方式</span>
                    {flowPayMethod.length > 0 && <span className="text-vraccent-primary">({flowPayMethod.length})</span>}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute top-full left-0 mt-1 w-40 bg-vrbg-elevated border border-vrborder-hover rounded-lg shadow-lg z-50 hidden group-hover:block p-2 space-y-1">
                    {Object.entries(payMethodLabelMap).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-vrbg-surface cursor-pointer">
                        <input
                          type="checkbox"
                          checked={flowPayMethod.includes(key)}
                          onChange={(e) => {
                            setFlowPayMethod((prev) =>
                              e.target.checked ? [...prev, key] : prev.filter((t) => t !== key)
                            )
                            setFlowPage(1)
                          }}
                          className="rounded border-vrborder-subtle"
                        />
                        <span className="text-vr-body-sm text-vrtext-secondary">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => exportFlowToExcel(flowItems, `finance_flow_${new Date().toISOString().split('T')[0]}.xlsx`)}
                  className="h-9 px-4 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors flex items-center gap-2 ml-auto"
                >
                  <Download className="w-4 h-4" />
                  导出Excel
                </button>
              </div>

              {/* Table */}
              <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-vrbg-elevated">
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">时间</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">类型</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">订单号</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">用户</th>
                        <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">金额</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">支付方式</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flowItems.map((item, idx) => (
                        <motion.tr
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: idx * 0.03 }}
                          className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                        >
                          <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary">
                            {item.createdAt ? format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-vr-caption font-medium"
                              style={{
                                backgroundColor: `${typeColorMap[item.type]}20`,
                                color: typeColorMap[item.type],
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColorMap[item.type] }} />
                              {typeLabelMap[item.type] || item.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-vr-body-sm font-mono">
                            {(item.type === 'ORDER' || item.type === 'REFUND') && item.orderNo ? (
                              <button
                                onClick={() => handleOpenDetail(item.orderNo)}
                                className="text-vraccent-primary hover:text-vraccent-primary/80 hover:underline transition-colors"
                              >
                                {item.orderNo}
                              </button>
                            ) : (
                              <span className="text-vrtext-primary">{item.orderNo}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary">
                            <div>{item.userName}</div>
                            <div className="text-vr-caption text-vrtext-tertiary">{item.userPhone}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-vr-body-sm font-semibold ${
                                item.amount >= 0 ? 'text-vrsuccess' : 'text-vrerror'
                              }`}
                            >
                              {item.amount >= 0 ? '+' : ''}¥{(Math.abs(item.amount) / 100).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-vr-caption font-medium"
                              style={{
                                backgroundColor: `${payMethodColorMap[item.payMethod] || '#64748B'}20`,
                                color: payMethodColorMap[item.payMethod] || '#64748B',
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: payMethodColorMap[item.payMethod] || '#64748B' }} />
                              {payMethodLabelMap[item.payMethod] || item.payMethod || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-vr-body-sm text-vrtext-secondary">{item.remark}</td>
                        </motion.tr>
                      ))}
                      {flowItems.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-vrtext-tertiary text-vr-body-sm">
                            暂无数据
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {flowTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-vrborder-subtle">
                    <span className="text-vr-caption text-vrtext-tertiary">
                      共 {flowTotal} 条，{flowTotalPages} 页
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={flowPage <= 1}
                        onClick={() => setFlowPage(flowPage - 1)}
                        className="px-3 py-1.5 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        上一页
                      </button>
                      <span className="text-vr-body-sm text-vrtext-primary px-2">{flowPage}</span>
                      <button
                        disabled={flowPage >= flowTotalPages}
                        onClick={() => setFlowPage(flowPage + 1)}
                        className="px-3 py-1.5 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ─── Refunds Tab ─── */}
          {activeTab === 'refunds' && (
            <motion.div
              key="refunds"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-vrtext-muted" />
                  <input
                    type="date"
                    value={refundStart}
                    onChange={(e) => { setRefundStart(e.target.value); setRefundPage(1) }}
                    className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                  />
                  <span className="text-vr-caption text-vrtext-tertiary">至</span>
                  <input
                    type="date"
                    value={refundEnd}
                    onChange={(e) => { setRefundEnd(e.target.value); setRefundPage(1) }}
                    className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                  />
                  {(refundStart || refundEnd) && (
                    <button
                      onClick={() => { setRefundStart(''); setRefundEnd(''); setRefundPage(1) }}
                      className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors"
                    >
                      清除
                    </button>
                  )}
                </div>

                <div className="h-5 w-[1px] bg-vrborder-subtle" />
                <select
                  value={venueId}
                  onChange={(e) => { setVenueId(e.target.value); setRefundPage(1) }}
                  className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                >
                  <option value="">全部门店</option>
                  {venues.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Table */}
              <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-vrbg-elevated">
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">订单号</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">用户</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">场地</th>
                        <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">原金额</th>
                        <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">退款金额</th>
                        <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">退款时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refundItems.map((item: any, idx: number) => (
                        <motion.tr
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: idx * 0.03 }}
                          className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                        >
                          <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary font-mono">{item.orderNo}</td>
                          <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary">
                            <div>{item.user?.name || item.booking?.personName || '-'}</div>
                            <div className="text-vr-caption text-vrtext-tertiary">{item.user?.phone || '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary">{item.venueName}</td>
                          <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">¥{(item.amount / 100).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-vr-body-sm text-vrerror font-semibold">¥{((item.refundAmount || 0) / 100).toLocaleString()}</td>
                          <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary">
                            {item.createdAt ? format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm') : '-'}
                          </td>
                        </motion.tr>
                      ))}
                      {refundItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-vrtext-tertiary text-vr-body-sm">
                            暂无数据
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {refundTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-vrborder-subtle">
                    <span className="text-vr-caption text-vrtext-tertiary">
                      共 {refundTotal} 条，{refundTotalPages} 页
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={refundPage <= 1}
                        onClick={() => setRefundPage(refundPage - 1)}
                        className="px-3 py-1.5 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        上一页
                      </button>
                      <span className="text-vr-body-sm text-vrtext-primary px-2">{refundPage}</span>
                      <button
                        disabled={refundPage >= refundTotalPages}
                        onClick={() => setRefundPage(refundPage + 1)}
                        className="px-3 py-1.5 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ─── Reconciliation Center Tab ─── */}
          {activeTab === 'recon' && reconSubTab === 'daily' && (
            <motion.div
              key="recon-daily"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* 二级 Tab 切换 */}
              <div className="flex items-center gap-1 bg-vrbg-surface rounded-lg p-1 w-fit">
                <button
                  onClick={() => setReconSubTab('daily')}
                  className={cn(
                    'px-3 py-1 rounded text-vr-body-sm transition-colors',
                    (reconSubTab as string) === 'daily'
                      ? 'bg-vraccent-primary text-white'
                      : 'text-vrtext-secondary hover:text-vrtext-primary'
                  )}
                >
                  每日报表
                </button>
                <button
                  onClick={() => setReconSubTab('exceptions')}
                  className={cn(
                    'px-3 py-1 rounded text-vr-body-sm transition-colors',
                    (reconSubTab as string) === 'exceptions'
                      ? 'bg-vraccent-primary text-white'
                      : 'text-vrtext-secondary hover:text-vrtext-primary'
                  )}
                >
                  对账异常
                </button>
              </div>

              {/* Date picker + Reconcile */}
              <div className="flex flex-wrap items-center gap-3 bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                {/* 对账模式切换 */}
                <div className="flex items-center gap-1 bg-vrbg-surface rounded-lg p-1">
                  <button
                    onClick={() => setReconcileMode('daily')}
                    className={cn(
                      'px-3 py-1 rounded text-vr-body-sm transition-colors',
                      reconcileMode === 'daily'
                        ? 'bg-vraccent-primary text-white'
                        : 'text-vrtext-secondary hover:text-vrtext-primary'
                    )}
                  >
                    按日对账
                  </button>
                  <button
                    onClick={() => setReconcileMode('total')}
                    className={cn(
                      'px-3 py-1 rounded text-vr-body-sm transition-colors',
                      reconcileMode === 'total'
                        ? 'bg-vraccent-primary text-white'
                        : 'text-vrtext-secondary hover:text-vrtext-primary'
                    )}
                  >
                    总对账
                  </button>
                </div>

                {reconcileMode === 'daily' && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-vrtext-muted" />
                    <input
                      type="date"
                      value={dailyDate}
                      onChange={(e) => setDailyDate(e.target.value)}
                      className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                    />
                  </div>
                )}

                <button
                  onClick={() => refetchReconcile()}
                  className="h-9 px-4 rounded-lg bg-vraccent-primary/10 border border-vraccent-primary/30 text-vr-body-sm text-vraccent-primary hover:bg-vraccent-primary/20 transition-colors"
                >
                  对账校验
                </button>
                <button
                  onClick={() => generateReportMut.mutate(dailyDate)}
                  disabled={generateReportMut.isPending}
                  className="h-9 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-vr-body-sm text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {generateReportMut.isPending ? '生成中...' : '生成报表'}
                </button>
              </div>

              {/* Reconcile result */}
              {reconcileData && (
                <div className={cn(
                  'rounded-xl border p-4',
                  reconcileData.isBalanced
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', reconcileData.isBalanced ? 'bg-emerald-500' : 'bg-red-500')} />
                      <span className={cn('text-vr-body-sm font-medium', reconcileData.isBalanced ? 'text-emerald-400' : 'text-red-400')}>
                        {reconcileData.isBalanced ? '对账平衡' : '对账异常'}
                      </span>
                    </div>
                    <span className="text-vr-caption text-vrtext-muted">
                      {reconcileData.mode === 'total'
                        ? '总对账（全量累计）'
                        : reconcileData.date
                          ? `${reconcileData.date} 按日对账`
                          : '按日对账'}
                    </span>
                  </div>
                  {reconcileData.items && reconcileData.items.length > 0 ? (
                    <div className="space-y-2">
                      {reconcileData.items.map((item) => (
                        <div key={item.name} className="grid grid-cols-12 gap-2 items-center text-vr-caption">
                          <div className="col-span-2 text-vrtext-secondary font-medium">{item.name}</div>
                          <div className="col-span-3 text-vrtext-primary">
                            实际: {item.unit === '元' ? `¥${(item.actual / 100).toLocaleString()}` : `${item.actual.toLocaleString()}${item.unit || '分'}`}
                          </div>
                          <div className="col-span-3 text-vrtext-primary">
                            期望: {item.unit === '元' ? `¥${(item.expected / 100).toLocaleString()}` : `${item.expected.toLocaleString()}${item.unit || '分'}`}
                          </div>
                          <div className={cn(
                            'col-span-2 font-medium',
                            item.diff !== 0 ? 'text-red-400' : 'text-vrtext-secondary'
                          )}>
                            差异: {item.unit === '元' ? `¥${(item.diff / 100).toLocaleString()}` : `${item.diff.toLocaleString()}${item.unit || '分'}`}
                          </div>
                          <div className="col-span-2">
                            {item.isBalanced ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                正常
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  异常
                                </span>
                                <button
                                  onClick={() => openReconcileDetail(item.name)}
                                  className="text-vraccent-primary hover:underline text-xs"
                                >
                                  查看明细
                                </button>
                              </div>
                            )}
                          </div>
                          {item.note && (
                            <div className="col-span-12 text-vrtext-muted text-xs">{item.note}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-vr-caption text-vrtext-secondary py-2">
                      对账数据格式异常，请刷新页面或重启后端服务
                    </div>
                  )}
                </div>
              )}

              {/* Daily report cards */}
              {reconcileMode === 'daily' ? (
                dailyReport ? (
                  <div className="space-y-4">
                    {/* 5.1 现金解缴表 */}
                    <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                      <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">每日现金解缴表（收付实现制）</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">充值本金</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">¥{(dailyReport.rechargePrincipalIn / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">在线直付</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">¥{(dailyReport.directPayIn / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">退款流出</p>
                          <p className="text-vr-body font-semibold text-vrerror">¥{(dailyReport.refundOut / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">净现金流入</p>
                          <p className="text-vr-body font-semibold text-vraccent-primary">¥{(dailyReport.netCashFlow / 100).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    {/* 5.2 确权营收表 */}
                    <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                      <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">每日确权营收表（权责发生制）</h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">在线直付确权</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">¥{(dailyReport.directRevenue / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">会员本金确权</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">¥{(dailyReport.memberPrincipalRevenue / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">总确权营业额</p>
                          <p className="text-vr-body font-semibold text-vraccent-primary">¥{(dailyReport.totalRecognizedRevenue / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">积分兑换成本</p>
                          <p className="text-vr-body font-semibold text-vrtext-secondary">{(dailyReport.pointsExchangeCost || 0).toLocaleString()} 积分</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">积分赠送成本</p>
                          <p className="text-vr-body font-semibold text-vrtext-secondary">{(dailyReport.pointsGiftCost || 0).toLocaleString()} 积分</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">优惠券折让成本</p>
                          <p className="text-vr-body font-semibold text-vrtext-secondary">¥{(dailyReport.couponDiscountCost / 100).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    {/* 5.2b 营销凭证流转 */}
                    <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                      <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">营销凭证流转（发放 / 核销 / 在途）</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">手动发放折扣券</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">{(dailyReport.couponGiftCount || 0).toLocaleString()} 张</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">手动发放体验券</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">{(dailyReport.experienceGiftCount || 0).toLocaleString()} 张</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">活动发放折扣券</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">{(dailyReport.couponCampaignCount || 0).toLocaleString()} 张</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">活动发放体验券</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">{(dailyReport.experienceCampaignCount || 0).toLocaleString()} 张</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">折扣券核销</p>
                          <p className="text-vr-body font-semibold text-vraccent-primary">{(dailyReport.couponUsedCount || 0).toLocaleString()} 张</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">体验券核销</p>
                          <p className="text-vr-body font-semibold text-vraccent-primary">{(dailyReport.experienceUsedCount || 0).toLocaleString()} 张</p>
                        </div>
                      </div>
                    </div>

                    {/* 5.3 负债存量 */}
                    <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                      <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">门店负债存量监控台</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">总真实负债（本金）</p>
                          <p className="text-vr-body font-semibold text-vrtext-primary">¥{(dailyReport.totalPrincipalLiability / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">虚拟负债池（赠送）</p>
                          <p className="text-vr-body font-semibold text-vrtext-secondary">¥{(dailyReport.totalBonusLiability / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">积分负债池</p>
                          <p className="text-vr-body font-semibold text-vraccent-primary">{(dailyReport.pointsLiability || 0).toLocaleString()} 积分</p>
                        </div>
                        <div className="bg-vrbg-surface rounded-lg p-3">
                          <p className="text-vr-caption text-vrtext-tertiary">沉睡本金（90天无流水）</p>
                          <p className="text-vr-body font-semibold text-vrwarning">¥{(dailyReport.dormantPrincipal / 100).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-12 text-center text-vrtext-tertiary text-vr-body-sm">
                    该日期暂无报表数据，系统将每日 00:05 自动生成
                  </div>
                )
              ) : totalSummary ? (
                <div className="space-y-4">
                  {/* 累计现金解缴表 */}
                  <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                    <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">累计现金解缴表（收付实现制）</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计充值本金</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">¥{(totalSummary.totalRechargePrincipalIn / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计在线直付</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">¥{(totalSummary.totalDirectPayIn / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计退款流出</p>
                        <p className="text-vr-body font-semibold text-vrerror">¥{(totalSummary.totalRefundOut / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计净现金流入</p>
                        <p className="text-vr-body font-semibold text-vraccent-primary">¥{(totalSummary.totalNetCashFlow / 100).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* 累计确权营收表 */}
                  <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                    <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">累计确权营收表（权责发生制）</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计在线直付确权</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">¥{(totalSummary.totalDirectRevenue / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计会员本金确权</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">¥{(totalSummary.totalMemberPrincipalRevenue / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计确权营业额</p>
                        <p className="text-vr-body font-semibold text-vraccent-primary">¥{(totalSummary.totalRecognizedRevenue / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计积分兑换成本</p>
                        <p className="text-vr-body font-semibold text-vrtext-secondary">{(totalSummary.totalPointsExchangeCost || 0).toLocaleString()} 积分</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计积分赠送成本</p>
                        <p className="text-vr-body font-semibold text-vrtext-secondary">{(totalSummary.totalPointsGiftCost || 0).toLocaleString()} 积分</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计优惠券折让成本</p>
                        <p className="text-vr-body font-semibold text-vrtext-secondary">¥{(totalSummary.totalCouponDiscountCost / 100).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* 累计营销凭证流转 */}
                  <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                    <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">累计营销凭证流转</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计手动发放折扣券</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">{(totalSummary.totalCouponGift || 0).toLocaleString()} 张</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计手动发放体验券</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">{(totalSummary.totalExperienceGift || 0).toLocaleString()} 张</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计活动发放折扣券</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">{(totalSummary.totalCouponCampaign || 0).toLocaleString()} 张</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计活动发放体验券</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">{(totalSummary.totalExperienceCampaign || 0).toLocaleString()} 张</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计折扣券核销</p>
                        <p className="text-vr-body font-semibold text-vraccent-primary">{(totalSummary.totalCouponUsed || 0).toLocaleString()} 张</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">累计体验券核销</p>
                        <p className="text-vr-body font-semibold text-vraccent-primary">{(totalSummary.totalExperienceUsed || 0).toLocaleString()} 张</p>
                      </div>
                    </div>
                  </div>

                  {/* 负债存量 */}
                  <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
                    <h3 className="text-vr-body font-medium text-vrtext-primary mb-3">门店负债存量监控台</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">总真实负债（本金）</p>
                        <p className="text-vr-body font-semibold text-vrtext-primary">¥{(totalSummary.totalPrincipalLiability / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">虚拟负债池（赠送）</p>
                        <p className="text-vr-body font-semibold text-vrtext-secondary">¥{(totalSummary.totalBonusLiability / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">积分负债池</p>
                        <p className="text-vr-body font-semibold text-vraccent-primary">{(totalSummary.totalPointsLiability || 0).toLocaleString()} 积分</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">沉睡本金（90天无流水）</p>
                        <p className="text-vr-body font-semibold text-vrwarning">¥{(totalSummary.dormantPrincipal / 100).toLocaleString()}</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">在途折扣券</p>
                        <p className="text-vr-body font-semibold text-vrtext-secondary">{(totalSummary.totalCouponUnused || 0).toLocaleString()} 张</p>
                      </div>
                      <div className="bg-vrbg-surface rounded-lg p-3">
                        <p className="text-vr-caption text-vrtext-tertiary">在途体验券</p>
                        <p className="text-vr-body font-semibold text-vrtext-secondary">{(totalSummary.totalExperienceUnused || 0).toLocaleString()} 张</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-12 text-center text-vrtext-tertiary text-vr-body-sm">
                  加载中...
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'recon' && reconSubTab === 'exceptions' && (
            <motion.div
              key="recon-exceptions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* 二级 Tab 切换 */}
              <div className="flex items-center gap-1 bg-vrbg-surface rounded-lg p-1 w-fit">
                <button
                  onClick={() => setReconSubTab('daily')}
                  className={cn(
                    'px-3 py-1 rounded text-vr-body-sm transition-colors',
                    (reconSubTab as string) === 'daily'
                      ? 'bg-vraccent-primary text-white'
                      : 'text-vrtext-secondary hover:text-vrtext-primary'
                  )}
                >
                  每日报表
                </button>
                <button
                  onClick={() => setReconSubTab('exceptions')}
                  className={cn(
                    'px-3 py-1 rounded text-vr-body-sm transition-colors',
                    reconSubTab === 'exceptions'
                      ? 'bg-vraccent-primary text-white'
                      : 'text-vrtext-secondary hover:text-vrtext-primary'
                  )}
                >
                  对账异常
                </button>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-vrtext-primary">对账异常池</h2>
                <p className="text-vr-body-sm text-vrtext-tertiary mt-1">三方对账差异记录与处理</p>
              </div>
              <ReconExceptionsPanel />
            </motion.div>
          )}

          {/* ─── Device Logs Tab ─── */}
          {activeTab === 'deviceLogs' && (
            <motion.div
              key="deviceLogs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-lg font-semibold text-vrtext-primary">设备日志管理</h2>
                <p className="text-vr-body-sm text-vrtext-tertiary mt-1">头显设备运行日志录入与硬件对账统计</p>
              </div>
              <DeviceLogPanel venues={venues} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Order Detail Drawer ─── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">订单详情</SheetTitle>
                <SheetDescription className="text-vr-caption text-vrtext-tertiary mt-1">
                  {detailOrder ? `订单号: ${detailOrder.orderNo}` : detailLoading ? '加载中...' : '订单不存在'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {detailLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-vraccent-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !detailOrder ? (
              <div className="text-center py-20 text-vrtext-tertiary text-vr-body-sm">订单不存在或已删除</div>
            ) : (
              <>
                {/* Status Timeline */}
                <div className="space-y-4">
                  <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">订单状态</h4>
                  <div className="relative pl-3">
                    {(() => {
                      const statusLower = detailOrder.status.toLowerCase()
                      const timeline = [
                        { time: detailOrder.createdAt ? format(new Date(detailOrder.createdAt), 'yyyy-MM-dd HH:mm') : '-', status: '已提交', desc: '订单已创建', completed: true },
                        { time: statusLower === 'pending' ? (detailOrder.createdAt ? format(new Date(detailOrder.createdAt), 'yyyy-MM-dd HH:mm') : '-') : statusLower !== 'cancelled' ? (detailOrder.paidAt ? format(new Date(detailOrder.paidAt), 'yyyy-MM-dd HH:mm') : '-') : '', status: statusLower === 'cancelled' ? '已取消' : '未付款', desc: statusLower === 'cancelled' ? '订单已取消' : '等待用户付款', completed: statusLower !== 'pending' },
                        { time: statusLower === 'paid' || statusLower === 'completed' ? (detailOrder.paidAt ? format(new Date(detailOrder.paidAt), 'yyyy-MM-dd HH:mm') : '-') : '', status: '已付款', desc: '订单已付款', completed: statusLower === 'paid' || statusLower === 'completed' },
                        { time: statusLower === 'completed' ? (detailOrder.bookingTime || '-') : '', status: '已核销', desc: '体验已核销', completed: statusLower === 'completed' },
                      ]
                      return timeline.map((item, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.08, duration: 0.3 }}
                          className="relative flex gap-4 pb-5 last:pb-0"
                        >
                          {idx < timeline.length - 1 && (
                            <div className={cn(
                              'absolute left-[7px] top-4 w-[2px] h-[calc(100%-16px)]',
                              item.completed && timeline[idx + 1].completed ? 'bg-vraccent-primary' : 'bg-vrbg-elevated'
                            )} />
                          )}
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
                      ))
                    })()}
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
                      { label: '预约场地', value: detailOrder.venueName || detailOrder.booking?.venue?.name || '-', icon: <MapPin className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '预约时间', value: detailOrder.bookingTime || '-', icon: <Calendar className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '游戏', value: detailOrder.booking?.game?.title || 'VR体验', icon: <Gamepad2 className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '预约类型', value: detailOrder.userId ? '会员预约' : '散客预约', icon: <User className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '预约人数', value: detailOrder.booking?.personCount ?? '-', icon: <User className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '预约人', value: detailOrder.booking?.personName || detailOrder.customer || '-', icon: <User className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '联系电话', value: detailOrder.booking?.personPhone || detailOrder.phone || detailOrder.user?.phone || '-', icon: <Phone className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '订单金额', value: '', icon: <Receipt className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '支付方式', value: payMethodLabelMap[detailOrder.payMethod || ''] || detailOrder.payMethod || '-', icon: <PaymentIcon className="w-4 h-4 text-vrtext-muted" /> },
                      { label: '创建时间', value: detailOrder.createdAt ? format(new Date(detailOrder.createdAt), 'yyyy-MM-dd HH:mm') : '-', icon: <Clock className="w-4 h-4 text-vrtext-muted" /> },
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
                          {item.label === '订单金额'
                            ? `¥${((detailOrder.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Current Status */}
                <div className="flex items-center justify-center py-2">
                  {(() => {
                    const statusLower = detailOrder.status.toLowerCase()
                    const cfg: Record<string, { bg: string; text: string; label: string }> = {
                      pending: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', label: '未付款' },
                      paid: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary', label: '已付款' },
                      completed: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess', label: '已核销' },
                      cancelled: { bg: 'bg-vrerror/15', text: 'text-vrerror', label: '已取消' },
                      refunding: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', label: '退款中' },
                      refunded: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted', label: '已退款' },
                    }
                    const c = cfg[statusLower] || { bg: 'bg-vrbg-elevated', text: 'text-vrtext-secondary', label: detailOrder.status }
                    return (
                      <span className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-vr-body-sm font-medium', c.bg, c.text)}>
                        {c.label}
                      </span>
                    )
                  })()}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Reconcile Detail Sheet */}
      <Sheet open={reconcileDetailOpen} onOpenChange={setReconcileDetailOpen}>
        <SheetContent className="w-[520px] bg-vrbg-card border-vrborder-subtle overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-vrtext-primary">差异明细</SheetTitle>
            <SheetDescription className="text-vrtext-secondary">
              {reconcileDetailData ? `共 ${reconcileDetailData.items.length} 条差异记录` : '加载中...'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {reconcileDetailData?.items.map((item) => (
              <div key={item.id} className="bg-vrbg-surface rounded-lg p-3 border border-vrborder-subtle">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-vr-body-sm text-vrtext-primary font-medium">{item.title}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-vr-caption font-medium',
                      item.diff !== 0 ? 'text-red-400' : 'text-emerald-400'
                    )}>
                      差异: {item.unit === '元' ? `¥${(item.diff / 100).toLocaleString()}` : `${item.diff.toLocaleString()}分`}
                    </span>
                    {item.diff !== 0 && reconcileDetailParams && (
                      <button
                        onClick={() => {
                          if (window.confirm(`确认修复「${item.title}」的差异 ${item.diff}${item.unit === '元' ? '元' : '分'}？\n将创建调整流水以平账。`)) {
                            fixReconcileDiffMut.mutate({
                              type: reconcileDetailParams.type,
                              targetId: item.id,
                              diff: item.diff,
                              date: reconcileDetailParams.date,
                              mode: reconcileDetailData?.mode,
                            })
                          }
                        }}
                        disabled={fixReconcileDiffMut.isPending}
                        className="text-xs px-2 py-0.5 rounded bg-vraccent-primary/10 text-vraccent-primary hover:bg-vraccent-primary/20 disabled:opacity-50 transition-colors"
                      >
                        {fixReconcileDiffMut.isPending ? '修复中...' : '修复'}
                      </button>
                    )}
                  </div>
                </div>
                {item.subtitle && (
                  <div className="text-vr-caption text-vrtext-tertiary mb-1">{item.subtitle}</div>
                )}
                <div className="flex items-center gap-3 text-vr-caption text-vrtext-secondary">
                  <span>实际: {item.unit === '元' ? `¥${(item.actual / 100).toLocaleString()}` : `${item.actual.toLocaleString()}${item.unit || '分'}`}</span>
                  <span>期望: {item.unit === '元' ? `¥${(item.expected / 100).toLocaleString()}` : `${item.expected.toLocaleString()}${item.unit || '分'}`}</span>
                </div>
                <div className="mt-1 text-vr-caption">
                  <span className="text-vrtext-secondary">原因: </span>
                  <span className="text-vrtext-primary">{item.reason}</span>
                </div>
              </div>
            ))}
            {reconcileDetailData && reconcileDetailData.items.length === 0 && (
              <div className="text-center text-vr-caption text-vrtext-tertiary py-8">暂无差异明细</div>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </Layout>
  )
}
