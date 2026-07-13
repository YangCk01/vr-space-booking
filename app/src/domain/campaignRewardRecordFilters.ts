export type CampaignRewardRecordFilterForm = {
  campaignId: string
  rewardType: 'POINTS' | 'COUPON' | 'EXPERIENCE_COUPON' | ''
  status: 'ISSUED' | 'USED' | 'FAILED' | ''
  userKeyword: string
  startDate: string
  endDate: string
}

export const emptyCampaignRewardRecordFilters: CampaignRewardRecordFilterForm = {
  campaignId: '',
  rewardType: '',
  status: '',
  userKeyword: '',
  startDate: '',
  endDate: '',
}

const filterKeys = Object.keys(emptyCampaignRewardRecordFilters) as Array<keyof CampaignRewardRecordFilterForm>

export function parseCampaignRewardRecordFilters(params: URLSearchParams): CampaignRewardRecordFilterForm {
  return filterKeys.reduce((filters, key) => {
    filters[key] = (params.get(key) || '') as never
    return filters
  }, { ...emptyCampaignRewardRecordFilters })
}

export function serializeCampaignRewardRecordFilters(filters: CampaignRewardRecordFilterForm): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of filterKeys) {
    const value = filters[key].trim()
    if (value) params.set(key, value)
  }
  return params
}
