import { apiClient } from './client'

export interface FinanceOverview {
  todayRevenue: number
  todayRefund: number
  todayCancelRefund: number
  todayRecharge: number
  todayOtherIncome: number
  totalUserBalance: number
  periodRevenue: number
  periodRefund: number
  periodCancelRefund: number
  periodRecharge: number
  periodOtherIncome: number
  periodRescheduleFee: number
  periodNoShowPenalty: number
  periodCancelFee: number
  periodRechargeConsumption: number
  revenueTrend: Array<{ date: string; revenue: number; refund: number; cancelRefund: number; recharge: number; otherIncome: number; rescheduleFee: number; noShowPenalty: number; cancelFee: number }>
}

export interface FlowItem {
  id: string
  type: 'ORDER' | 'REFUND' | 'CANCEL_REFUND' | 'RECHARGE' | 'BALANCE_DEDUCT' | 'BALANCE_REFUND' | 'RESCHEDULE_FEE' | 'NO_SHOW_RETAINED'
  orderNo: string
  parentOrderNo?: string
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

export interface FinanceAuditConfig {
  taxRate: number
  paymentFeeRates: Record<string, number>
  platformFeeRates: Record<string, number>
  settlementCycles: Record<string, string>
}

export interface FinanceAuditVoucher {
  subject: string
  debit: number
  credit: number
  summary: string
}

export interface FinanceAuditRecord {
  id: string
  sourceId: string
  sourceType: 'ORDER' | 'RECHARGE'
  store: string
  operator: string
  channel: string
  paymentMethod: string
  payMethod: string
  type: string
  consumeStatus: 'consumed' | 'unconsumed' | 'recharge' | 'refunded'
  originalPrice: number
  discountBreakdown: Array<{ name: string; amount: number }>
  platformFee: number
  gatewayFee: number
  expectedRecv: number
  actualRecv: number
  settlementCycle: string
  bankStatus: 'arrived' | 'in_transit' | 'internal' | string
  assetChange?: Record<string, unknown> | null
  invoice: { status: string; amount: number; taxRate: number }
  orderTime: string
  reconTime: string
  remark?: string
  relatedOrderId?: string | null
  userName?: string
  userPhone?: string
  status: 'matched' | 'short' | 'over' | 'refunded'
  vouchers: FinanceAuditVoucher[]
  auditLog: Array<{ id: string; action: string; actionName: string; reason: string; createdAt: string; operatorName: string }>
  forceMatched?: boolean
  forceMatchReason?: string
}

export interface FinanceAuditSummary {
  total: number
  matched: number
  exceptions: number
  expectedRecv: number
  actualRecv: number
  diff: number
  stores: string[]
}

export interface FinanceAuditRecordResponse {
  data: FinanceAuditRecord[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
  summary: FinanceAuditSummary
  config: FinanceAuditConfig
}

export async function getFinanceAuditRecords(params?: {
  startDate?: string
  endDate?: string
  venueId?: string
  store?: string
  status?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/finance/audit/records', { params })
  return res.data.data as FinanceAuditRecordResponse
}

export async function getFinanceAuditRecord(id: string) {
  const res = await apiClient.get(`/finance/audit/records/${encodeURIComponent(id)}`)
  return res.data.data as FinanceAuditRecord
}

export async function getFinanceAuditConfig() {
  const res = await apiClient.get('/finance/audit/config')
  return res.data.data as FinanceAuditConfig
}

export async function updateFinanceAuditConfig(config: FinanceAuditConfig) {
  const res = await apiClient.put('/finance/audit/config', config)
  return res.data.data as FinanceAuditConfig
}

export async function forceMatchFinanceAuditRecord(id: string, payload: { reason: string; approver?: string }) {
  const res = await apiClient.post(`/finance/audit/records/${encodeURIComponent(id)}/force-match`, payload)
  return res.data.data as { id: string; status: string }
}

export interface DailyReport {
  date: string
  generated?: boolean
  generatedAt?: string | null
  status?: 'DRAFT' | 'GENERATED' | 'HAS_EXCEPTION' | 'READY_TO_CONFIRM' | 'LOCKED' | 'REOPENED'
  statusLabel?: string
  pendingExceptionCount?: number
  confirmedAt?: string | null
  confirmedByName?: string | null
  lockedAt?: string | null
  reopenedAt?: string | null
  reopenedByName?: string | null
  reopenReason?: string | null
  rechargePrincipalIn: number
  directPayIn: number
  refundOut: number
  netCashFlow: number
  directRevenue: number
  memberPrincipalRevenue: number
  totalRecognizedRevenue: number
  prepaidDirectRevenue?: number
  confirmedDirectRevenue?: number
  prepaidMemberRevenue?: number
  confirmedMemberRevenue?: number
  pointsExchangeCost: number
  pointsGiftCost: number
  couponDiscountCost: number
  noShowPenalty?: number
  otherIncomeTotal?: number
  rescheduleFeeIncome?: number
  cancelFeeIncome?: number
  couponGiftCount: number
  experienceGiftCount: number
  couponCampaignCount?: number
  experienceCampaignCount?: number
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

export async function confirmDailyReport(date: string) {
  const res = await apiClient.post('/finance/daily-report/confirm', { date })
  return res.data.data as DailyReport
}

export async function reopenDailyReport(date: string, reason: string) {
  const res = await apiClient.post('/finance/daily-report/reopen', { date, reason })
  return res.data.data as DailyReport
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
  canAutoFix?: boolean
  fixHint?: string
  link?: string
}

export interface ReconcileDetailsResult {
  type: string
  mode: 'total' | 'daily'
  date: string | null
  totalDiff: number
  items: ReconcileDetailItem[]
}

export interface ReconcileFixResult {
  alreadyBalanced?: boolean
  type: string
  targetId: string
  diff: number
  userId?: string
  reason?: string
  balanceTransactionId?: string
  adjustmentId?: string
  adjustmentNo?: string
  adjustmentAmount?: number
  adjustmentPointsAmount?: number
  executedAt?: string
  userBefore?: {
    principalBalance: number
    bonusBalance: number
    points: number
  } | null
  userAfter?: {
    principalBalance: number
    bonusBalance: number
    points: number
  } | null
  txData?: {
    type?: string
    amount?: number
    principalAmount?: number
    bonusAmount?: number
    pointsAmount?: number
    totalAmount?: number
    remark?: string
  }
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
  reason: string
}) {
  const res = await apiClient.post('/finance/fix-reconcile-diff', params)
  return res.data as { message: string; data: ReconcileFixResult }
}

export interface TotalSummary {
  totalRechargePrincipalIn: number
  totalDirectPayIn: number
  totalRefundOut: number
  totalCashRefundOut?: number
  totalBalanceRefundOut?: number
  totalCustomerRefundOut?: number
  totalCancelRefundOut?: number
  totalRefundDispositionOut?: number
  totalNetCashFlow: number
  totalDirectRevenue: number
  totalMemberPrincipalRevenue: number
  totalRecognizedRevenue: number
  totalPointsExchangeCost: number
  totalPointsGiftCost: number
  totalCouponDiscountCost: number
  totalCouponGift: number
  totalExperienceGift: number
  totalCouponCampaign?: number
  totalExperienceCampaign?: number
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

export interface RechargeRecord {
  id: string
  amount: number
  bonus: number
  total: number
  payMethod: string
  status: string
  paidAt: string | null
  createdAt: string
}

export interface BalanceTransaction {
  id: string
  type: string
  amount: number
  principalAmount?: number | null
  bonusAmount?: number | null
  totalAmount?: number | null
  pointsAmount?: number | null
  remark?: string | null
  createdAt: string
}

export async function getUserRechargeRecords(userId: string) {
  const res = await apiClient.get('/recharges', { params: { userId } })
  return res.data.data as RechargeRecord[]
}

export async function getUserBalanceTransactions(userId: string) {
  const res = await apiClient.get('/recharges/transactions', { params: { userId } })
  return res.data.data as BalanceTransaction[]
}
