import { Response } from 'express'
import { ApprovalRequest, ApprovalStatus, ApprovalType } from '@prisma/client'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { logAudit } from '../middleware/auditLog'
import { executeNoShowDisposition, executeOrderRefund } from './orderController'

type NoShowRefundPayload = {
  action: 'NO_REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND'
  amount?: number
  reason: string
}

type OrderRefundPayload = {
  amount?: number
  reason: string
}

const APPROVER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'MANAGER']

function approvalTypeName(type: ApprovalType) {
  const names: Record<ApprovalType, string> = {
    NO_SHOW_REFUND: '已作废退款处置',
    ORDER_REFUND: '订单退款',
    BALANCE_ADJUST: '余额调整',
    POINTS_ADJUST: '积分调整',
    COUPON_GIFT: '优惠券赠送',
    ORDER_RESTORE: '撤销作废',
    ORDER_STATUS_CHANGE: '订单状态变更',
    BATCH_REFUND: '批量退款',
    BATCH_CANCEL: '批量取消',
    BATCH_VERIFY: '批量核销',
  }
  return names[type] || type
}

function canApproveRequest(userRole: string, approval: ApprovalRequest) {
  if (['SUPER_ADMIN', 'ADMIN', 'FINANCE'].includes(userRole)) return true
  if (userRole !== 'MANAGER') return false

  if (approval.type === 'NO_SHOW_REFUND') {
    const payload = approval.requestPayload as NoShowRefundPayload
    return payload.action !== 'FULL_REFUND' && (approval.amount || 0) <= 10000
  }
  if (approval.type === 'ORDER_REFUND') {
    return (approval.amount || 0) <= 10000
  }

  return false
}

function buildRequester(req: AuthenticatedRequest) {
  return {
    id: req.user?.id || '',
    name: req.user?.name || req.user?.phone || '未知用户',
    role: req.user?.role || 'UNKNOWN',
  }
}

