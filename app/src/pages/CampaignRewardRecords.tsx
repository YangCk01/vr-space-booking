import { useEffect, useState } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import CampaignRewardRecordTable from '@/components/campaigns/CampaignRewardRecordTable'
import {
  getCampaigns,
  getCampaignRewardRecords,
  type Campaign,
  type CampaignRewardRecordFilters,
} from '@/api/campaign'
import {
  emptyCampaignRewardRecordFilters,
  parseCampaignRewardRecordFilters,
  serializeCampaignRewardRecordFilters,
  type CampaignRewardRecordFilterForm,
} from '@/domain/campaignRewardRecordFilters'

const controlClass = 'h-10 rounded-md border border-vrborder-subtle bg-white px-3 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary'

export default function CampaignRewardRecords() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseCampaignRewardRecordFilters(searchParams)
  const [draft, setDraft] = useState<CampaignRewardRecordFilterForm>(filters)
  const [page, setPage] = useState(1)
  const pageSize = 20

  useEffect(() => {
    setDraft(parseCampaignRewardRecordFilters(searchParams))
    setPage(1)
  }, [searchParams])

  const campaignsQuery = useQuery({
    queryKey: ['campaigns', 'reward-record-filter'],
    queryFn: () => getCampaigns({ page: 1, pageSize: 100 }),
    staleTime: 60_000,
  })
  const recordsQuery = useQuery({
    queryKey: ['campaign-reward-records', filters, page, pageSize],
    queryFn: () => getCampaignRewardRecords({
      ...filters,
      page,
      pageSize,
    } as CampaignRewardRecordFilters),
  })

  const campaigns: Campaign[] = campaignsQuery.data?.data || []
  const applyFilters = () => {
    setPage(1)
    setSearchParams(serializeCampaignRewardRecordFilters(draft), { replace: true })
  }
  const resetFilters = () => {
    setDraft(emptyCampaignRewardRecordFilters)
    setPage(1)
    setSearchParams({}, { replace: true })
  }

  return (
    <Layout breadcrumb={['会员与营销', '奖励记录']}>
      <div className="space-y-5">
        <header>
          <h1 className="text-vr-title-lg font-semibold text-vrtext-primary">奖励记录</h1>
          <p className="mt-1 text-vr-body-sm text-vrtext-tertiary">统一查看营销活动发放的优惠券、体验券和积分</p>
        </header>

        <section className="rounded-md border border-vrborder-subtle bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_1.4fr_auto]">
            <label className="space-y-1.5">
              <span className="text-xs text-vrtext-tertiary">营销活动</span>
              <select value={draft.campaignId} onChange={(event) => setDraft((current) => ({ ...current, campaignId: event.target.value }))} className={`${controlClass} w-full`}>
                <option value="">全部活动</option>
                {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-vrtext-tertiary">奖励类型</span>
              <select value={draft.rewardType} onChange={(event) => setDraft((current) => ({ ...current, rewardType: event.target.value as CampaignRewardRecordFilterForm['rewardType'] }))} className={`${controlClass} w-full`}>
                <option value="">全部类型</option>
                <option value="COUPON">优惠券</option>
                <option value="EXPERIENCE_COUPON">体验券</option>
                <option value="POINTS">积分</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-vrtext-tertiary">记录状态</span>
              <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as CampaignRewardRecordFilterForm['status'] }))} className={`${controlClass} w-full`}>
                <option value="">全部状态</option>
                <option value="ISSUED">已发放</option>
                <option value="USED">已使用</option>
                <option value="FAILED">失败或跳过</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-vrtext-tertiary">用户</span>
              <input value={draft.userKeyword} onChange={(event) => setDraft((current) => ({ ...current, userKeyword: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && applyFilters()} placeholder="姓名或手机号" className={`${controlClass} w-full`} />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs text-vrtext-tertiary">发放日期</span>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} className={`${controlClass} min-w-0 w-full`} />
                <span className="text-vrtext-muted">至</span>
                <input type="date" value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} className={`${controlClass} min-w-0 w-full`} />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button type="button" title="查询" onClick={applyFilters} className="inline-flex h-10 items-center gap-2 rounded-md bg-vraccent-primary px-4 text-vr-body-sm font-medium text-white hover:bg-vraccent-primary-hover">
                <Search className="h-4 w-4" />查询
              </button>
              <button type="button" title="重置筛选" onClick={resetFilters} className="flex h-10 w-10 items-center justify-center rounded-md border border-vrborder-subtle bg-white text-vrtext-secondary hover:bg-vrbg-surface">
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-vrborder-subtle bg-white">
          <CampaignRewardRecordTable
            records={recordsQuery.data?.data || []}
            loading={recordsQuery.isLoading}
            error={recordsQuery.isError ? '奖励记录加载失败，请检查网络后重试' : undefined}
            page={page}
            pageSize={pageSize}
            total={recordsQuery.data?.meta?.total || 0}
            onPageChange={setPage}
          />
        </section>
      </div>
    </Layout>
  )
}
