import { Response } from 'express'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, paginated, error } from '../utils/response'
import { logAudit } from '../middleware/auditLog'
import {
  auditConfig,
  buildAuditRecords,
  buildVouchers,
  computeAuditStatus,
} from './financeController'

const TAX_RATE = 0.06

function toYuan(cents: number): number {
  return Number((cents / 100).toFixed(2))
}

function amountRecordToYuan(record: any) {
  return {
    ...record,
    originalPrice: toYuan(record.originalPrice),
    platformFee: toYuan(record.platformFee),
    gatewayFee: toYuan(record.gatewayFee),
    expectedRecv: toYuan(record.expectedRecv),
    actualRecv: toYuan(record.actualRecv),
    discountBreakdown: (record.discountBreakdown || []).map((d: any) => ({
      ...d,
      amount: toYuan(d.amount),
    })),
    invoice: {
      ...record.invoice,
      status: record.invoice.status,
      amount: toYuan(record.invoice.amount),
      taxAmount: toYuan(Math.round(record.invoice.amount * (record.invoice.taxRate / 100))),
      taxRate: record.invoice.taxRate / 100,
    },
    assetChange: record.assetChange
      ? {
          ...record.assetChange,
          value: record.assetChange.value !== undefined ? toYuan(record.assetChange.value) : undefined,
          principal: record.assetChange.principal !== undefined ? toYuan(record.assetChange.principal) : undefined,
          gift: record.assetChange.gift !== undefined ? toYuan(record.assetChange.gift) : undefined,
          principalUsed: record.assetChange.principalUsed !== undefined ? toYuan(record.assetChange.principalUsed) : undefined,
          giftUsed: record.assetChange.giftUsed !== undefined ? toYuan(record.assetChange.giftUsed) : undefined,
        }
      : null,
    vouchers: (record.vouchers || []).map((v: any) => ({
      ...v,
      debit: toYuan(v.debit),
      credit: toYuan(v.credit),
    })),
  }
}

async function enrichRecords(records: any[]) {
  const ids = records.map((r) => r.id)
  const bankStatements = await prisma.reconBankStatement.findMany({
    where: {
      abstract: { contains: '订单号:' },
    },
    orderBy: { createdAt: 'desc' },
  })

  return records.map((record) => {
    // 发票标记
    const invoiceLog = record.auditLog?.find((log: any) => log.action === 'FINANCE_COMPLIANCE_INVOICE')
    if (invoiceLog) {
      const after = invoiceLog.afterValue || {}
      record.invoice = {
        status: 'issued',
        amount: after.amount ?? record.invoice.amount,
        taxRate: record.invoice.taxRate,
        type: after.type || '增值税电子普票',
        info: after.invoiceInfo || null,
      }
    }

    // 银行流水匹配：按单号模糊匹配
    const matchedStatement = bankStatements.find((stmt) =>
      stmt.abstract?.includes(`订单号:${record.id}`),
    )
    if (matchedStatement) {
      const stmtAmount = matchedStatement.creditAmount - matchedStatement.debitAmount
      record.bankStatus = 'arrived'
      record.actualRecv = stmtAmount
      record.status = computeAuditStatus(
        record.actualRecv,
        record.expectedRecv,
        record.consumeStatus,
        record.bankStatus,
      )
      // 重新生成凭证
      record.vouchers = buildVouchers(record, record.invoice.taxRate)
    }

    return amountRecordToYuan(record)
  })
}

function applyTabFilter(records: any[], tab: string) {
  switch (tab) {
    case 'unconsumed':
      return records.filter((r) => r.consumeStatus === 'unconsumed')
    case 'transit':
      return records.filter((r) => r.bankStatus === 'in_transit')
    case 'invoice':
      return records.filter((r) => r.invoice.status === 'pending')
    case 'cancelled':
      return records.filter((r) => r.consumeStatus === 'cancelled')
    case 'exception':
      return records.filter((r) => !['matched', 'refunded'].includes(r.status))
    default:
      return records
  }
}

