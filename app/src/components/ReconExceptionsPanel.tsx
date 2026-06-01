import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, CheckCircle, Clock, Loader2, Play, RefreshCw,
  ShieldAlert, EyeOff, CheckCheck, Calendar, Trash2, Download,
  Filter,
} from 'lucide-react'
import { format, subDays } from 'date-fns'
import { toast } from 'sonner'
import ReconConfigPanel from '@/components/ReconConfigPanel'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'

interface ReconBatch {
  id: string
  reconDate: string
  status: string
  bizTotalCount: number
  channelTotalCount: number
  matchedCount: number
  exceptionCount: number
  matchedAmount: number
  exceptionAmount: number
  // 各维度明细
  orderPayMatchedCount: number
  orderPayExceptionCount: number
  orderTxMatchedCount: number
  orderTxExceptionCount: number
  rechargeMatchedCount: number
  rechargeExceptionCount: number
  refundMatchedCount: number
  refundExceptionCount: number
  errorMessage?: string
  startedAt?: string
  completedAt?: string
}

interface ReconException {
  id: string
  exceptionType: string
  exceptionStatus: string
  bizType?: string
  bizOrderNo?: string
  bizAmount?: number
  channel?: string
  channelTransactionId?: string
  channelAmount?: number
  diffAmount: number
  remark?: string
  handleRemark?: string
  handlerName?: string
  handledAt?: string
  createdAt: string
  batch?: { reconDate: string }
}

async function getBatches() {
  const res = await apiClient.get('/recon/batches', { params: { pageSize: 30 } })
  return (res.data.data || []) as ReconBatch[]
}

async function getExceptions(batchId?: string, dateFrom?: string, dateTo?: string) {
  const params: any = { pageSize: 500 }
  if (batchId) params.batchId = batchId
  if (dateFrom) params.dateFrom = dateFrom
  if (dateTo) params.dateTo = dateTo
  const res = await apiClient.get('/recon/exceptions', { params })
  return (res.data.data || []) as ReconException[]
}

async function runRecon(date: string) {
  const res = await apiClient.post('/recon/run', { date })
  return res.data
}

async function handleException(id: string, action: string, remark?: string) {
  const res = await apiClient.put(`/recon/exceptions/${id}/handle`, { action, remark })
  return res.data
}

async function clearReconData() {
  const res = await apiClient.delete('/recon/clear')
  return res.data
}

const statusMap: Record<string, { label: string; color: string; icon?: any }> = {
  SUCCESS: { label: '成功', color: 'text-emerald-400', icon: CheckCircle },
  FAILED: { label: '失败', color: 'text-red-400', icon: AlertTriangle },
  RUNNING: { label: '执行中', color: 'text-amber-400', icon: Loader2 },
  PENDING: { label: '待处理', color: 'text-amber-400', icon: Clock },
  MANUAL_FIXED: { label: '已人工处理', color: 'text-blue-400', icon: CheckCheck },
  AUTO_FIXED: { label: '已自动修复', color: 'text-emerald-400', icon: CheckCircle },
  FROZEN: { label: '已冻结', color: 'text-red-400', icon: ShieldAlert },
  REFUNDED: { label: '已退款', color: 'text-violet-400', icon: CheckCheck },
  IGNORED: { label: '已忽略', color: 'text-gray-400', icon: EyeOff },
}

const exceptionTypeMap: Record<string, { label: string; severity: 'high' | 'medium' | 'low' }> = {
  LONG: { label: '长款', severity: 'high' },
  SHORT: { label: '短款', severity: 'high' },
  AMOUNT_MISMATCH: { label: '金额不符', severity: 'medium' },
  STATUS_MISMATCH: { label: '状态不符', severity: 'medium' },
  FEE_MISMATCH: { label: '手续费差异', severity: 'low' },
  DUPLICATE: { label: '重复流水', severity: 'low' },
  HARDWARE_MISMATCH: { label: '硬件差异', severity: 'high' },
  UNKNOWN: { label: '未知异常', severity: 'medium' },
}

function isBizException(e: ReconException): boolean {
  if (e.exceptionType === 'HARDWARE_MISMATCH') return false
  if (e.exceptionType === 'STATUS_MISMATCH' && e.bizType === 'USER') return false
  return true
}

