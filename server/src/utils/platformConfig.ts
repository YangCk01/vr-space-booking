import { getConfig } from '../services/configService'

export type PlatformSource = 'MEITUAN' | 'DOUYIN' | 'DIANPING'

export interface PlatformConfig {
  enabled: boolean
  autoVerify: boolean
  settlementCycle: 'T+0' | 'T+1' | 'T+7' | 'MONTHLY'
  serviceRate: number
  merchantId: string
  contact: string
}

export const defaultPlatformConfig: Record<PlatformSource, PlatformConfig> = {
  MEITUAN: {
    enabled: true,
    autoVerify: true,
    settlementCycle: 'T+1',
    serviceRate: 6,
    merchantId: 'MT-local-demo',
    contact: '未接入真实平台',
  },
  DOUYIN: {
    enabled: true,
    autoVerify: true,
    settlementCycle: 'T+1',
    serviceRate: 5,
    merchantId: 'DY-local-demo',
    contact: '未接入真实平台',
  },
  DIANPING: {
    enabled: true,
    autoVerify: false,
    settlementCycle: 'T+7',
    serviceRate: 6,
    merchantId: 'DP-local-demo',
    contact: '未接入真实平台',
  },
}

export function getPlatformConfig(): Record<PlatformSource, PlatformConfig> {
  const stored = getConfig<Partial<Record<PlatformSource, Partial<PlatformConfig>>>>('third_party_platform_config', {})
  const merged: Record<PlatformSource, PlatformConfig> = { ...defaultPlatformConfig }
  for (const source of Object.keys(defaultPlatformConfig) as PlatformSource[]) {
    const patch = stored?.[source]
    if (patch && typeof patch === 'object') {
      merged[source] = { ...merged[source], ...patch }
    }
  }
  return merged
}

export function isPlatformEnabled(source: string): boolean {
  const configs = getPlatformConfig()
  const config = configs[source as PlatformSource]
  if (!config) return false
  return config.enabled
}
