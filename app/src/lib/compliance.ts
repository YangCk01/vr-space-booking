/*
 * 业财合规控制台工具函数与类型定义
 * 金额单位：元（前端展示口径），真实数据由 API 从后端分转元后得到
 */

export const TAX_RATE = 0.06 // 默认服务税率 6%（增值税）

export type ConsumeStatus = 'consumed' | 'unconsumed' | 'recharge' | 'refunded'
export type BankStatus = 'in_transit' | 'arrived' | 'internal' | 'pending_recon'
export type RecordStatus = 'matched' | 'short' | 'over' | 'diff' | 'refunded'
export type InvoiceStatus = 'none' | 'pending' | 'issued' | 'red_ink'
export type AssetChangeType =
  | 'points_added'
  | 'points_deducted'
  | 'recharge'
  | 'balance_reserved'
  | 'balance_used'

export interface DiscountItem {
  name: string
  amount: number
}

export interface AssetChange {
  type: AssetChangeType
  value?: number
  source?: string
  principal?: number
  gift?: number
  principalUsed?: number
  giftUsed?: number
  principalRatio?: number
  giftRatio?: number
}

export interface InvoiceInfo {
  type: string
  buyerName: string
  taxNumber: string
  addressPhone: string
  bankAccount: string
  email: string
  phone: string
  remark: string
}

export interface Invoice {
  status: InvoiceStatus
  amount: number
  taxRate: number
  taxAmount: number
  type?: string
  originalInvoiceId?: string
  info?: InvoiceInfo | null
}

export interface AuditLogEntry {
  id: string
  time: string
  operator: string
  action: string
  reason: string
  attachments: string[]
}

export interface VoucherEntry {
  subject: string
  debit: number
  credit: number
  summary: string
}

export interface ComplianceRecord {
  id: string
  sourceId?: string
  sourceType?: 'ORDER' | 'RECHARGE'
  store: string
  operator: string
  channel: string
  paymentMethod: string
  payMethod?: string
  type: string
  consumeStatus: ConsumeStatus
  originalPrice: number
  discountBreakdown: DiscountItem[]
  platformFee: number
  gatewayFee: number
  actualRecv: number
  settlementCycle: string
  bankStatus: BankStatus
  assetChange: AssetChange | null
  invoice: Invoice
  orderTime: string
  reconTime: string
  remark: string
  auditLog: AuditLogEntry[]
  relatedOrderId: string | null
  userName?: string
  userPhone?: string
  expectedRecv?: number
  status?: RecordStatus
  vouchers?: VoucherEntry[]
  forceMatched?: boolean
  forceMatchReason?: string
}

export function computeExpectedRecv(record: ComplianceRecord): number {
  const discountTotal = (record.discountBreakdown || []).reduce((sum, d) => sum + d.amount, 0)
  return Number(
    (record.originalPrice + discountTotal + record.platformFee + record.gatewayFee).toFixed(2),
  )
}

export function computeInvoiceAmount(record: ComplianceRecord): number {
  const base = Math.abs(record.expectedRecv || computeExpectedRecv(record))
  return Number((base / (1 + TAX_RATE)).toFixed(2))
}

export function computeTaxAmount(amount: number): number {
  return Number((amount * TAX_RATE).toFixed(2))
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '¥ --'
  const absVal = Math.abs(value).toFixed(2)
  return `${value < 0 ? '-' : ''}¥ ${absVal}`
}

export function formatMoneyRaw(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '--'
  return `${value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}`
}

// 生成会计分录（前端兜底计算，真实数据优先使用后端返回的 vouchers）
export function generateVouchers(record: ComplianceRecord): VoucherEntry[] {
  const vouchers: VoucherEntry[] = []
  const recv = record.expectedRecv || computeExpectedRecv(record)
  const actual = record.actualRecv ?? recv
  const gatewayFee = Math.abs(record.gatewayFee)

  if (record.consumeStatus === 'recharge') {
    const principal = record.assetChange?.principal || recv
    const gift = record.assetChange?.gift || 0
    vouchers.push(
      { subject: '银行存款', debit: actual, credit: 0, summary: '会员充值实收' },
      { subject: '销售费用-支付手续费', debit: gatewayFee, credit: 0, summary: '充值支付手续费' },
      { subject: '合同负债-会员本金', debit: 0, credit: principal, summary: '会员充值本金（负债）' },
      { subject: '合同负债-会员赠金', debit: 0, credit: gift, summary: '会员充值赠金（负债）' },
    )
  } else if (record.consumeStatus === 'refunded') {
    vouchers.push(
      {
        subject: '主营业务收入',
        debit: Math.abs(record.originalPrice) / (1 + TAX_RATE),
        credit: 0,
        summary: '退款冲减收入',
      },
      {
        subject: '应交税费-应交增值税（销项）',
        debit: computeTaxAmount(Math.abs(record.originalPrice) / (1 + TAX_RATE)),
        credit: 0,
        summary: '退款冲减销项税',
      },
      { subject: '银行存款', debit: 0, credit: Math.abs(actual), summary: '退款原路退回' },
    )
  } else if (record.paymentMethod === '储值余额') {
    const revenue = recv / (1 + TAX_RATE)
    vouchers.push(
      {
        subject: '合同负债-会员本金',
        debit: record.assetChange?.value || recv,
        credit: 0,
        summary: '储值余额核销',
      },
      { subject: '主营业务收入', debit: 0, credit: revenue, summary: '储值消费确认收入' },
      {
        subject: '应交税费-应交增值税（销项）',
        debit: 0,
        credit: computeTaxAmount(revenue),
        summary: '计提销项税',
      },
    )
  } else {
    const revenue = recv / (1 + TAX_RATE)
    vouchers.push(
      { subject: '应收账款/银行存款', debit: actual, credit: 0, summary: '实际收款的资产' },
      { subject: '主营业务收入', debit: 0, credit: revenue, summary: '确认收入' },
      {
        subject: '应交税费-应交增值税（销项）',
        debit: 0,
        credit: computeTaxAmount(revenue),
        summary: '计提销项税',
      },
    )
  }

  return vouchers
}

export function computeRecordStatus(
  record: ComplianceRecord,
  actualRecv?: number,
  expectedRecv?: number,
): RecordStatus {
  const diff = Number(
    ((actualRecv ?? record.actualRecv) - (expectedRecv ?? record.expectedRecv ?? 0)).toFixed(2),
  )
  if (record.consumeStatus === 'refunded') return 'refunded'
  if (record.bankStatus === 'internal' || record.consumeStatus === 'unconsumed') return 'matched'
  if (diff < -0.01) return 'short'
  if (diff > 0.01) return 'over'
  return 'matched'
}

export function addAuditLog(
  record: ComplianceRecord,
  action: string,
  operator: string,
  reason: string,
  attachments: string[] = [],
): ComplianceRecord {
  return {
    ...record,
    auditLog: [
      ...(record.auditLog || []),
      {
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        time: new Date().toLocaleString('zh-CN'),
        operator,
        action,
        reason,
        attachments,
      },
    ],
  }
}