function computeOverview(records: any[]) {
  let gtv = 0
  let forwardGtv = 0
  let refund = 0
  let revenue = 0
  let discount = 0
  let platformFee = 0
  let gatewayFee = 0
  let netRecv = 0
  let deferred = 0
  let rechargeLiability = 0
  let pendingInvoice = 0
  let exceptions = 0
  let pointsCost = 0

  records.forEach((r) => {
    const expected = r.expectedRecv
    const actual = r.actualRecv
    const isRefund = r.consumeStatus === 'refunded'
    const discountTotal = (r.discountBreakdown || []).reduce(
      (sum: number, d: any) => sum + Math.abs(d.amount),
      0,
    )

    gtv += Math.abs(r.originalPrice)
    if (isRefund) {
      refund += Math.abs(actual)
    } else {
      forwardGtv += Math.abs(r.originalPrice)
    }
    discount += discountTotal
    platformFee += Math.abs(r.platformFee)
    gatewayFee += Math.abs(r.gatewayFee)
    netRecv += actual

    if (r.invoice.status === 'pending') pendingInvoice++
    if (!['matched', 'refunded'].includes(r.status)) exceptions++

    if (isRefund) {
      revenue -= Math.abs(r.originalPrice) / (1 + TAX_RATE)
    } else if (r.consumeStatus === 'consumed') {
      revenue += expected / (1 + TAX_RATE)
    } else if (r.consumeStatus === 'unconsumed') {
      deferred += expected
    }

    if (r.consumeStatus === 'recharge') {
      rechargeLiability += (r.assetChange?.principal || 0) + (r.assetChange?.gift || 0)
    } else if (r.paymentMethod === '储值余额' && r.consumeStatus === 'consumed') {
      rechargeLiability -= r.assetChange?.value || 0
    }

    if (r.assetChange?.type === 'points_added') {
      pointsCost += r.assetChange.value * 0.05
    }
  })

  return {
    gtv,
    forwardGtv,
    refund,
    revenue,
    discount,
    platformFee,
    gatewayFee,
    netRecv,
    deferred,
    rechargeLiability: Math.max(0, rechargeLiability),
    pendingInvoice,
    exceptions,
    pointsCost,
  }
}