export async function listApprovals(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      status,
      type,
      targetId,
      scope = 'all',
      page = '1',
      pageSize = '10',
    } = req.query

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const sizeNum = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 10))
    const where: any = {}

    if (status && status !== 'all') where.status = String(status).toUpperCase()
    if (type && type !== 'all') where.type = String(type).toUpperCase()
    if (targetId) where.targetId = String(targetId)
    if (scope === 'mine') where.requesterId = req.user?.id
    if (scope === 'todo') where.status = 'PENDING'
    if (!APPROVER_ROLES.includes(req.user?.role || '')) {
      where.requesterId = req.user?.id
    }

    const [items, total] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
      }),
      prisma.approvalRequest.count({ where }),
    ])

    return paginated(res, items, pageNum, sizeNum, total)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function createNoShowRefundApproval(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const action = String(req.body?.action || '').trim() as NoShowRefundPayload['action']
    const reason = String(req.body?.reason || '').trim()
    const requestedAmount = Number(req.body?.amount ?? 0)
    const requester = buildRequester(req)

    if (!['NO_REFUND', 'PARTIAL_REFUND', 'FULL_REFUND'].includes(action)) {
      return error(res, '请选择有效的处置方式', 400)
    }
    if (!reason) return error(res, '请填写审批申请原因', 400)

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
    })
    if (!order) return error(res, '订单不存在', 404)
    if (order.status !== 'NO_SHOW') {
      return error(res, '仅已作废订单可发起退款处置审批', 400)
    }

    const amount = action === 'NO_REFUND'
      ? 0
      : action === 'FULL_REFUND'
        ? order.amount
        : requestedAmount

    if (action === 'PARTIAL_REFUND' && (!Number.isInteger(amount) || amount <= 0 || amount >= order.amount)) {
      return error(res, '部分退款金额必须大于0且小于订单实付金额', 400)
    }

    const existing = await prisma.approvalRequest.findFirst({
      where: {
        type: 'NO_SHOW_REFUND',
        status: 'PENDING',
        targetType: 'ORDER',
        targetId: order.id,
      },
    })
    if (existing) {
      return error(res, '该订单已有待审批的退款处置申请，请勿重复提交', 400)
    }

    const retainedPenalty = Math.max(0, order.amount - amount)
    const approval = await prisma.approvalRequest.create({
      data: {
        type: 'NO_SHOW_REFUND',
        status: 'PENDING',
        targetType: 'ORDER',
        targetId: order.id,
        targetDesc: `订单 ${order.orderNo}`,
        requesterId: requester.id,
        requesterName: requester.name,
        requesterRole: requester.role,
        requestPayload: { action, amount, reason },
        beforeValue: {
          status: order.status,
          amount: order.amount,
          penaltyAmount: order.penaltyAmount,
          refundAmount: order.refundAmount,
        },
        afterValue: {
          status: action === 'NO_REFUND' ? 'NO_SHOW' : 'REFUNDED',
          refundAmount: amount,
          retainedPenalty,
          action,
        },
        amount,
        reason,
      },
    })

    await logAudit(req, {
      targetType: 'APPROVAL',
      targetId: approval.id,
      targetDesc: `${approvalTypeName(approval.type)}：${approval.targetDesc}`,
      action: 'POST',
      actionName: '发起审批',
      beforeValue: approval.beforeValue,
      afterValue: approval.afterValue,
      amount,
      reason,
    })

    return success(res, approval, '审批申请已提交')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function createOrderRefundApproval(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const reason = String(req.body?.reason || '').trim()
    const requestedAmount = Number(req.body?.amount ?? 0)
    const requester = buildRequester(req)

    if (!reason) return error(res, '请填写退款申请原因', 400)

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
    })
    if (!order) return error(res, '订单不存在', 404)
    if (!['PAID', 'READY_TO_VERIFY'].includes(order.status)) {
      return error(res, '该订单状态不允许发起退款审批', 400)
    }

    const amount = requestedAmount > 0 ? requestedAmount : order.amount
    if (!Number.isInteger(amount) || amount <= 0 || amount > order.amount) {
      return error(res, '退款金额不合法', 400)
    }

    const existing = await prisma.approvalRequest.findFirst({
      where: {
        type: 'ORDER_REFUND',
        status: 'PENDING',
        targetType: 'ORDER',
        targetId: order.id,
      },
    })
    if (existing) {
      return error(res, '该订单已有待审批的退款申请，请勿重复提交', 400)
    }

    const approval = await prisma.approvalRequest.create({
      data: {
        type: 'ORDER_REFUND',
        status: 'PENDING',
        targetType: 'ORDER',
        targetId: order.id,
        targetDesc: `订单 ${order.orderNo}`,
        requesterId: requester.id,
        requesterName: requester.name,
        requesterRole: requester.role,
        requestPayload: { amount, reason },
        beforeValue: { status: order.status, amount: order.amount, refundAmount: order.refundAmount },
        afterValue: { status: 'REFUNDED', refundAmount: amount },
        amount,
        reason,
      },
    })

    await logAudit(req, {
      targetType: 'APPROVAL',
      targetId: approval.id,
      targetDesc: `${approvalTypeName(approval.type)}：${approval.targetDesc}`,
      action: 'POST',
      actionName: '发起审批',
      beforeValue: approval.beforeValue,
      afterValue: approval.afterValue,
      amount,
      reason,
    })

    return success(res, approval, '退款审批申请已提交')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function approveApproval(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string
  const comment = String(req.body?.comment || '').trim()

  try {
    const approval = await prisma.approvalRequest.findUnique({ where: { id } })
    if (!approval) return error(res, '审批申请不存在', 404)
    if (approval.status !== 'PENDING') return error(res, '该审批已处理', 400)

    const approverRole = req.user?.role || ''
    if (!APPROVER_ROLES.includes(approverRole) || !canApproveRequest(approverRole, approval)) {
      return error(res, '当前角色无权审批该申请', 403)
    }
    if (approval.requesterId === req.user?.id && approverRole !== 'SUPER_ADMIN') {
      return error(res, '审批申请不能由发起人本人审批', 403)
    }

    let execution: any = null

    try {
      if (approval.type === 'NO_SHOW_REFUND') {
        const payload = approval.requestPayload as NoShowRefundPayload
        execution = await executeNoShowDisposition({
          orderIdOrNo: approval.targetId,
          action: payload.action,
          amount: payload.amount,
          reason: payload.reason,
          req,
        })
      } else if (approval.type === 'ORDER_REFUND') {
        const payload = approval.requestPayload as OrderRefundPayload
        execution = await executeOrderRefund({
          orderIdOrNo: approval.targetId,
          amount: payload.amount,
          reason: payload.reason,
          req,
        })
      } else {
        throw new Error('该审批类型暂未接入自动执行')
      }
    } catch (executeErr) {
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: 'EXECUTION_FAILED',
          approverId: req.user?.id,
          approverName: req.user?.name || req.user?.phone || '未知用户',
          approverRole,
          approvalComment: comment || (executeErr as Error).message,
        },
      })
      throw executeErr
    }

    const updated = await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: 'APPROVED',
        approverId: req.user?.id,
        approverName: req.user?.name || req.user?.phone || '未知用户',
        approverRole,
        approvalComment: comment || '同意',
        beforeValue: execution?.beforeValue ?? undefined,
        afterValue: execution?.afterValue ?? undefined,
        amount: execution?.amount ?? approval.amount,
        approvedAt: new Date(),
        executedAt: new Date(),
      },
    })

    await logAudit(req, {
      targetType: 'APPROVAL',
      targetId: approval.id,
      targetDesc: `${approvalTypeName(approval.type)}：${approval.targetDesc}`,
      action: 'POST',
      actionName: '审批通过',
      beforeValue: { status: approval.status },
      afterValue: { status: 'APPROVED', approvalComment: updated.approvalComment },
      amount: updated.amount || undefined,
      reason: updated.approvalComment || '审批通过',
    })

    return success(res, updated, '审批已通过并执行')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

export async function rejectApproval(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const comment = String(req.body?.comment || '').trim()
    if (!comment) return error(res, '请填写拒绝原因', 400)

    const approval = await prisma.approvalRequest.findUnique({ where: { id } })
    if (!approval) return error(res, '审批申请不存在', 404)
    if (approval.status !== 'PENDING') return error(res, '该审批已处理', 400)

    const approverRole = req.user?.role || ''
    if (!APPROVER_ROLES.includes(approverRole) || !canApproveRequest(approverRole, approval)) {
      return error(res, '当前角色无权审批该申请', 403)
    }
    if (approval.requesterId === req.user?.id && approverRole !== 'SUPER_ADMIN') {
      return error(res, '审批申请不能由发起人本人审批', 403)
    }

    const updated = await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: 'REJECTED',
        approverId: req.user?.id,
        approverName: req.user?.name || req.user?.phone || '未知用户',
        approverRole,
        approvalComment: comment,
        rejectedAt: new Date(),
      },
    })

    await logAudit(req, {
      targetType: 'APPROVAL',
      targetId: approval.id,
      targetDesc: `${approvalTypeName(approval.type)}：${approval.targetDesc}`,
      action: 'POST',
      actionName: '审批拒绝',
      beforeValue: { status: approval.status },
      afterValue: { status: 'REJECTED', approvalComment: comment },
      amount: approval.amount || undefined,
      reason: comment,
    })

    return success(res, updated, '审批已拒绝')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
