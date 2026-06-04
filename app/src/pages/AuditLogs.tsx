import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  Shield,
  Clock,
  User,
  Calendar,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { getAuditLogs, getAuditLogActions, getAuditLogTargetTypes } from '@/api/auditLog'
import { getStaffList } from '@/api/users'
import type { AuditLog } from '@/api/auditLog'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const fieldLabelMap: Record<string, string> = {
  id: 'ID',
  name: '姓名',
  phone: '手机号',
  email: '邮箱',
  status: '状态',
  role: '角色',
  level: '会员等级',
  balance: '余额',
  principalBalance: '本金余额',
  bonusBalance: '赠送余额',
  points: '积分',
  totalSpent: '累计消费',
  totalVisits: '访问次数',
  discountRate: '折扣率',
  amount: '金额',
  originalAmount: '原价',
  couponDiscount: '优惠券折扣',
  discountAmount: '折扣金额',
  payMethod: '支付方式',
  orderNo: '订单号',
  bookingId: '预约ID',
  venueId: '场地ID',
  venueName: '场地名称',
  userId: '用户ID',
  userCouponId: '优惠券ID',
  remark: '备注',
  reason: '原因',
  diff: '差异金额',
  txData: '交易数据',
  source: '来源',
  type: '类型',
  giftReason: '赠送原因',
  giftRemark: '赠送备注',
  trackingNumber: '物流单号',
  address: '地址',
  recipientName: '收件人',
  recipientPhone: '收件电话',
  paidAt: '支付时间',
  usedAt: '使用时间',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  cancelledAt: '取消时间',
  fulfilledAt: '完成时间',
  validFrom: '有效开始',
  validTo: '有效结束',
}

function formatDiffValue(val: any): string {
  if (val === undefined || val === null) return '空'
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? '是' : '否'
  // 对对象做简化展示
  const str = JSON.stringify(val)
  if (str.length > 120) return str.slice(0, 120) + '...'
  return str
}