export async function getComplianceRecords(req: AuthenticatedRequest, res: Response) {
  try {
    const page = parseInt(String(req.query.page || '1'), 10)
    const pageSize = parseInt(String(req.query.pageSize || '20'), 10)
    const tab = String(req.query.tab || 'all')

    const records = await buildAuditRecords({
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      venueId: req.query.venueId as string | undefined,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      store: req.query.store as string | undefined,
    })

    // 门店列表不跟随日期/搜索等筛选条件，始终返回全部可用门店
    const allStoreRecords = await buildAuditRecords({})

    const allEnriched = await enrichRecords(records)
    const filtered = applyTabFilter(allEnriched, tab)
    const data = filtered.slice((page - 1) * pageSize, page * pageSize)

    return success(res, {
      data,
      meta: {
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
      overview: computeOverview(allEnriched),
      stores: Array.from(new Set(allStoreRecords.map((r) => r.store).filter(Boolean))),
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getComplianceOverview(req: AuthenticatedRequest, res: Response) {
  try {
    const records = await buildAuditRecords({
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      venueId: req.query.venueId as string | undefined,
      store: req.query.store as string | undefined,
    })
    return success(res, {
      overview: computeOverview(records),
      stores: Array.from(new Set(records.map((r) => r.store).filter(Boolean))),
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function forceMatchComplianceRecord(req: AuthenticatedRequest, res: Response) {
  try {
    const { reason, approver, attachments = [] } = req.body || {}
    if (!reason || !String(reason).trim()) return error(res, '请填写平账原因', 400)

    const records = await buildAuditRecords({})
    const record = records.find((item) => item.id === req.params.id || item.sourceId === req.params.id)
    if (!record) return error(res, '记录不存在', 404)

    await logAudit(req, {
      action: 'FINANCE_AUDIT_FORCE_MATCH',
      actionName: '业财合规人工平账',
      targetType: 'FINANCE_AUDIT_RECORD',
      targetId: record.id,
      targetDesc: `${record.store} ${record.type}`,
      beforeValue: {
        expectedRecv: record.expectedRecv,
        actualRecv: record.actualRecv,
        status: record.status,
      },
      afterValue: {
        expectedRecv: record.expectedRecv,
        actualRecv: record.expectedRecv,
        status: 'matched',
        approver: approver || '',
      },
      diffValue: { diff: record.actualRecv - record.expectedRecv },
      amount: record.actualRecv - record.expectedRecv,
      reason: `${reason}${approver ? `；审批人：${approver}` : ''}${attachments.length ? `；附件：${attachments.join(',')}` : ''}`,
    })

    return success(res, { id: record.id, status: 'matched' }, '已记录人工平账')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

function validateInvoiceInfo(info: any) {
  if (!info || typeof info !== 'object') return '请填写发票信息'
  if (!String(info.buyerName || '').trim()) return '请填写购买方名称'
  const email = String(info.email || '').trim()
  if (!email) return '请填写收票人邮箱'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '收票人邮箱格式不正确'
  return null
}

function buildInvoiceAfterValue(record: any, config: ReturnType<typeof auditConfig>, invoiceInfo: any) {
  const amount = Math.round(record.expectedRecv / (1 + config.taxRate / 100))
  const taxAmount = record.expectedRecv - amount
  return {
    invoice: {
      status: 'issued',
      amount,
      taxAmount,
      type: invoiceInfo?.type || '增值税电子普票',
    },
    invoiceInfo: {
      type: invoiceInfo?.type || '增值税电子普票',
      buyerName: String(invoiceInfo?.buyerName || '').trim(),
      taxNumber: String(invoiceInfo?.taxNumber || '').trim(),
      addressPhone: String(invoiceInfo?.addressPhone || '').trim(),
      bankAccount: String(invoiceInfo?.bankAccount || '').trim(),
      email: String(invoiceInfo?.email || '').trim(),
      phone: String(invoiceInfo?.phone || '').trim(),
      remark: String(invoiceInfo?.remark || '').trim(),
    },
  }
}

export async function invoiceComplianceRecord(req: AuthenticatedRequest, res: Response) {
  try {
    const records = await buildAuditRecords({})
    const record = records.find((item) => item.id === req.params.id || item.sourceId === req.params.id)
    if (!record) return error(res, '记录不存在', 404)
    if (record.invoice.status === 'none') return error(res, '该单据不可开票', 400)

    const { invoiceInfo } = req.body || {}
    const validationError = validateInvoiceInfo(invoiceInfo)
    if (validationError) return error(res, validationError, 400)

    const config = auditConfig()
    const afterValue = buildInvoiceAfterValue(record, config, invoiceInfo)

    await logAudit(req, {
      action: 'FINANCE_COMPLIANCE_INVOICE',
      actionName: '业财合规开票',
      targetType: 'FINANCE_AUDIT_RECORD',
      targetId: record.id,
      targetDesc: `${record.store} ${record.type}`,
      beforeValue: { invoice: record.invoice },
      afterValue,
      amount: afterValue.invoice.amount,
      reason: `开具${afterValue.invoice.type}，购买方：${afterValue.invoiceInfo.buyerName}`,
    })

    return success(res, { id: record.id, status: 'issued' }, '开票成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function batchInvoiceComplianceRecords(req: AuthenticatedRequest, res: Response) {
  try {
    const { ids, invoiceInfo } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) return error(res, '请选择开票记录', 400)

    const validationError = validateInvoiceInfo(invoiceInfo)
    if (validationError) return error(res, validationError, 400)

    const records = await buildAuditRecords({})
    const results: string[] = []

    for (const id of ids) {
      const record = records.find((item) => item.id === id || item.sourceId === id)
      if (!record || record.invoice.status !== 'pending') continue
      const config = auditConfig()
      const afterValue = buildInvoiceAfterValue(record, config, invoiceInfo)
      await logAudit(req, {
        action: 'FINANCE_COMPLIANCE_INVOICE',
        actionName: '业财合规批量开票',
        targetType: 'FINANCE_AUDIT_RECORD',
        targetId: record.id,
        targetDesc: `${record.store} ${record.type}`,
        beforeValue: { invoice: record.invoice },
        afterValue,
        amount: afterValue.invoice.amount,
        reason: `批量开具${afterValue.invoice.type}，购买方：${afterValue.invoiceInfo.buyerName}`,
      })
      results.push(record.id)
    }

    return success(res, { count: results.length }, `成功开具 ${results.length} 张发票`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function importBankStatements(req: AuthenticatedRequest, res: Response) {
  try {
    const { lines } = req.body || {}
    if (!Array.isArray(lines) || lines.length === 0) return error(res, '请提供银行流水', 400)

    const records = await buildAuditRecords({})
    const batchId = `COMPLIANCE-${Date.now()}`
    let matchedCount = 0

    for (const line of lines) {
      const [id, amountStr, dateStr] = String(line).split(',').map((s) => s.trim())
      const amount = parseFloat(amountStr)
      if (!id || isNaN(amount)) continue

      const record = records.find((item) => item.id === id || item.sourceId === id)
      if (!record) continue

      const creditAmount = amount > 0 ? Math.round(amount * 100) : 0
      const debitAmount = amount < 0 ? Math.round(Math.abs(amount) * 100) : 0

      await prisma.reconBankStatement.create({
        data: {
          batchId,
          bankSerialNo: `${batchId}-${matchedCount}`,
          bankName: '合规导入',
          accountNo: '-',
          transactionDate: new Date(dateStr || Date.now()),
          counterpartyName: record.store || '-',
          creditAmount,
          debitAmount,
          balance: 0,
          abstract: `订单号:${record.id}; 实收:${amount}`,
        },
      })

      await logAudit(req, {
        action: 'BANK_IMPORT_MATCH',
        actionName: '银行流水导入匹配',
        targetType: 'FINANCE_AUDIT_RECORD',
        targetId: record.id,
        targetDesc: `${record.store} ${record.type}`,
        beforeValue: { actualRecv: record.actualRecv, bankStatus: record.bankStatus },
        afterValue: { actualRecv: Math.round(amount * 100), bankStatus: 'arrived' },
        amount: Math.round(amount * 100),
        reason: `银行流水导入，实收更新为 ${amount.toFixed(2)} 元`,
      })

      matchedCount++
    }

    return success(res, { matchedCount, batchId }, `成功匹配并导入 ${matchedCount} 条银行流水`)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
