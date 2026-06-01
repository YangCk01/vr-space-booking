import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  ShieldCheck,
  BarChart3,
  FileText,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { getHealthChecks, getHealthStats } from '@/api/systemHealth'
import type { HealthCheck } from '@/api/systemHealth'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    PASS: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: '通过' },
    WARN: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: '警告' },
    FAIL: { bg: 'bg-vrerror/15', text: 'text-vrerror', icon: <XCircle className="w-3.5 h-3.5" />, label: '异常' },
  }
  const cfg = config[status] || config.PASS
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-vr-caption font-medium', cfg.bg, cfg.text)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

export default function SystemHealth() {
  const [checkType, setCheckType] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Last 7 days
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: healthData, isFetching } = useQuery({
    queryKey: ['healthChecks', checkType, currentPage, pageSize],
    queryFn: () =>
      getHealthChecks({
        checkType: checkType || undefined,
        startDate,
        endDate,
        page: currentPage,
        pageSize,
      }),
    staleTime: 1000 * 30,
  })

  const { data: stats } = useQuery({
    queryKey: ['healthStats'],
    queryFn: () => getHealthStats(),
    staleTime: 1000 * 60,
  })

  const checks: HealthCheck[] = healthData?.data || []
  const total = healthData?.meta?.total || 0
  const totalPages = healthData?.meta?.totalPages || 1
  const safePage = Math.min(currentPage, totalPages)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages)
  }

  const checkTypes = Array.from(new Set(checks.map((c) => c.checkType)))

  const statCards = [
    {
      label: '今日校验项数',
      value: stats?.totalToday ?? '-',
      icon: <BarChart3 className="w-5 h-5 text-vraccent-primary" />,
      color: 'text-vraccent-primary',
    },
    {
      label: '异常数',
      value: stats?.failCount ?? '-',
      icon: <XCircle className="w-5 h-5 text-vrerror" />,
      color: 'text-vrerror',
    },
    {
      label: '通过率',
      value: stats?.passRate !== undefined ? `${stats.passRate}%` : '-',
      icon: <ShieldCheck className="w-5 h-5 text-vrsuccess" />,
      color: 'text-vrsuccess',
    },
  ]

  return (
    <Layout breadcrumb={['设置', '系统健康']}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-vrtext-primary">系统健康检查</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">数据一致性校验与系统健康状态监控</p>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-vrsuccess" />
            <span className="text-vr-caption text-vrtext-muted">最近 7 天</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-vr-body-sm text-vrtext-secondary">{card.label}</span>
                {card.icon}
              </div>
              <div className={cn('text-vr-h2 font-bold', card.color)}>{card.value}</div>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => { setCheckType(''); setCurrentPage(1) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-vr-body-sm font-medium whitespace-nowrap transition-colors',
                checkType === ''
                  ? 'bg-vraccent-primary text-white'
                  : 'bg-vrbg-card border border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary'
              )}
            >
              全部类型
            </button>
            {checkTypes.map((t) => (
              <button
                key={t}
                onClick={() => { setCheckType(t); setCurrentPage(1) }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-vr-body-sm font-medium whitespace-nowrap transition-colors',
                  checkType === t
                    ? 'bg-vraccent-primary text-white'
                    : 'bg-vrbg-card border border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                {t}
              </button>
            ))}
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
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">校验时间</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">校验项</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">类型</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">状态</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[80px]">详情</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="wait">
                  {isFetching ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-vrtext-muted">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          加载中...
                        </div>
                      </td>
                    </tr>
                  ) : checks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <FileText className="w-10 h-10 text-vrtext-muted mx-auto mb-3" />
                        <p className="text-vr-body text-vrtext-secondary">暂无健康检查记录</p>
                      </td>
                    </tr>
                  ) : (
                    checks.map((check) => (
                      <>
                        <motion.tr
                          key={check.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={cn(
                            'border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors cursor-pointer',
                            expandedId === check.id && 'bg-vrbg-elevated/40'
                          )}
                          onClick={() => setExpandedId(expandedId === check.id ? null : check.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-vr-caption text-vrtext-tertiary">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDateTime(check.runAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-vr-body-sm text-vrtext-primary font-medium">{check.checkName}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-vr-caption text-vrtext-secondary bg-vrbg-elevated px-2 py-1 rounded">
                              {check.checkType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={check.status} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {expandedId === check.id ? (
                              <ChevronUp className="w-4 h-4 text-vrtext-muted mx-auto" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-vrtext-muted mx-auto" />
                            )}
                          </td>
                        </motion.tr>
                        {expandedId === check.id && (
                          <tr className="border-t border-vrborder-subtle bg-vrbg-elevated/30">
                            <td colSpan={5} className="px-4 py-4">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                transition={{ duration: 0.25 }}
                                className="space-y-3"
                              >
                                <p className="text-vr-body-sm text-vrtext-primary font-medium">异常详情</p>
                                {check.details ? (
                                  <div className="bg-vrbg-surface rounded-lg p-3 border border-vrborder-subtle">
                                    <p className="text-vr-caption text-vrtext-secondary whitespace-pre-wrap">{check.details}</p>
                                  </div>
                                ) : (
                                  <p className="text-vr-caption text-vrtext-muted">无异常详情</p>
                                )}
                                {(check.expectedValue || check.actualValue) && (
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-vrbg-surface rounded-lg p-3 border border-vrborder-subtle">
                                      <p className="text-vr-caption text-vrtext-secondary mb-1">期望值</p>
                                      <p className="text-vr-body-sm text-vrtext-primary font-mono">{check.expectedValue || '-'}</p>
                                    </div>
                                    <div className="bg-vrbg-surface rounded-lg p-3 border border-vrborder-subtle">
                                      <p className="text-vr-caption text-vrtext-secondary mb-1">实际值</p>
                                      <p className={cn(
                                        'text-vr-body-sm font-mono',
                                        check.status === 'FAIL' ? 'text-vrerror' : 'text-vrtext-primary'
                                      )}>
                                        {check.actualValue || '-'}
                                      </p>
                                    </div>
                                  </div>
                                )}
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