function isSystemException(e: ReconException): boolean {
  if (e.exceptionType === 'HARDWARE_MISMATCH') return true
  if (e.exceptionType === 'STATUS_MISMATCH' && e.bizType === 'USER') return true
  return false
}

export default function ReconExceptionsPanel() {
  const today = format(new Date(), 'yyyy-MM-dd')
  // 默认范围：本月1号到今天
  const now = new Date()
  const defaultStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')

  const [dateFrom, setDateFrom] = useState(defaultStart)
  const [dateTo, setDateTo] = useState(today)
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: batches, isLoading: batchesLoading, error: batchesError } = useQuery({
    queryKey: ['recon-batches'],
    queryFn: getBatches,
  })

  const filteredBatches = useMemo(() => {
    if (!batches) return []
    return batches.filter((b) => {
      if (!b.reconDate) return false
      if (dateFrom && b.reconDate < dateFrom) return false
      if (dateTo && b.reconDate > dateTo) return false
      return true
    })
  }, [batches, dateFrom, dateTo])

  const { data: exceptions, isLoading: excLoading, error: excError } = useQuery({
    queryKey: ['recon-exceptions', selectedBatch, dateFrom, dateTo],
    queryFn: () => getExceptions(selectedBatch || undefined, dateFrom, dateTo),
  })

  const apiError = batchesError || excError
  const apiErrorMsg = (apiError as any)?.response?.data?.message || (apiError as any)?.message

  // 范围对账：对账日期范围内的每一天
  const runReconMut = useMutation({
    mutationFn: async () => {
      if (!dateFrom || !dateTo) {
        throw new Error('请先选择日期范围')
      }
      const start = new Date(dateFrom + 'T00:00:00')
      const end = new Date(dateTo + 'T00:00:00')
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      if (days > 31) {
        throw new Error('一次最多对账31天，请缩小范围')
      }
      let success = 0
      let skipped = 0
      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * 86400000)
        const dateStr = format(d, 'yyyy-MM-dd')
        try {
          const res = await runRecon(dateStr)
          if (res?.message?.includes('跳过')) {
            skipped++
          } else {
            success++
          }
        } catch (e: any) {
          console.error(`对账 ${dateStr} 失败:`, e)
        }
      }
      return { success, skipped, total: days }
    },
    onSuccess: (data) => {
      toast.success(`对账完成: ${data.success} 天成功, ${data.skipped} 天已存在, 共 ${data.total} 天`)
      queryClient.invalidateQueries({ queryKey: ['recon-batches'] })
      queryClient.invalidateQueries({ queryKey: ['recon-exceptions'] })
    },
    onError: (err: any) => {
      toast.error(err?.message || '对账失败，请检查后端服务是否已重启')
    },
  })

  const handleMut = useMutation({
    mutationFn: ({ id, action, remark }: { id: string; action: string; remark?: string }) =>
      handleException(id, action, remark),
    onSuccess: () => {
      toast.success('处理完成')
      queryClient.invalidateQueries({ queryKey: ['recon-exceptions'] })
      queryClient.invalidateQueries({ queryKey: ['recon-batches'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '处理失败')
    },
  })

  const clearMut = useMutation({
    mutationFn: clearReconData,
    onSuccess: (data) => {
      toast.success(`已清空 ${data.data?.deletedBatches || 0} 个批次、${data.data?.deletedExceptions || 0} 条异常`)
      queryClient.invalidateQueries({ queryKey: ['recon-batches'] })
      queryClient.invalidateQueries({ queryKey: ['recon-exceptions'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '清理失败')
    },
  })

  const latestBatch = batches?.[0]

  // ===== 按日期范围统计各维度 =====
  const orderPayMatched = filteredBatches.reduce((s, b) => s + (b.orderPayMatchedCount || 0), 0)
  const orderPayExc = filteredBatches.reduce((s, b) => s + (b.orderPayExceptionCount || 0), 0)
  const orderTxMatched = filteredBatches.reduce((s, b) => s + (b.orderTxMatchedCount || 0), 0)
  const orderTxExc = filteredBatches.reduce((s, b) => s + (b.orderTxExceptionCount || 0), 0)
  const rechargeMatched = filteredBatches.reduce((s, b) => s + (b.rechargeMatchedCount || 0), 0)
  const rechargeExc = filteredBatches.reduce((s, b) => s + (b.rechargeExceptionCount || 0), 0)
  const refundMatched = filteredBatches.reduce((s, b) => s + (b.refundMatchedCount || 0), 0)
  const refundExc = filteredBatches.reduce((s, b) => s + (b.refundExceptionCount || 0), 0)

  const sysExceptionTotal = exceptions?.filter(isSystemException).length || 0
  const pendingTotal = exceptions?.filter((e) => e.exceptionStatus === 'PENDING').length || 0

  const pointsExceptions = exceptions?.filter((e) => e.exceptionType === 'STATUS_MISMATCH' && e.bizType === 'USER') || []
  const pointsPending = pointsExceptions.filter((e) => e.exceptionStatus === 'PENDING').length
  const pointsTotal = pointsExceptions.length

  const hardwareExceptions = exceptions?.filter((e) => e.exceptionType === 'HARDWARE_MISMATCH') || []
  const hardwarePending = hardwareExceptions.filter((e) => e.exceptionStatus === 'PENDING').length
  const hardwareTotal = hardwareExceptions.length

  // ===== 趋势图数据（填充范围内的所有日期） =====
  const trendData = useMemo(() => {
    if (!dateFrom || !dateTo) return []
    const result: { date: string; matched: number; exception: number }[] = []
    const start = new Date(dateFrom + 'T00:00:00')
    const end = new Date(dateTo + 'T00:00:00')
    const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    // 最多显示31天
    const maxDays = Math.min(days, 31)
    const batchMap = new Map(filteredBatches.map((b) => [b.reconDate, b]))
    for (let i = 0; i < maxDays; i++) {
      const d = new Date(start.getTime() + i * 86400000)
      const dateStr = format(d, 'yyyy-MM-dd')
      const batch = batchMap.get(dateStr)
      result.push({
        date: dateStr.slice(5),
        matched: batch?.matchedCount || 0,
        exception: batch?.exceptionCount || 0,
      })
    }
    return result
  }, [filteredBatches, dateFrom, dateTo])

  // ===== 异常类型分布数据 =====
  const typeDistribution = useMemo(() => {
    if (!exceptions || exceptions.length === 0) return []
    const map = new Map<string, number>()
    exceptions.forEach((e) => {
      const label = exceptionTypeMap[e.exceptionType]?.label || e.exceptionType
      map.set(label, (map.get(label) || 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [exceptions])

  const pieColors = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981']

  // 解析硬件差异的 remark JSON
  function parseHardwareRemark(remark: string | null | undefined) {
    if (!remark) return null
    try {
      const data = JSON.parse(remark)
      if (data.venueName) return data as {
        venueName: string
        venueId: string
        orderCreatedAt: string
        orderPaidAt: string | null
        orderUpdatedAt: string
        personCount: number
        payMethod: string
        status: string
        summary?: string
        systemCount?: number
        hardwareCount?: number
        diffRate?: string
      }
    } catch { /* not JSON */ }
    return null
  }

  function exportToCSV() {
    if (!exceptions || exceptions.length === 0) {
      toast.info('没有可导出的异常数据')
      return
    }
    const headers = ['类型', '业务单号', '下单时间', '支付时间', '核销时间', '人数', '差异值', '状态', '备注', '处理人', '处理时间', '创建时间']
    const rows = exceptions.map((e) => {
      const hw = e.exceptionType === 'HARDWARE_MISMATCH' ? parseHardwareRemark(e.handleRemark) : null
      return [
        exceptionTypeMap[e.exceptionType]?.label || e.exceptionType,
        e.bizOrderNo || '-',
        hw?.orderCreatedAt ? new Date(hw.orderCreatedAt).toLocaleString() : '-',
        hw?.orderPaidAt ? new Date(hw.orderPaidAt).toLocaleString() : '-',
        hw?.orderUpdatedAt ? new Date(hw.orderUpdatedAt).toLocaleString() : '-',
        hw?.personCount?.toString() || '-',
        e.exceptionType === 'HARDWARE_MISMATCH' ? `${e.diffAmount}人次` : (e.diffAmount / 100).toFixed(2),
        statusMap[e.exceptionStatus]?.label || e.exceptionStatus,
        hw?.summary || e.handleRemark || '-',
        e.handlerName || '-',
        e.handledAt ? new Date(e.handledAt).toLocaleString() : '-',
        new Date(e.createdAt).toLocaleString(),
      ]
    })
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `对账异常明细_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('导出成功')
  }

  return (
    <div className="space-y-6">
      {/* ===== Top controls ===== */}
      <div className="flex flex-wrap items-center gap-3 bg-vrbg-card border border-vrborder-subtle rounded-xl p-3">
        {/* 日期范围筛选 */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-vrtext-muted" />
          <span className="text-vr-caption text-vrtext-muted">范围</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-2 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
          />
          <span className="text-vrtext-muted">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-2 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
          />
        </div>

        <div className="w-px h-5 bg-vrborder-subtle mx-1" />

        <button
          onClick={() => runReconMut.mutate()}
          disabled={runReconMut.isPending}
          className="h-8 px-3 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
        >
          {runReconMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          手动对账
        </button>

        <button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['recon-batches'] })
            queryClient.invalidateQueries({ queryKey: ['recon-exceptions'] })
          }}
          className="h-8 px-2.5 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {latestBatch && (
          <span className="text-vr-caption text-vrtext-muted ml-auto">
            上次对账: {latestBatch.reconDate} ({statusMap[latestBatch.status]?.label || latestBatch.status})
          </span>
        )}
      </div>

      {/* ===== 业务核对 + 系统核对（紧凑排布） ===== */}
      <div className="grid grid-cols-6 gap-3">
        {/* 4个业务维度 */}
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-lg p-3">
          <p className="text-vr-caption text-vrtext-muted">订单支付核对</p>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{orderPayMatched}</p>
          <p className={cn('text-[11px] mt-0.5', orderPayExc > 0 ? 'text-red-400' : 'text-vrtext-muted')}>
            {orderPayExc > 0 ? `${orderPayExc} 笔异常` : '无异常'}
          </p>
        </div>
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-lg p-3">
          <p className="text-vr-caption text-vrtext-muted">余额支付核对</p>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{orderTxMatched}</p>
          <p className={cn('text-[11px] mt-0.5', orderTxExc > 0 ? 'text-red-400' : 'text-vrtext-muted')}>
            {orderTxExc > 0 ? `${orderTxExc} 笔异常` : '无异常'}
          </p>
        </div>
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-lg p-3">
          <p className="text-vr-caption text-vrtext-muted">充值核对</p>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{rechargeMatched}</p>
          <p className={cn('text-[11px] mt-0.5', rechargeExc > 0 ? 'text-red-400' : 'text-vrtext-muted')}>
            {rechargeExc > 0 ? `${rechargeExc} 笔异常` : '无异常'}
          </p>
        </div>
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-lg p-3">
          <p className="text-vr-caption text-vrtext-muted">退款核对</p>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{refundMatched}</p>
          <p className={cn('text-[11px] mt-0.5', refundExc > 0 ? 'text-red-400' : 'text-vrtext-muted')}>
            {refundExc > 0 ? `${refundExc} 笔异常` : '无异常'}
          </p>
        </div>
        {/* 2个系统核对 */}
        <div className={cn(
          'border rounded-lg p-3 flex items-center gap-2',
          pointsTotal === 0 ? 'bg-emerald-500/5 border-emerald-500/20' : pointsPending > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-blue-500/5 border-blue-500/20'
        )}>
          <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', pointsTotal === 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
            {pointsTotal === 0 ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
          </div>
          <div>
            <p className="text-vr-caption text-vrtext-muted">积分核对</p>
            <p className={cn('text-sm font-bold', pointsTotal === 0 ? 'text-emerald-400' : pointsPending > 0 ? 'text-amber-400' : 'text-blue-400')}>
              {pointsTotal === 0 ? '正常' : `${pointsPending} 待处理`}
            </p>
          </div>
        </div>
        <div className={cn(
          'border rounded-lg p-3 flex items-center gap-2',
          hardwareTotal === 0 ? 'bg-emerald-500/5 border-emerald-500/20' : hardwarePending > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-blue-500/5 border-blue-500/20'
        )}>
          <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', hardwareTotal === 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
            {hardwareTotal === 0 ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
          </div>
          <div>
            <p className="text-vr-caption text-vrtext-muted">硬件核对</p>
            <p className={cn('text-sm font-bold', hardwareTotal === 0 ? 'text-emerald-400' : hardwarePending > 0 ? 'text-amber-400' : 'text-blue-400')}>
              {hardwareTotal === 0 ? '正常' : `${hardwarePending} 待处理`}
            </p>
          </div>
        </div>
      </div>

      {/* ===== Charts ===== */}
      {trendData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
            <h3 className="text-vr-body-sm font-medium text-vrtext-primary mb-3">
              对账趋势（{dateFrom?.slice(5)} ~ {dateTo?.slice(5)}）
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="matchGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="excGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="matched" name="业务核对通过" stroke="#10b981" strokeWidth={2} fill="url(#matchGrad)" />
                <Area type="monotone" dataKey="exception" name="异常笔数" stroke="#ef4444" strokeWidth={2} fill="url(#excGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
            <h3 className="text-vr-body-sm font-medium text-vrtext-primary mb-3">异常类型分布</h3>
            {typeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={typeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {typeDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-vrtext-muted text-sm">
                暂无异常数据
              </div>
            )}
          </div>
        </div>
      )}

      <ReconConfigPanel />

      {apiError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">数据加载失败</span>
          </div>
          <p className="text-red-300/80 text-vr-caption">{apiErrorMsg}</p>
        </div>
      )}

      {/* Batch selector */}
      <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-vr-body-sm font-medium text-vrtext-primary">对账批次</h3>
          {batches && batches.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('确定要清空所有对账批次和异常记录吗？此操作不可恢复。')) {
                  clearMut.mutate()
                }
              }}
              disabled={clearMut.isPending}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-vr-caption text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {clearMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              清理数据
            </button>
          )}
        </div>
        {batchesLoading ? (
          <div className="flex items-center gap-2 text-vrtext-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载中...
          </div>
        ) : !batches || batches.length === 0 ? (
          <div className="text-center py-8 text-vrtext-muted text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            暂无对账批次，请点击「手动对账」开始首次对账
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedBatch(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-vr-caption transition-colors',
                selectedBatch === null
                  ? 'bg-vraccent-primary text-white'
                  : 'bg-vrbg-surface text-vrtext-secondary hover:text-vrtext-primary'
              )}
            >
              全部
            </button>
            {/* 只显示有异常的批次 */}
            {filteredBatches
              .filter((b) => b.exceptionCount > 0)
              .sort((a, b) => b.reconDate.localeCompare(a.reconDate))
              .map((batch) => (
                <button
                  key={batch.id}
                  onClick={() => setSelectedBatch(batch.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-vr-caption transition-colors',
                    selectedBatch === batch.id
                      ? 'bg-vraccent-primary text-white'
                      : 'bg-vrbg-surface text-vrtext-secondary hover:text-vrtext-primary'
                  )}
                >
                  {batch.reconDate}
                  <span className="ml-1 text-[10px] text-red-400">({batch.exceptionCount}异常)</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Exceptions table */}
      <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-vr-body-sm font-medium text-vrtext-primary">异常明细</h3>
          {exceptions && exceptions.length > 0 && (
            <button
              onClick={exportToCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-vr-caption text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-surface transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              导出 CSV
            </button>
          )}
        </div>
        {excLoading ? (
          <div className="flex items-center gap-2 text-vrtext-muted text-sm py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载中...
          </div>
        ) : !exceptions || exceptions.length === 0 ? (
          <div className="text-center py-12 text-vrtext-muted">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无异常记录</p>
            <p className="text-vr-caption mt-1">系统内部数据核对一致</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vrborder-subtle text-vrtext-muted text-vr-caption">
                  <th className="text-left py-2 px-3">类型</th>
                  <th className="text-left py-2 px-3">业务单号</th>
                  <th className="text-left py-2 px-3">下单时间</th>
                  <th className="text-left py-2 px-3">支付时间</th>
                  <th className="text-left py-2 px-3">核销时间</th>
                  <th className="text-right py-2 px-3">人数</th>
                  <th className="text-right py-2 px-3">差异值</th>
                  <th className="text-left py-2 px-3">状态</th>
                  <th className="text-left py-2 px-3">备注</th>
                  <th className="text-right py-2 px-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((exc) => {
                  const typeInfo = exceptionTypeMap[exc.exceptionType]
                  const statusInfo = statusMap[exc.exceptionStatus]
                  const isPending = exc.exceptionStatus === 'PENDING'
                  const hw = exc.exceptionType === 'HARDWARE_MISMATCH' ? parseHardwareRemark(exc.handleRemark) : null
                  return (
                    <tr key={exc.id} className="border-b border-vrborder-subtle/50 hover:bg-vrbg-surface/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-1.5">
                          <span className={cn(
                            'w-2 h-2 rounded-full',
                            typeInfo?.severity === 'high' ? 'bg-red-500' : typeInfo?.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                          )} />
                          <span className="text-vrtext-secondary">{typeInfo?.label || exc.exceptionType}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-vrtext-secondary font-mono text-xs">{exc.bizOrderNo || '-'}</td>
                      <td className="py-2.5 px-3 text-vrtext-muted text-vr-caption whitespace-nowrap">
                        {hw?.orderCreatedAt ? new Date(hw.orderCreatedAt).toLocaleString() : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-vrtext-muted text-vr-caption whitespace-nowrap">
                        {hw?.orderPaidAt ? new Date(hw.orderPaidAt).toLocaleString() : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-vrtext-muted text-vr-caption whitespace-nowrap">
                        {hw?.orderUpdatedAt ? new Date(hw.orderUpdatedAt).toLocaleString() : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-vrtext-muted text-vr-caption">
                        {hw?.personCount ?? '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={cn('font-medium', exc.diffAmount > 0 ? 'text-red-400' : 'text-emerald-400')}>
                          {exc.diffAmount > 0 ? '+' : ''}
                          {exc.exceptionType === 'HARDWARE_MISMATCH'
                            ? `${exc.diffAmount}人次`
                            : `¥${(exc.diffAmount / 100).toFixed(2)}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={cn('text-vr-caption', statusInfo?.color || 'text-vrtext-muted')}>
                          {statusInfo?.label || exc.exceptionStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-vrtext-muted text-vr-caption max-w-[200px] truncate" title={hw?.summary || exc.handleRemark || ''}>
                        {hw?.summary || exc.handleRemark || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1">
                            {exc.exceptionType === 'LONG' && (
                              <>
                                <button
                                  onClick={() => {
                                    const remark = window.prompt('请输入长款处理备注')
                                    if (remark !== null) handleMut.mutate({ id: exc.id, action: 'FIX', remark })
                                  }}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                                >
                                  确认长款
                                </button>
                                <button
                                  onClick={() => toast.info('支付渠道未接入，退款功能暂不可用')}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors"
                                >
                                  原路退回
                                </button>
                              </>
                            )}
                            {exc.exceptionType === 'SHORT' && (
                              <>
                                <button
                                  onClick={() => {
                                    const remark = window.prompt('请输入短款冻结备注')
                                    if (remark !== null) handleMut.mutate({ id: exc.id, action: 'FREEZE', remark })
                                  }}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                  冻结权益
                                </button>
                                <button
                                  onClick={() => handleMut.mutate({ id: exc.id, action: 'IGNORE' })}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition-colors"
                                >
                                  忽略
                                </button>
                              </>
                            )}
                            {['AMOUNT_MISMATCH', 'STATUS_MISMATCH', 'FEE_MISMATCH', 'DUPLICATE', 'UNKNOWN'].includes(exc.exceptionType) && (
                              <>
                                <button
                                  onClick={() => {
                                    const remark = window.prompt('请输入平账备注')
                                    if (remark !== null) handleMut.mutate({ id: exc.id, action: 'FIX', remark })
                                  }}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                                >
                                  确认已处理
                                </button>
                                <button
                                  onClick={() => handleMut.mutate({ id: exc.id, action: 'IGNORE' })}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition-colors"
                                >
                                  忽略
                                </button>
                              </>
                            )}
                            {exc.exceptionType === 'HARDWARE_MISMATCH' && (
                              <>
                                <button
                                  onClick={() => {
                                    const remark = window.prompt('请输入核实备注')
                                    if (remark !== null) handleMut.mutate({ id: exc.id, action: 'FIX', remark })
                                  }}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                                >
                                  已核实
                                </button>
                                <button
                                  onClick={() => handleMut.mutate({ id: exc.id, action: 'IGNORE' })}
                                  disabled={handleMut.isPending}
                                  className="px-2 py-1 rounded text-[10px] bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition-colors"
                                >
                                  忽略
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-vr-caption text-vrtext-muted">
                            {exc.handlerName ? `${exc.handlerName} ${statusMap[exc.exceptionStatus]?.label || '处理'}` : (statusMap[exc.exceptionStatus]?.label || '已处理')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
