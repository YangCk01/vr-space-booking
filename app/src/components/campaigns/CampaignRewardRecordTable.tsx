import { ChevronLeft, ChevronRight, CircleAlert, Inbox } from 'lucide-react'
import type { CampaignRewardRecord } from '@/api/campaign'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replaceAll('/', '-')
}

function formatMoney(value?: number | null) {
  return value == null ? '-' : `¥${(value / 100).toFixed(2)}`
}

function rewardTypeLabel(type: CampaignRewardRecord['rewardType']) {
  if (type === 'POINTS') return '积分'
  if (type === 'EXPERIENCE_COUPON') return '体验券'
  return '优惠券'
}

function rewardContent(record: CampaignRewardRecord) {
  if (record.rewardType === 'POINTS') return `+${record.pointsAmount || 0} 积分`
  const parts = [record.rewardName]
  if (record.rewardType === 'COUPON' && record.rewardValue) parts.push(`${record.rewardValue / 10}折`)
  if (record.validDays) parts.push(`${record.validDays}天有效`)
  if (record.applicableGameNames.length > 0) parts.push(record.applicableGameNames.join('、'))
  return parts.join(' · ')
}

function statusView(record: CampaignRewardRecord) {
  if (record.status === 'SUCCESS' && record.usedAt) return { label: '已使用', className: 'bg-vraccent-primary/10 text-vraccent-primary' }
  if (record.status === 'SUCCESS') return { label: '已发放', className: 'bg-vrsuccess/10 text-vrsuccess' }
  if (record.status === 'SKIPPED') return { label: '已跳过', className: 'bg-vrwarning/10 text-vrwarning' }
  return { label: '失败', className: 'bg-vrerror/10 text-vrerror' }
}

export default function CampaignRewardRecordTable({
  records,
  loading = false,
  error,
  showCampaign = true,
  page = 1,
  pageSize = 20,
  total = 0,
  onPageChange,
}: {
  records: CampaignRewardRecord[]
  loading?: boolean
  error?: string
  showCampaign?: boolean
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-vr-body-sm text-vrtext-muted">正在加载奖励记录...</div>
  }
  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-vr-body-sm text-vrerror">
        <CircleAlert className="h-8 w-8" />
        {error}
      </div>
    )
  }
  if (records.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-vr-body-sm text-vrtext-muted">
        <Inbox className="h-10 w-10 text-vrborder-strong" />
        暂无奖励记录
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] border-collapse text-left text-vr-body-sm">
          <thead>
            <tr className="bg-[#eaf2ff] text-vrtext-secondary">
              <th className="px-5 py-3 font-medium">记录ID</th>
              {showCampaign && <th className="px-5 py-3 font-medium">活动名称</th>}
              <th className="px-5 py-3 font-medium">用户</th>
              <th className="px-5 py-3 font-medium">奖励类型</th>
              <th className="px-5 py-3 font-medium">奖励内容</th>
              <th className="px-5 py-3 font-medium">发放时间</th>
              <th className="px-5 py-3 font-medium">使用记录</th>
              <th className="px-5 py-3 text-center font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vrborder-subtle">
            {records.map((record) => {
              const status = statusView(record)
              return (
                <tr key={record.id} className="bg-white hover:bg-vrbg-surface/70">
                  <td className="px-5 py-4 font-mono text-xs text-vrtext-tertiary">{record.id.slice(0, 8)}</td>
                  {showCampaign && <td className="px-5 py-4 font-medium text-vrtext-primary">{record.campaignName}</td>}
                  <td className="px-5 py-4">
                    <div className="font-medium text-vrtext-primary">{record.userName || '未命名用户'}</div>
                    <div className="mt-1 text-xs text-vrtext-muted">{record.userPhone}</div>
                  </td>
                  <td className="px-5 py-4 text-vrtext-secondary">{rewardTypeLabel(record.rewardType)}</td>
                  <td className="max-w-[260px] px-5 py-4 text-vrtext-primary">
                    <div>{rewardContent(record)}</div>
                    {record.rewardType === 'POINTS' && <div className="mt-1 text-xs text-vrtext-muted">{record.description}</div>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-vrtext-secondary">{formatDateTime(record.issuedAt)}</td>
                  <td className="px-5 py-4 text-vrtext-secondary">
                    {record.usedAt ? (
                      <div>
                        <div>{formatDateTime(record.usedAt)}</div>
                        <div className="mt-1 text-xs text-vrtext-muted">
                          {[record.usedOrderId && `订单 ${record.usedOrderId.slice(0, 8)}`, record.usedAmount != null && `抵扣 ${formatMoney(record.usedAmount)}`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    ) : record.rewardType === 'POINTS' ? '积分已入账' : '尚未使用'}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                    {record.reason && <div className="mt-1 max-w-[140px] text-xs text-vrtext-muted">{record.reason}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {onPageChange && (
        <div className="flex items-center justify-between border-t border-vrborder-subtle px-5 py-4 text-vr-body-sm text-vrtext-muted">
          <span>共 {total} 条记录</span>
          <div className="flex items-center gap-2">
            <button type="button" title="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-vrborder-subtle bg-white text-vrtext-secondary disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-20 text-center">{page} / {totalPages}</span>
            <button type="button" title="下一页" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-vrborder-subtle bg-white text-vrtext-secondary disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
