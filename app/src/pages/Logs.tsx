import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search,
  FileText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Activity,
  User,
  MapPin,
  Settings,
  Users,
  Home,
  Package,
  CreditCard,
  Bookmark,
  AlertCircle,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { getLogs, getLogTypes } from '@/api/logs'
import type { OperationLog } from '@/api/logs'
import { cn } from '@/lib/utils'

/* ─── Animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.3, ease: [0, 0, 0.2, 1] as [number, number, number, number] },
  },
}

/* ─── Type icon map ─── */
const typeIconMap: Record<string, React.ReactNode> = {
  '新增场地': <Home className="w-3.5 h-3.5" />,
  '编辑场地': <Home className="w-3.5 h-3.5" />,
  '删除场地': <Home className="w-3.5 h-3.5" />,
  '新增预约': <Bookmark className="w-3.5 h-3.5" />,
  '编辑预约': <Bookmark className="w-3.5 h-3.5" />,
  '取消预约': <Bookmark className="w-3.5 h-3.5" />,
  '创建订单': <CreditCard className="w-3.5 h-3.5" />,
  '修改订单状态': <CreditCard className="w-3.5 h-3.5" />,
  '订单支付': <CreditCard className="w-3.5 h-3.5" />,
  '取消订单': <CreditCard className="w-3.5 h-3.5" />,
  '订单退款': <CreditCard className="w-3.5 h-3.5" />,
  '编辑用户': <Users className="w-3.5 h-3.5" />,
  '删除用户': <Users className="w-3.5 h-3.5" />,
  '新增设备': <Package className="w-3.5 h-3.5" />,
  '编辑设备': <Package className="w-3.5 h-3.5" />,
  '删除设备': <Package className="w-3.5 h-3.5" />,
  '设备维护': <Package className="w-3.5 h-3.5" />,
  '更新设置': <Settings className="w-3.5 h-3.5" />,
  '批量更新设置': <Settings className="w-3.5 h-3.5" />,
}

const typeColorMap: Record<string, { bg: string; text: string }> = {
  '新增场地': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '编辑场地': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '删除场地': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '新增预约': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '编辑预约': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '取消预约': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '创建订单': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '修改订单状态': { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
  '订单支付': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '取消订单': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '订单退款': { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
  '编辑用户': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '删除用户': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '新增设备': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '编辑设备': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '删除设备': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '设备维护': { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
  '更新设置': { bg: 'bg-vrpurple/15', text: 'text-vrpurple' },
  '批量更新设置': { bg: 'bg-vrpurple/15', text: 'text-vrpurple' },
}

function TypeBadge({ type }: { type: string }) {
  const colors = typeColorMap[type] || { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-tertiary' }
  const icon = typeIconMap[type] || <Activity className="w-3.5 h-3.5" />
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-vr-caption font-medium', colors.bg, colors.text)}>
      {icon}
      {type}
    </span>
  )
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ─── Main Page ─── */
export default function Logs() {
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // 获取日志类型统计
  const { data: typeData } = useQuery({
    queryKey: ['logTypes'],
    queryFn: () => getLogTypes(),
  })
  const typeStats = typeData || []

  // 获取日志列表
  const { data: logData, isLoading } = useQuery({
    queryKey: ['logs', selectedType, search, page],
    queryFn: () => getLogs({
      type: selectedType === 'all' ? undefined : selectedType,
      operator: search || undefined,
      page,
      pageSize,
    }),
  })

  const logs: OperationLog[] = logData?.data || []
  const total = logData?.meta?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const typeOptions = useMemo(() => {
    const opts = [{ key: 'all', label: '全部', count: total }]
    typeStats.forEach((t: { type: string; count: number }) => {
      opts.push({ key: t.type, label: t.type, count: t.count })
    })
    return opts
  }, [typeStats, total])

  return (
    <Layout breadcrumb={['系统管理', '操作日志']}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-5"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div>
            <h1 className="text-vr-h2 text-vrtext-primary font-semibold">操作日志</h1>
            <p className="text-vr-body text-vrtext-tertiary mt-1">
              记录系统中所有关键操作，便于审计和追溯
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-vr-body-sm text-vrtext-tertiary">
              共 <span className="text-vrtext-primary font-medium">{total}</span> 条记录
            </div>
          </div>
        </motion.div>

        {/* Stats cards */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {typeStats.slice(0, 4).map((t: { type: string; count: number }) => (
            <div
              key={t.type}
              className="bg-vrbg-card border border-vrborder-DEFAULT rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <TypeBadge type={t.type} />
              </div>
              <div className="text-vr-h3 text-vrtext-primary font-semibold">{t.count}</div>
              <div className="text-vr-caption text-vrtext-tertiary">次操作</div>
            </div>
          ))}
        </motion.div>

        {/* Filters */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex gap-2 overflow-x-auto pb-1">
            {typeOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setSelectedType(opt.key); setPage(1) }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-vr-body-sm font-medium whitespace-nowrap transition-colors',
                  selectedType === opt.key
                    ? 'bg-vr-blue text-white'
                    : 'bg-vrbg-card border border-vrborder-DEFAULT text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                {opt.label}
                <span className={cn(
                  'text-xs',
                  selectedType === opt.key ? 'text-white/70' : 'text-vrtext-tertiary'
                )}>
                  {opt.count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-tertiary" />
            <input
              type="text"
              placeholder="搜索操作人..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full sm:w-64 h-10 pl-9 pr-4 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue"
            />
          </div>
        </motion.div>

        {/* Table */}
        <motion.div variants={itemVariants} className="bg-vrbg-card border border-vrborder-DEFAULT rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-vrborder-DEFAULT">
                  <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作类型</th>
                  <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作内容</th>
                  <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作人</th>
                  <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">IP地址</th>
                  <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作时间</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-vrtext-tertiary">
                      <div className="flex items-center justify-center gap-2">
                        <Activity className="w-4 h-4 animate-spin" />
                        加载中...
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <FileText className="w-10 h-10 text-vrtext-muted mx-auto mb-3" />
                      <p className="text-vr-body text-vrtext-tertiary">暂无操作日志</p>
                      <p className="text-vr-caption text-vrtext-muted mt-1">进行增删改操作后会自动记录</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className="border-b border-vrborder-DEFAULT last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <TypeBadge type={log.type} />
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-vr-body-sm text-vrtext-secondary max-w-xs truncate block" title={log.content}>
                          {log.content}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-vr-blue/15 flex items-center justify-center">
                            <User className="w-3 h-3 text-vr-blue" />
                          </div>
                          <span className="text-vr-body-sm text-vrtext-primary">{log.operator}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-vr-caption text-vrtext-tertiary font-mono">{log.ip || '-'}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-vr-caption text-vrtext-tertiary">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {formatDateTime(log.createdAt)}
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-vrborder-DEFAULT">
              <div className="text-vr-caption text-vrtext-tertiary">
                第 {page} / {totalPages} 页，共 {total} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-vrborder-DEFAULT text-vr-body-sm text-vrtext-secondary hover:text-vrtext-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-vrborder-DEFAULT text-vr-body-sm text-vrtext-secondary hover:text-vrtext-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
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
