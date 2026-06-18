import { useMemo, useState } from 'react'
import type React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, Search, XCircle } from 'lucide-react'
import Layout from '@/components/Layout'
import {
  approveApproval,
  getApprovals,
  rejectApproval,
  type ApprovalRequest,
  type ApprovalStatus,
} from '@/api/approvals'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/lib/permissions'

const scopeTabs = [
  { key: 'todo', label: '待我审批' },
  { key: 'mine', label: '我发起的' },
  { key: 'all', label: '全部审批' },
] as const

const statusTabs: { key: 'all' | ApprovalStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待审批' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已拒绝' },
  { key: 'EXECUTION_FAILED', label: '执行失败' },
]

const typeLabels: Record<string, string> = {
  NO_SHOW_REFUND: '已作废退款处置',
  ORDER_REFUND: '订单退款',
  BALANCE_ADJUST: '余额调整',
  POINTS_ADJUST: '积分调整',
  COUPON_GIFT: '优惠券赠送',
  ORDER_RESTORE: '撤销作废',
  ORDER_STATUS_CHANGE: '订单状态变更',
  BATCH_REFUND: '批量退款',
  BATCH_CANCEL: '批量取消',
  BATCH_VERIFY: '批量核销',
}

const statusConfig: Record<ApprovalStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING: { label: '待审批', cls: 'text-vrwarning bg-vrwarning/10', icon: <Clock className="w-4 h-4" /> },
  APPROVED: { label: '已通过', cls: 'text-vrsuccess bg-vrsuccess/10', icon: <CheckCircle2 className="w-4 h-4" /> },
  REJECTED: { label: '已拒绝', cls: 'text-vrerror bg-vrerror/10', icon: <XCircle className="w-4 h-4" /> },
  CANCELLED: { label: '已取消', cls: 'text-vrtext-muted bg-vrbg-elevated', icon: <XCircle className="w-4 h-4" /> },
  EXECUTION_FAILED: { label: '执行失败', cls: 'text-vrerror bg-vrerror/10', icon: <XCircle className="w-4 h-4" /> },
}

function formatMoney(amount?: number | null) {
  return `¥${((amount || 0) / 100).toFixed(2)}`
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function actionLabel(approval: ApprovalRequest) {
  const action = approval.requestPayload?.action
  if (action === 'NO_REFUND') return '不退款'
  if (action === 'PARTIAL_REFUND') return '部分退款'
  if (action === 'FULL_REFUND') return '全额退款'
  if (approval.type === 'ORDER_REFUND') return '订单退款'
  return '-'
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-vr-body-sm">
      <span className="text-vrtext-muted">{label}</span>
      <span className="text-vrtext-primary text-right">{value}</span>
    </div>
  )
}

