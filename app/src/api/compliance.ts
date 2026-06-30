import { apiClient } from './client'
import { format } from 'date-fns'
import type {
  ComplianceRecord,
  InvoiceStatus,
  AssetChange,
  AuditLogEntry,
  VoucherEntry,
} from '@/lib/compliance'

export interface ComplianceOverview {
  gtv: number
  forwardGtv: number
  refund: number
  revenue: number
  discount: number
  platformFee: number
  gatewayFee: number
  netRecv: number
  deferred: number
  rechargeLiability: number
  pendingInvoice: number
  exceptions: number
  pointsCost: number
}

export interface ComplianceRecordsResponse {
  data: ComplianceRecord[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
  overview: ComplianceOverview
  stores: string[]
}

export interface ComplianceOverviewResponse {
  overview: ComplianceOverview
  stores: string[]
}

function convertAssetChange(raw: any): AssetChange | null {
  if (!raw) return null
  return {
    type: raw.type,
    value: raw.value,
    source: raw.source,
    principal: raw.principal,
    gift: raw.gift,
    principalUsed: raw.principalUsed,
    giftUsed: raw.giftUsed,
    principalRatio: raw.principalRatio,
    giftRatio: raw.giftRatio,
  }
}

function convertRecord(raw: any): ComplianceRecord {
  return {
    id: raw.id,
    sourceId: raw.sourceId,
    sourceType: raw.sourceType,
    store: raw.store,
    operator: raw.operator,
    channel: raw.channel,
    paymentMethod: raw.paymentMethod,
    payMethod: raw.payMethod,
    type: raw.type,
    consumeStatus: raw.consumeStatus,
    originalPrice: raw.originalPrice,
    discountBreakdown: (raw.discountBreakdown || []).map((d: any) => ({
      name: d.name,
      amount: d.amount,
    })),
    platformFee: raw.platformFee,
    gatewayFee: raw.gatewayFee,
    expectedRecv: raw.expectedRecv,
    actualRecv: raw.actualRecv,
    settlementCycle: raw.settlementCycle,
    bankStatus: raw.bankStatus,
    assetChange: convertAssetChange(raw.assetChange),
    invoice: {
      status: (raw.invoice?.status || 'none') as InvoiceStatus,
      amount: raw.invoice?.amount || 0,
      taxRate: raw.invoice?.taxRate || 0.06,
      taxAmount: raw.invoice?.taxAmount || 0,
      type: raw.invoice?.type || (raw.invoice?.status === 'red_ink' ? '红字增值税电子普票' : '增值税电子普票'),
      originalInvoiceId: raw.invoice?.originalInvoiceId,
      info: raw.invoice?.info || null,
    },
    orderTime: raw.orderTime,
    reconTime: raw.reconTime,
    remark: raw.remark || '',
    relatedOrderId: raw.relatedOrderId || null,
    userName: raw.userName,
    userPhone: raw.userPhone,
    status: raw.status,
    vouchers: (raw.vouchers || []).map((v: any) => ({
      subject: v.subject,
      debit: v.debit,
      credit: v.credit,
      summary: v.summary,
    })),
    auditLog: (raw.auditLog || []).map((log: any) => ({
      id: log.id,
      time: log.createdAt ? format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss') : log.time || '',
      operator: log.operatorName || log.operator || '',
      action: log.actionName || log.action || '',
      reason: log.reason || '',
      attachments: log.attachments || [],
    })),
    forceMatched: raw.forceMatched,
    forceMatchReason: raw.forceMatchReason,
  }
}

export async function getComplianceRecords(params?: {
  tab?: string
  search?: string
  store?: string
  status?: string
  startDate?: string
  endDate?: string
  venueId?: string
  page?: number
  pageSize?: number
}): Promise<ComplianceRecordsResponse> {
  const res = await apiClient.get('/finance/compliance/records', { params })
  const payload = res.data.data
  return {
    data: (payload.data || []).map(convertRecord),
    meta: payload.meta,
    overview: payload.overview,
    stores: payload.stores || [],
  }
}

export async function getComplianceOverview(params?: {
  store?: string
  startDate?: string
  endDate?: string
  venueId?: string
}): Promise<ComplianceOverviewResponse> {
  const res = await apiClient.get('/finance/compliance/overview', { params })
  return res.data.data
}

export async function forceMatchComplianceRecord(
  id: string,
  payload: { reason: string; approver?: string; attachments?: string[] },
) {
  const res = await apiClient.post(`/finance/compliance/records/${encodeURIComponent(id)}/force-match`, payload)
  return res.data.data as { id: string; status: string }
}

export interface InvoiceFormData {
  type: string
  buyerName: string
  taxNumber: string
  addressPhone: string
  bankAccount: string
  email: string
  phone: string
  remark: string
}

export async function invoiceComplianceRecord(id: string, invoiceInfo: InvoiceFormData) {
  const res = await apiClient.post(`/finance/compliance/records/${encodeURIComponent(id)}/invoice`, {
    invoiceInfo,
  })
  return res.data.data as { id: string; status: string }
}

export async function batchInvoiceComplianceRecords(ids: string[], invoiceInfo: InvoiceFormData) {
  const res = await apiClient.post('/finance/compliance/batch-invoice', { ids, invoiceInfo })
  return res.data.data as { count: number }
}

export async function importBankStatements(lines: string[]) {
  const res = await apiClient.post('/finance/compliance/bank-import', { lines })
  return res.data.data as { matchedCount: number; batchId: string }
}