function JsonDiff({ before, after }: { before?: Record<string, any>; after?: Record<string, any> }) {
  const allKeys = useMemo(() => {
    const keys = new Set<string>()
    if (before) Object.keys(before).forEach((k) => keys.add(k))
    if (after) Object.keys(after).forEach((k) => keys.add(k))
    return Array.from(keys).sort()
  }, [before, after])

  if (!before && !after) {
    return <p className="text-vr-caption text-vrtext-muted">无数据</p>
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <p className="text-vr-caption text-vrtext-secondary font-medium mb-2">变更前</p>
        {allKeys.map((key) => {
          const val = before?.[key]
          const changed = JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])
          return (
            <div key={key} className={cn('text-vr-caption rounded px-2 py-1', changed && 'bg-vrerror/10')}>
              <span className="text-vrtext-tertiary">{fieldLabelMap[key] || key}:</span>{' '}
              <span className={cn('text-vrtext-primary break-all', changed && 'text-vrerror line-through')}>
                {formatDiffValue(val)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="space-y-2">
        <p className="text-vr-caption text-vrtext-secondary font-medium mb-2">变更后</p>
        {allKeys.map((key) => {
          const val = after?.[key]
          const changed = JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])
          return (
            <div key={key} className={cn('text-vr-caption rounded px-2 py-1', changed && 'bg-vrsuccess/10')}>
              <span className="text-vrtext-tertiary">{fieldLabelMap[key] || key}:</span>{' '}
              <span className={cn('text-vrtext-primary break-all', changed && 'text-vrsuccess')}>
                {formatDiffValue(val)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const actionColorMap: Record<string, { bg: string; text: string }> = {
  CREATE: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  UPDATE: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  DELETE: { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  LOGIN: { bg: 'bg-vrpurple/15', text: 'text-vrpurple' },
  LOGOUT: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted' },
  POST: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  PATCH: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  PUT: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  GET: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted' },
}

const actionLabelMap: Record<string, string> = {
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '删除',
  LOGIN: '登录',
  LOGOUT: '登出',
  POST: '提交',
  PATCH: '局部修改',
  PUT: '修改',
  GET: '查询',
}

const targetTypeLabelMap: Record<string, string> = {
  USER: '用户',
  ORDER: '订单',
  BOOKING: '预约',
  VENUE: '场地',
  GAME: '游戏',
  COUPON: '优惠券',
  EQUIPMENT: '设备',
  SETTINGS: '系统设置',
  FINANCE: '财务',
  RECONCILE: '对账',
  POINTS: '积分',
  GIFT: '赠送',
  CAMPAIGN: '营销活动',
  TRIGGER_RULE: '触发规则',
  BALANCE_POINTS: '积分余额',
  POINTS_EXCHANGE: '积分兑换',
  POINTS_DEDUCT: '积分扣减',
}

function ActionBadge({ action }: { action: string }) {
  const colors = actionColorMap[action] || { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-tertiary' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-vr-caption font-medium whitespace-nowrap', colors.bg, colors.text)}>
      {actionLabelMap[action] || action}
    </span>
  )
}

export default function AuditLogs() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [selectedActions, setSelectedActions] = useState<string[]>([])
  const [targetType, setTargetType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: logData, isFetching } = useQuery({
    queryKey: ['auditLogs', startDate, endDate, operatorId, selectedActions, targetType, currentPage, pageSize],
    queryFn: () =>
      getAuditLogs({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        operatorId: operatorId || undefined,
        action: selectedActions.length > 0 ? selectedActions.join(',') : undefined,
        targetType: targetType || undefined,
        page: currentPage,
        pageSize,
      }),
    staleTime: 1000 * 30,
  })

  const { data: staffData } = useQuery({
    queryKey: ['staffList'],
    queryFn: () => getStaffList({ pageSize: 999 }),
    staleTime: 60000,
  })

  const { data: actions } = useQuery({
    queryKey: ['auditLogActions'],
    queryFn: () => getAuditLogActions(),
    staleTime: 60000,
  })

  const { data: targetTypes } = useQuery({
    queryKey: ['auditLogTargetTypes'],
    queryFn: () => getAuditLogTargetTypes(),
    staleTime: 60000,
  })

  const staffList = (staffData?.data || []) as Array<{ id: string; name: string; role: string }>
  const logs: AuditLog[] = logData?.data?.data || []
  const total = logData?.data?.meta?.total || 0
  const totalPages = logData?.data?.meta?.totalPages || 1
  const safePage = Math.min(currentPage, totalPages)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages)
  }

  const toggleAction = (action: string) => {
    setSelectedActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    )
    setCurrentPage(1)
  }

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs
    const q = searchQuery.toLowerCase()
    return logs.filter(
      (log) =>
        log.operatorName.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q) ||
        log.targetLabel?.toLowerCase().includes(q)
    )
  }, [logs, searchQuery])

  return (
    <Layout breadcrumb={['审计日志']}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-vrtext-primary">审计日志</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">系统操作审计与变更追溯</p>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-vrtext-muted" />
            <span className="text-vr-caption text-vrtext-muted">仅财务/超管可见</span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-4 space-y-4">
          <div className="flex flex-col lg:flex-row flex-wrap gap-3">
            {/* Date Range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-vrtext-muted" />
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
            </div>

            {/* Operator */}
            <select
              value={operatorId}
              onChange={(e) => { setOperatorId(e.target.value); setCurrentPage(1) }}
              className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            >
              <option value="">全部操作人</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Target Type */}
            <select
              value={targetType}
              onChange={(e) => { setTargetType(e.target.value); setCurrentPage(1) }}
              className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            >
              <option value="">全部对象类型</option>
              {targetTypes?.map((t) => (
                <option key={t} value={t}>{targetTypeLabelMap[t] || t}</option>
              ))}
            </select>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
              <input
                type="text"
                placeholder="搜索操作人、摘要、对象..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                className="w-full h-9 pl-9 pr-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
          </div>

          {/* Action Multi-select */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-vr-caption text-vrtext-secondary">动作类型：</span>
            {actions?.map((action) => (
              <button
                key={action}
                onClick={() => toggleAction(action)}
                className={cn(
                  'px-3 py-1 rounded-full text-vr-caption font-medium transition-colors border',
                  selectedActions.includes(action)
                    ? 'bg-vraccent-primary text-white border-vraccent-primary'
                    : 'bg-vrbg-surface text-vrtext-secondary border-vrborder-subtle hover:border-vrborder-hover'
                )}
              >
                {action}
              </button>
            ))}
            {selectedActions.length > 0 && (
              <button
                onClick={() => { setSelectedActions([]); setCurrentPage(1) }}
                className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors"
              >
                清除筛选
              </button>
            )}
          </div>
        </div>

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
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[160px]">时间</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">操作人</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[110px]">动作</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">对象</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">变更摘要</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">原因</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">详情</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="wait">
                  {isFetching ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-vrtext-muted">
                        <div className="flex items-center justify-center gap-2">
                          <Clock className="w-4 h-4 animate-spin" />
                          加载中...
                        </div>
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <FileText className="w-10 h-10 text-vrtext-muted mx-auto mb-3" />
                        <p className="text-vr-body text-vrtext-secondary">暂无审计日志</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <>
                        <motion.tr
                          key={log.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={cn(
                            'border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors cursor-pointer',
                            expandedId === log.id && 'bg-vrbg-elevated/40'
                          )}
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-vr-caption text-vrtext-tertiary">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDateTime(log.createdAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-vraccent-primary/15 flex items-center justify-center">
                                <User className="w-3 h-3 text-vraccent-primary" />
                              </div>
                              <span className="text-vr-body-sm text-vrtext-primary whitespace-nowrap">{log.operatorName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <ActionBadge action={log.action} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-vr-body-sm text-vrtext-primary">{log.targetLabel || log.targetId}</span>
                              <span className="text-vr-caption text-vrtext-tertiary">{targetTypeLabelMap[log.targetType] || log.targetType}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-vr-body-sm text-vrtext-secondary max-w-xs truncate block" title={log.summary || log.actionName || ''}>
                              {log.summary || log.actionName || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-vr-caption text-vrtext-tertiary">{log.reason || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {expandedId === log.id ? (
                              <ChevronUp className="w-4 h-4 text-vrtext-muted mx-auto" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-vrtext-muted mx-auto" />
                            )}
                          </td>
                        </motion.tr>
                        {expandedId === log.id && (
                          <tr className="border-t border-vrborder-subtle bg-vrbg-elevated/30">
                            <td colSpan={7} className="px-4 py-4">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                transition={{ duration: 0.25 }}
                              >
                                <p className="text-vr-body-sm text-vrtext-primary font-medium mb-3">变更详情</p>
                                <JsonDiff before={log.beforeValue} after={log.afterValue} />
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

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
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
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
    </Layout>
  )
}
