export interface CampaignRewardSelectOption {
  value: string
  label: string
}

export function filterRewardOptions(options: CampaignRewardSelectOption[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return options
  return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
}

export function toggleRewardOption(value: string[], optionId: string) {
  return value.includes(optionId)
    ? value.filter((item) => item !== optionId)
    : [...value, optionId]
}
