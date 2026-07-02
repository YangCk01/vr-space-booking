import { ValidationError } from './errors'
import type { NoShowDispositionAction } from './refundPolicy'

export interface RefundRequestContract {
  amount: number
  reason: string
}

export interface NoShowDispositionRequestContract {
  action: NoShowDispositionAction
  amount: number
  reason: string
}

function parseAmount(value: unknown): number {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) {
    throw new ValidationError('金额格式错误', 'INVALID_AMOUNT')
  }
  return amount
}

export function parseRefundRequest(body: any): RefundRequestContract {
  const reason = String(body?.reason || '').trim()
  if (!reason) {
    throw new ValidationError('请填写退款原因', 'REFUND_REASON_REQUIRED')
  }
  return {
    amount: parseAmount(body?.amount),
    reason,
  }
}

export function parseNoShowDispositionRequest(body: any): NoShowDispositionRequestContract {
  const action = String(body?.action || '').trim() as NoShowDispositionAction
  if (!['NO_REFUND', 'PARTIAL_REFUND', 'FULL_REFUND'].includes(action)) {
    throw new ValidationError('请选择有效的处置方式', 'INVALID_NO_SHOW_DISPOSITION')
  }

  const reason = String(body?.reason || '').trim()
  if (!reason) {
    throw new ValidationError('请填写退款处置原因', 'NO_SHOW_REASON_REQUIRED')
  }

  return {
    action,
    amount: parseAmount(body?.amount),
    reason,
  }
}
