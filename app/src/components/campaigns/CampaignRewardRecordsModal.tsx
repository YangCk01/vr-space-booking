import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getCampaignLogs, type Campaign } from '@/api/campaign'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import CampaignRewardRecordTable from './CampaignRewardRecordTable'

export default function CampaignRewardRecordsModal({
  campaign,
  open,
  onOpenChange,
  onViewAll,
}: {
  campaign: Campaign | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onViewAll: (campaignId: string) => void
}) {
  const [page, setPage] = useState(1)
  const pageSize = 10
  useEffect(() => {
    if (open) setPage(1)
  }, [open, campaign?.id])

  const query = useQuery({
    queryKey: ['campaign-reward-records', campaign?.id, page, pageSize],
    queryFn: () => getCampaignLogs(campaign!.id, { page, pageSize }),
    enabled: open && Boolean(campaign?.id),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] w-[calc(100vw-32px)] max-w-[1180px] gap-0 overflow-hidden border-vrborder-subtle bg-white p-0 sm:max-w-[calc(100vw-48px)] xl:max-w-[1180px]">
        <DialogHeader className="border-b border-vrborder-subtle px-6 py-5">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="text-vr-title-sm text-vrtext-primary">领取记录</DialogTitle>
              <DialogDescription className="mt-2">{campaign?.name || '营销活动'} · 共 {query.data?.meta?.total || 0} 条</DialogDescription>
            </div>
            {campaign && (
              <button type="button" onClick={() => onViewAll(campaign.id)} className="inline-flex h-9 items-center gap-2 rounded-md border border-vraccent-primary px-4 text-vr-body-sm font-medium text-vraccent-primary hover:bg-vraccent-primary/5">
                查看全部记录
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogHeader>
        <div className="max-h-[68vh] overflow-auto p-6">
          <div className="overflow-hidden rounded-md border border-vrborder-subtle">
            <CampaignRewardRecordTable
              records={query.data?.data || []}
              loading={query.isLoading}
              error={query.isError ? '奖励记录加载失败，请稍后重试' : undefined}
              showCampaign={false}
              page={page}
              pageSize={pageSize}
              total={query.data?.meta?.total || 0}
              onPageChange={setPage}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
