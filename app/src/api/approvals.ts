import { apiClient } from './client'

export type ApprovalType =
  | 'NO_SHOW_REFUND'
  | 'ORDER_REFUND'
  | 'BALANCE_ADJUST'
  | 'POINTS_ADJUST'
  | 'COUPON_GIFT'
  | 'ORDER_RESTORE'
  | 'ORDER_STATUS_CHANGE'
  | 'BATCH_REFUND'
  | 'BATCH_CANCEL'
  | 'BATCH_VERIFY'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXECUTION_FAILED'

export interface ApprovalRequest {
  id: string
  type: ApprovalType
  status: ApprovalStatus
  targetType: string
  targetId: string
  targetDesc?: string
  requesterId: string
  requesterName: string
  requesterRole: string
  approverId?: string | null
  approverName?: string | null
  approverRole?: string | null
  requestPayload: any
  beforeValue?: any
  afterValue?: any
  amount?: number | null
  reason: string
  approvalComment?: string | null
  executedAt?: string | null
  approvedAt?: string | null
  rejectedAt?: string | null
  createdAt: string
  updatedAt: string
}

export async function getApprovals(params?: {
  status?: string
  type?: string
  targetId?: string
  scope?: 'all' | 'mine' | 'todo'
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/approvals', { params })
  return res.data
}

export async function createNoShowRefundApproval(
  orderId: string,
  payload: { action: 'NO_REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND'; amount?: number; reason: string }
) {
  const res = await apiClient.post(`/approvals/orders/${orderId}/no-show-refund`, payload)
  return res.data.data as ApprovalRequest
}

export async function createOrderRefundApproval(
  orderId: string,
  payload: { amount?: number; reason: string }
) {
  const res = await apiClient.post(`/approvals/orders/${orderId}/refund`, payload)
  return res.data.data as ApprovalRequest
}

export async function approveApproval(id: string, comment?: string) {
  const res = await apiClient.post(`/approvals/${id}/approve`, { comment })
  return res.data.data as ApprovalRequest
}

export async function rejectApproval(id: string, comment: string) {
  const res = await apiClient.post(`/approvals/${id}/reject`, { comment })
  return res.data.data as ApprovalRequest
}
