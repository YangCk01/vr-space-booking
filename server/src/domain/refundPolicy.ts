import type { OrderStatus } from '@prisma/client'
import { calculateRefundSplitFromDeduction } from './walletLedger'

export type NoShowDispositionAction = 'NO_REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND'

export interface OrderRefundInput {
  requestedAmount: number
  orderAmount: number
  payMethod: string | null | undefined
  principalDeduction: number | null | undefined
  bonusDeduction: number | null | undefined
}

export interface OrderRefundResult {
  actualRefund: number
  isBalancePay: boolean
  principalAmount: number
  bonusAmount: number
  totalAmount: number
}

export interface NoShowDispositionInput {
  action: NoShowDispositionAction
  requestedAmount: number
  orderAmount: number
  originalPenaltyAmount: number | null | undefined
}

export interface NoShowDispositionResult {
  actualRefund: number
  retainedPenalty: number
  reversedPenaltyAmount: number
}

const REFUNDABLE_STATUSES: OrderStatus[] = ['PAID', 'READY_TO_VERIFY', 'COMPLETED']

export function ensureOrderRefundable(status: OrderStatus): void {
  if (status === 'NO_SHOW') {
    throw new Error('已作废订单请使用退款处置流程')
  }
  if (!REFUNDABLE_STATUSES.includes(status)) {
    throw new Error('该订单状态不允许退款')
  }
}

export function calculateOrderRefund(input: OrderRefundInput): OrderRefundResult {
  const actualRefund = input.requestedAmount > 0 ? input.requestedAmount : input.orderAmount
  if (!Number.isInteger(actualRefund) || actualRefund <= 0 || actualRefund > input.orderAmount) {
    throw new Error('退款金额不合法')
  }

  const isBalancePay = Boolean(input.payMethod?.startsWith('BALANCE'))
  if (!isBalancePay) {
    return {
      actualRefund,
      isBalancePay,
      principalAmount: 0,
      bonusAmount: 0,
      totalAmount: actualRefund,
    }
  }

  const split = calculateRefundSplitFromDeduction({
    originalPrincipalDeduction: input.principalDeduction || 0,
    originalBonusDeduction: input.bonusDeduction || 0,
    refundAmount: actualRefund,
  })

  return {
    actualRefund: split.amount,
    isBalancePay,
    principalAmount: split.principalAmount,
    bonusAmount: split.bonusAmount,
    totalAmount: split.totalAmount,
  }
}

export function calculateNoShowDisposition(input: NoShowDispositionInput): NoShowDispositionResult {
  if (!['NO_REFUND', 'PARTIAL_REFUND', 'FULL_REFUND'].includes(input.action)) {
    throw new Error('请选择有效的处置方式')
  }

  const actualRefund = input.action === 'NO_REFUND'
    ? 0
    : input.action === 'FULL_REFUND'
      ? input.orderAmount
      : input.requestedAmount

  if (input.action === 'PARTIAL_REFUND' && (!Number.isInteger(actualRefund) || actualRefund <= 0 || actualRefund >= input.orderAmount)) {
    throw new Error('部分退款金额必须大于0且小于订单实付金额')
  }
  if (input.action === 'FULL_REFUND' && input.orderAmount <= 0) {
    throw new Error('订单金额不合法')
  }

  const retainedPenalty = Math.max(0, input.orderAmount - actualRefund)
  const originalPenalty = input.originalPenaltyAmount ?? input.orderAmount
  const reversedPenaltyAmount = Math.max(0, originalPenalty - retainedPenalty)

  return {
    actualRefund,
    retainedPenalty,
    reversedPenaltyAmount,
  }
}
