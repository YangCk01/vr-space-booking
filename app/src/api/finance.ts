import { apiClient } from './client'

export interface FinanceOverview {
  todayRevenue: number
  todayRefund: number
  todayRecharge: number
  totalUserBalance: number
  periodRevenue: number
  periodRefund: number
  periodRecharge: number
  periodRechargeConsumption: number
  revenueTrend: Array<{ date: string; revenue: number; refund: number; recharge: number }>
}

export interface FlowItem {
  id: string
  type: 'ORDER' | 'REFUND' | 'RECHARGE' | 'BALANCE_DEDUCT' | 'BALANCE_REFUND'
  orderNo: string
  userName: string
  userPhone: string
  amount: number
  payMethod: string
  remark: string
  createdAt: string
}

export async function getFinanceOverview(range?: string, startDate?: string, endDate?: string, venueId?: string) {
  const res = await apiClient.get('/finance/overview', { params: { range, startDate, endDate, venueId } })
  return res.data.data as FinanceOverview
}

export async function getFinanceFlow(params?: {
  startDate?: string
  endDate?: string
  types?: string
  payMethod?: string
  venueId?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/finance/flow', { params })
  return res.data
}

export async function getFinanceRefunds(params?: {
  startDate?: string
  endDate?: string
  venueId?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/finance/refunds', { params })
  return res.data
}

export interface DailyReport {
  date: string
  rechargePrincipalIn: number
  directPayIn: number
  refundOut: number
  netCashFlow: number
  directRevenue: number
  memberPrincipalRevenue: number
  totalRecognizedRevenue: number
  pointsExchangeCost: number
  pointsGiftCost: number
  couponDiscountCost: number
  couponGiftCount: number
  experienceGiftCount: number
  couponUsedCount: number
  experienceUsedCount: number
  totalPrincipalLiability: number
  totalBonusLiability: number
  pointsLiability: number
  dormantPrincipal: number
}

export async function getDailyReport(date: string) {
  const res = await apiClient.get('/finance/daily-report', { params: { date } })
  return res.data.data as DailyReport | null
}

export async function getDailyReports(startDate?: string, endDate?: string) {
  const res = await apiClient.get('/finance/daily-reports', { params: { startDate, endDate } })
  return res.data.data as DailyReport[]
}

export async function generateDailyReport(date: string) {
  const res = await apiClient.post('/finance/generate-report', { date })
  return res.data.data
}

export interface ReconcileItem {
  name: string
  actual: number
  expected: number
  diff: number
  unit: string
  note?: string
  isBalanced: boolean
}

export interface ReconcileResult {
  mode: 'total' | 'daily'
  date: string | null
  isBalanced: boolean
  items: ReconcileItem[]
}

export interface ReconcileDetailItem {
  id: string
  title: string
  subtitle?: string
  actual: number
  expected: number
  diff: number
  unit: string
  reason: string
  link?: string
}

export interface ReconcileDetailsResult {
  type: string
  mode: 'total' | 'daily'
  date: string | null
  totalDiff: number
  items: ReconcileDetailItem[]
}

export async function reconcileFinance(date?: string) {
  const res = await apiClient.get('/finance/reconcile', {
    params: date ? { date } : undefined,
  })
  return res.data.data as ReconcileResult
}

export async function getReconcileDetails(type: string, date?: string) {
  const res = await apiClient.get('/finance/reconcile-details', {
    params: { type, date },
  })
  return res.data.data as ReconcileDetailsResult
}

export async function fixReconcileDiff(params: {
  type: string
  targetId: string
  diff: number
  date?: string
  mode?: string
}) {
  const res = await apiClient.post('/finance/fix-reconcile-diff', params)
  return res.data
}

export interface TotalSummary {
  totalRechargePrincipalIn: number
  totalDirectPayIn: number
  totalRefundOut: number
  totalNetCashFlow: number
  totalDirectRevenue: number
  totalMemberPrincipalRevenue: number
  totalRecognizedRevenue: number
  totalPointsExchangeCost: number
  totalPointsGiftCost: number
  totalCouponDiscountCost: number
  totalCouponGift: number
  totalExperienceGift: number
  totalCouponUsed: number
  totalExperienceUsed: number
  totalCouponUnused: number
  totalExperienceUnused: number
  totalPrincipalLiability: number
  totalBonusLiability: number
  totalPointsLiability: number
  dormantPrincipal: number
}

export async function getTotalSummary() {
  const res = await apiClient.get('/finance/total-summary')
  return res.data.data as TotalSummary
}
