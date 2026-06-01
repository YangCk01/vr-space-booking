import { getConfig } from '../services/configService'

/* ─── 默认配置（fallback）─── */
const DEFAULT_TIERS = [
  { amount: 500, bonus: 0, level: 'NORMAL' },
  { amount: 1000, bonus: 100, level: 'MEMBER' },
  { amount: 2000, bonus: 300, level: 'VIP' },
  { amount: 5000, bonus: 1000, level: 'VIP_PLUS' },
]

const DEFAULT_LEVEL_NAMES = ['普通会员', '银卡会员', '金卡会员', '钻石会员']
const DEFAULT_LEVEL_KEYS = ['NORMAL', 'MEMBER', 'VIP', 'VIP_PLUS']

/** 兼容读取：数据库中可能是原始值，也可能是 { value: raw } 包装格式 */
function unwrap(val: any): any {
  if (val !== null && typeof val === 'object' && 'value' in val) {
    return val.value
  }
  return val
}

/* ─── 读取充值档位配置（分）─── */
export async function getRechargeConfig() {
  // 保留从 systemSetting 读取，避免影响现有充值逻辑
  const { prisma } = await import('./prisma')
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'recharge_tiers' } })
  const raw = unwrap(setting?.value)
  const tiers = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_TIERS
  return tiers.map((t: any) => ({
    amount: Math.round((t.amount || 0) * 100),
    bonus: Math.round((t.bonus || 0) * 100),
    total: Math.round((t.amount || 0) * 100) + Math.round((t.bonus || 0) * 100),
    level: t.level || 'NORMAL',
  }))
}

/* ─── 读取会员等级配置 ── */
export async function getMemberLevels() {
  const thresholds = getConfig<number[]>('member_level_thresholds', [0, 1000, 2000, 5000])!
  const discounts = getConfig<number[]>('member_discount_rates', [100, 95, 90, 85])!

  return DEFAULT_LEVEL_KEYS.map((key, i) => ({
    key,
    name: DEFAULT_LEVEL_NAMES[i] || key,
    discount: Number(discounts[i]) || 100,
    threshold: Number(thresholds[i]) || 0,
  }))
}

/* ─── 读取积分规则 ── */
export async function getPointsConfig() {
  const earnRatio = getConfig<number>('points_earn_ratio', 100)!
  const deductRatio = getConfig<number>('points_deduct_ratio', 100)!
  return {
    earnRate: earnRatio > 0 ? 100 / earnRatio : 1,
    deductRate: deductRatio > 0 ? deductRatio : 100,
  }
}

/* ─── 等级 key 归一化（兼容配置 key 如 VIP+ 和 enum 值 VIP_PLUS）─── */
const CONFIG_KEY_MAP: Record<string, string> = {
  'VIP+': 'VIP_PLUS',
}

export function normalizeLevelKey(key: string): string {
  return CONFIG_KEY_MAP[key] || key
}

/* ─── 获取某等级的折扣 ── */
export async function getDiscountByLevel(levelKey: string): Promise<number> {
  const levels = await getMemberLevels()
  const normalized = normalizeLevelKey(levelKey)
  const level = levels.find((l) => normalizeLevelKey(l.key) === normalized)
  return level?.discount ?? 100
}

/* ─── 读取单笔最高积分抵扣比例 ── */
export async function getMaxPointsDeductionRatio(): Promise<number> {
  const { prisma } = await import('./prisma')
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'max_points_deduction_ratio' }
  })
  const raw = unwrap(setting?.value)
  const val = Number(raw)
  return Number.isFinite(val) && val > 0 && val <= 100 ? val : 30
}

/* ─── 等级排序（用于升级比较）─── */
const LEVEL_ORDER = ['NORMAL', 'MEMBER', 'VIP', 'VIP_PLUS']

export function compareLevel(a: string, b: string): number {
  const ai = LEVEL_ORDER.indexOf(normalizeLevelKey(a))
  const bi = LEVEL_ORDER.indexOf(normalizeLevelKey(b))
  if (ai === -1 || bi === -1) return 0
  return ai - bi
}