export default function Approvals() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [scope, setScope] = useState<(typeof scopeTabs)[number]['key']>('todo')
  const [status, setStatus] = useState<'all' | ApprovalStatus>('PENDING')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ApprovalRequest | null>(null)
  const [comment, setComment] = useState('')

  const canApprove = hasPermission(currentUser, 'approval:approve')

  const { data, isFetching } = useQuery({
    queryKey: ['approvals', scope, status],
    queryFn: () => getApprovals({
      scope,
      status: status === 'all' ? undefined : status,
      page: 1,
      pageSize: 100,
    }),
    staleTime: 1000 * 20,
  })

  const approvals: ApprovalRequest[] = data?.data || []
  const filteredApprovals = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return approvals
    return approvals.filter((item) =>
      [item.targetDesc, item.requesterName, item.reason, item.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(kw))
    )
  }, [approvals, search])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => approveApproval(id, comment),
    onSuccess: () => {
      invalidate()
      setSelected(null)
      setComment('')
    },
    onError: (err: any) => alert('审批通过失败: ' + (err?.response?.data?.message || err?.message || '未知错误')),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => rejectApproval(id, comment),
    onSuccess: () => {
      invalidate()
      setSelected(null)
      setComment('')
    },
    onError: (err: any) => alert('审批拒绝失败: ' + (err?.response?.data?.message || err?.message || '未知错误')),
  })

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-vr-h1 text-vrtext-primary">审批中心</h1>
            <p className="text-vr-body-sm text-vrtext-muted mt-1">异常退款、资金调整、批量操作审批</p>
          </div>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索订单、申请人、原因..."
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-vrbg-card border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-vrborder-subtle">
          <div className="flex items-center gap-2">
            {scopeTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setScope(tab.key)
                  setStatus(tab.key === 'todo' ? 'PENDING' : 'all')
                }}
                className={cn(
                  'px-3 py-3 text-vr-body-sm font-medium border-b-2 transition-colors',
                  scope === tab.key
                    ? 'border-vraccent-primary text-vraccent-primary'
                    : 'border-transparent text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                className={cn(
                  'h-8 px-3 rounded-lg text-vr-body-sm transition-colors',
                  status === tab.key
                    ? 'bg-vraccent-primary text-white'
                    : 'text-vrtext-secondary hover:bg-vrbg-elevated'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-vrbg-elevated">
              <tr className="text-left text-vr-caption text-vrtext-secondary">
                <th className="px-4 py-3 font-medium">审批类型</th>
                <th className="px-4 py-3 font-medium">对象</th>
                <th className="px-4 py-3 font-medium">申请人</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredApprovals.map((item) => {
                const cfg = statusConfig[item.status]
                return (
                  <tr key={item.id} className="border-t border-vrborder-subtle hover:bg-vrbg-elevated/50">
                    <td className="px-4 py-4">
                      <div className="text-vr-body-sm font-medium text-vrtext-primary">{typeLabels[item.type] || item.type}</div>
                      <div className="text-vr-caption text-vrtext-muted mt-1">{actionLabel(item)}</div>
                    </td>
                    <td className="px-4 py-4 text-vr-body-sm text-vrtext-primary">{item.targetDesc || item.targetId}</td>
                    <td className="px-4 py-4">
                      <div className="text-vr-body-sm text-vrtext-primary">{item.requesterName}</div>
                      <div className="text-vr-caption text-vrtext-muted">{item.requesterRole}</div>
                    </td>
                    <td className="px-4 py-4 text-vr-body-sm font-semibold text-vrtext-primary">{formatMoney(item.amount)}</td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-vr-caption font-medium', cfg.cls)}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-vr-body-sm text-vrtext-secondary">{formatTime(item.createdAt)}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelected(item)
                          setComment('')
                        }}
                        className="text-vr-body-sm text-vraccent-primary hover:underline"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!filteredApprovals.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-vrtext-muted text-vr-body-sm">
                    {isFetching ? '加载中...' : '暂无审批记录'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={() => setSelected(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-vrborder-subtle bg-vrbg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-vr-h3 font-semibold text-vrtext-primary">{typeLabels[selected.type] || selected.type}</h3>
                  <p className="text-vr-caption text-vrtext-muted mt-1">{selected.targetDesc}</p>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-vr-caption font-medium', statusConfig[selected.status].cls)}>
                  {statusConfig[selected.status].icon}
                  {statusConfig[selected.status].label}
                </span>
              </div>

              <div className="mt-5 space-y-3 rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4">
                <DetailRow label="处置方式" value={actionLabel(selected)} />
                <DetailRow label="退款金额" value={formatMoney(selected.amount)} />
                <DetailRow label="申请人" value={`${selected.requesterName} (${selected.requesterRole})`} />
                <DetailRow label="申请时间" value={formatTime(selected.createdAt)} />
                <DetailRow label="申请原因" value={selected.reason} />
                {selected.approverName && <DetailRow label="审批人" value={`${selected.approverName} (${selected.approverRole})`} />}
                {selected.approvalComment && <DetailRow label="审批意见" value={selected.approvalComment} />}
              </div>

              {selected.status === 'PENDING' && canApprove && (
                <div className="mt-4">
                  <label className="text-vr-caption text-vrtext-secondary block mb-1">审批意见</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="通过可留空；拒绝必须填写原因"
                    className="w-full min-h-24 px-3 py-2 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary resize-none"
                  />
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setSelected(null)}
                  className="flex-1 h-10 rounded-lg bg-vrbg-elevated text-vr-body-sm font-medium text-vrtext-secondary hover:bg-vrborder-subtle"
                >
                  关闭
                </button>
                {selected.status === 'PENDING' && canApprove && (
                  <>
                    <button
                      onClick={() => {
                        const value = comment.trim()
                        if (!value) {
                          alert('请填写拒绝原因')
                          return
                        }
                        rejectMutation.mutate({ id: selected.id, comment: value })
                      }}
                      disabled={rejectMutation.isPending || approveMutation.isPending}
                      className="flex-1 h-10 rounded-lg border border-vrerror text-vrerror text-vr-body-sm font-medium hover:bg-vrerror/10 disabled:opacity-50"
                    >
                      拒绝
                    </button>
                    <button
                      onClick={() => approveMutation.mutate({ id: selected.id, comment: comment.trim() || undefined })}
                      disabled={rejectMutation.isPending || approveMutation.isPending}
                      className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 disabled:opacity-50"
                    >
                      {approveMutation.isPending ? '执行中...' : '通过并执行'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
