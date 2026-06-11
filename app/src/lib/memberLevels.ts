import type { SystemConfig } from '@/api/systemConfig'

export type MemberLevelConfig = {
  key: string
  name: string
  discount: number
}

const DEFAULT_LEVEL_KEYS = ['NORMAL', 'MEMBER', 'VIP', 'VIP_PLUS']
const DEFAULT_LEVEL_NAMES = ['普通会员', '银卡会员', '金卡会员', '钻石会员']
const DEFAULT_DISCOUNTS = [100, 95, 90, 85]

export function readSystemConfigValue<T>(configs: SystemConfig[] | undefined, key: string, fallback: T): T {
  const item = configs?.find((c) => c.key === key)
  return item ? item.value as T : fallback
}

export function buildMemberLevelsFromConfig(
  configs: SystemConfig[] | undefined,
  fallbackNames = DEFAULT_LEVEL_NAMES
): MemberLevelConfig[] {
  const names = readSystemConfigValue<string[]>(configs, 'member_level_names', fallbackNames)
  const discounts = readSystemConfigValue<number[]>(configs, 'member_discount_rates', DEFAULT_DISCOUNTS)

  return DEFAULT_LEVEL_KEYS.map((key, index) => ({
    key,
    name: names[index] || fallbackNames[index] || key,
    discount: Number(discounts[index]) || 100,
  }))
}
