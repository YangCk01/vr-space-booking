import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Ticket,
  Gift,
  CheckCircle2,
  Percent,
  Coins,
  Sparkles,
  Users,
  Filter,
  BarChart3,
  Eye,
  EyeOff,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { DateFilterPicker } from '@/components/ui/date-filter-picker'
import { cn } from '@/lib/utils'
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from 'recharts'
import { format, subDays } from 'date-fns'
import { getCouponEffects, getCouponEffectSummary } from '@/api/couponEffect'

const tooltipStyle = {
  backgroundColor: '#1E293B',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '8px 12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
}

const couponTypeMap: Record<string, string> = {
  DISCOUNT: '折扣券',
  EXPERIENCE_FREE: '体验券',
}

const sourceMap: Record<string, string> = {
  MANUAL_GIFT: '手动发放',
  CAMPAIGN: '营销活动',
  RECHARGE_BONUS: '充值赠送',
  EXCHANGE: '积分兑换',
  '积分兑换': '积分兑换',
}

const couponTypeOptions = [
  { value: '', label: '全部' },
  { value: 'DISCOUNT', label: '折扣券' },
  { value: 'EXPERIENCE_FREE', label: '体验券' },
]

export default function CouponEffects() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const sevenDaysAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')

  const [startDate, setStartDate] = useState(sevenDaysAgo)
  const [endDate, setEndDate] = useState(today)
  const [couponType, setCouponType] = useState('')
  const [showEmpty, setShowEmpty] = useState(false)

  const { data: reportData } = useQuery({
    queryKey: ['couponEffects', startDate, endDate, couponType],
    queryFn: () =>
      getCouponEffects({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        couponType: couponType || undefined,
      }),
  })

  const { data: summaryData } = useQuery({
    queryKey: ['couponEffects', 'summary', startDate, endDate],
    queryFn: () =>
      getCouponEffectSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  })

  const reports = useMemo(() => {
    const list = reportData || []
    if (showEmpty) return list
    return list.filter(
      (r) => (r.giftedCount || 0) > 0 || (r.usedCount || 0) > 0 || (r.expiredCount || 0) > 0
    )
  }, [reportData, showEmpty])

  const chartData = useMemo(() => {
    const grouped = new Map<
      string,
      {
        date: string
        discountGifted: number
        discountUsed: number
        experienceGifted: number
        experienceUsed: number
      }
    >()
    ;(reportData || []).forEach((r) => {
      const entry = grouped.get(r.date) || {
        date: r.date.slice(5),
        discountGifted: 0,
        discountUsed: 0,
        experienceGifted: 0,
        experienceUsed: 0,
      }
      if (r.couponType === 'DISCOUNT') {
        entry.discountGifted += r.giftedCount
        entry.discountUsed += r.usedCount
      } else if (r.couponType === 'EXPERIENCE_FREE') {
        entry.experienceGifted += r.giftedCount
        entry.experienceUsed += r.usedCount
      }
      grouped.set(r.date, entry)
    })
    return Array.from(grouped.values())
  }, [reportData])

  const discountGifted = summaryData?.discount?.giftedCount || 0
  const discountUsed = summaryData?.discount?.usedCount || 0
  const discountRate = discountGifted > 0 ? (discountUsed / discountGifted) * 100 : 0

  const experienceGifted = summaryData?.experience?.giftedCount || 0
  const experienceUsed = summaryData?.experience?.usedCount || 0
  const experienceRate = experienceGifted > 0 ? (experienceUsed / experienceGifted) * 100 : 0

  const pointsTotal = summaryData?.pointsTotal || 0
  const pointsRecipients = summaryData?.pointsRecipients || 0

  const kpiCards = [
    {
      icon: <Gift className="w-6 h-6 text-blue-400" />,
      iconBg: 'rgba(59,130,246,0.15)',
      label: '折扣券发放数',
      value: discountGifted.toLocaleString(),
    },
    {
      icon: <CheckCircle2 className="w-6 h-6 text-blue-400" />,
      iconBg: 'rgba(59,130,246,0.15)',
      label: '折扣券核销数',
      value: discountUsed.toLocaleString(),
    },
    {
      icon: <Percent className="w-6 h-6 text-blue-400" />,
      iconBg: 'rgba(59,130,246,0.15)',
      label: '折扣券核销率',
      value: `${discountRate.toFixed(1)}%`,
    },
    {
      icon: <Gift className="w-6 h-6 text-emerald-400" />,
      iconBg: 'rgba(16,185,129,0.15)',
      label: '体验券发放数',
      value: experienceGifted.toLocaleString(),
    },
    {
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
      iconBg: 'rgba(16,185,129,0.15)',
      label: '体验券核销数',
      value: experienceUsed.toLocaleString(),
    },
    {
      icon: <Percent className="w-6 h-6 text-emerald-400" />,
      iconBg: 'rgba(16,185,129,0.15)',
      label: '体验券核销率',
      value: `${experienceRate.toFixed(1)}%`,
    },
    {
      icon: <Coins className="w-6 h-6 text-vrerror" />,
      iconBg: 'rgba(239,68,68,0.15)',
      label: '累计券折让成本',
      value: `¥${((summaryData?.totalDiscountCost || 0) / 100).toLocaleString()}`,
    },
    {
      icon: <Sparkles className="w-6 h-6 text-violet-400" />,
      iconBg: 'rgba(139,92,246,0.15)',
      label: '活动积分发放数',
      value: pointsTotal.toLocaleString(),
    },
    {
      icon: <Users className="w-6 h-6 text-violet-400" />,
      iconBg: 'rgba(139,92,246,0.15)',
      label: '活动积分发放人次',
      value: pointsRecipients.toLocaleString(),
    },
  ]

  return (
    <Layout breadcrumb={['数据报表', '营销效果']}>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">营销效果报表</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">优惠券发放与核销数据追踪</p>
          </div>
          <Ticket className="w-8 h-8 text-vraccent-primary" />
        </motion.div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
          <DateFilterPicker
            mode="range"
            startDate={startDate}
            endDate={endDate}
            onChange={({ startDate, endDate }) => {
              setStartDate(startDate)
              setEndDate(endDate)
            }}
          />

          <div className="h-5 w-[1px] bg-vrborder-subtle" />

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-vrtext-muted" />
            <select
              value={couponType}
              onChange={(e) => setCouponType(e.target.value)}
              className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
            >
              {couponTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-5 w-[1px] bg-vrborder-subtle" />

          <button
            onClick={() => setShowEmpty(!showEmpty)}
            className={`flex items-center gap-2 h-9 px-3 rounded-lg text-vr-body-sm border transition-all ${
              showEmpty
                ? 'bg-vraccent-primary/10 border-vraccent-primary text-vraccent-primary'
                : 'bg-vrbg-surface border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary'
            }`}
          >
            {showEmpty ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showEmpty ? '显示空记录' : '隐藏空记录'}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {kpiCards.map((kpi, i) => (
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

        {/* Chart */}
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-vraccent-primary" />
            <h3 className="text-vr-body text-vrtext-primary font-medium">每日券发放与核销趋势</h3>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  axisLine={{ stroke: '#1E293B' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [`${v} 张`, name]}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#F1F5F9', fontSize: 12, fontWeight: 500, marginBottom: 4 }}
                  itemStyle={{ color: '#94A3B8', fontSize: 12 }}
                />
                <Legend
                  wrapperStyle={{ color: '#94A3B8', fontSize: 12 }}
                />
                <Bar
                  dataKey="discountGifted"
                  name="折扣券发放"
                  fill="#0EA5E9"
                  radius={[3, 3, 0, 0]}
                  barSize={12}
                  isAnimationActive
                  animationDuration={800}
                  animationBegin={200}
                />
                <Bar
                  dataKey="discountUsed"
                  name="折扣券核销"
                  fill="#F59E0B"
                  radius={[3, 3, 0, 0]}
                  barSize={12}
                  isAnimationActive
                  animationDuration={800}
                  animationBegin={300}
                />
                <Bar
                  dataKey="experienceGifted"
                  name="体验券发放"
                  fill="#10B981"
                  radius={[3, 3, 0, 0]}
                  barSize={12}
                  isAnimationActive
                  animationDuration={800}
                  animationBegin={400}
                />
                <Bar
                  dataKey="experienceUsed"
                  name="体验券核销"
                  fill="#EC4899"
                  radius={[3, 3, 0, 0]}
                  barSize={12}
                  isAnimationActive
                  animationDuration={800}
                  animationBegin={500}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-vrbg-elevated">
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">日期</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">券类型</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">来源</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">发放数</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">核销数</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">过期数</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">平均订单金额</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">折让成本</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">复购率</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((item, idx) => {
                  const repurchaseRate =
                    item.usedCount > 0 ? ((item.reorderUserCount || 0) / item.usedCount) * 100 : 0
                  return (
                    <motion.tr
                      key={`${item.date}-${item.couponType}-${idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                    >
                      <td className="px-4 py-3 text-vr-body-sm text-vrtext-primary">{item.date}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-vr-caption font-medium"
                          style={{
                            backgroundColor:
                              item.couponType === 'DISCOUNT'
                                ? 'rgba(59,130,246,0.15)'
                                : 'rgba(16,185,129,0.15)',
                            color:
                              item.couponType === 'DISCOUNT' ? '#3B82F6' : '#10B981',
                          }}
                        >
                          {couponTypeMap[item.couponType] || item.couponType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-vr-body-sm text-vrtext-secondary">{sourceMap[item.source] || item.source}</td>
                      <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                        {item.giftedCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                        {item.usedCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                        {item.expiredCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                        ¥{(item.avgOrderAmount / 100).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                        ¥{(item.couponDiscountCost / 100).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-vr-body-sm text-vrtext-primary">
                        {repurchaseRate.toFixed(1)}%
                      </td>
                    </motion.tr>
                  )
                })}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-vrtext-tertiary text-vr-body-sm">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
