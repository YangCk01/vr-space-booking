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
  pointsDiscountCost: number
  totalPrincipalLiability: number
  totalBonusLiability: number
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

export async function reconcileFinance() {
  const res = await apiClient.get('/finance/reconcile')
  return res.data.data as {
    actual: { totalPrincipal: number; totalBonus: number; total: number }
    expected: { principal: number; bonus: number; total: number }
    diff: { principal: number; bonus: number }
    isBalanced: boolean
  }
}
