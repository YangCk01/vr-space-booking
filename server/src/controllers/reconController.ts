import { Request, Response } from 'express'
import { format } from 'date-fns'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../utils/prisma'
import { success, error, paginated } from '../utils/response'
import { runManualRecon } from '../jobs/reconciliationJob'
import { refundByChannel } from '../services/channelRefundService'
import { testWebhook as testWebhookService } from '../services/notificationService'

/**
 * 获取对账批次列表
 * GET /recon/batches
 */
export async function listBatches(req: AuthenticatedRequest, res: Response) {
  try {
    const { page = '1', pageSize = '20', status } = req.query
    const pageNum = parseInt(page as string, 10)
    const sizeNum = parseInt(pageSize as string, 10)

    const where: any = {}
    if (status) where.status = status as string

    const total = await prisma.reconBatch.count({ where })
    const batches = await prisma.reconBatch.findMany({
      where,
      orderBy: { reconDate: 'desc' },
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum,
    })

    return paginated(res, batches, total, pageNum, sizeNum)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取单个批次详情
 * GET /recon/batches/:id
 */
export async function getBatch(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const batch = await prisma.reconBatch.findUnique({
      where: { id },
      include: {
        _count: { select: { exceptions: true } },
      },
    })
    if (!batch) return error(res, '批次不存在', 404)
    return success(res, batch)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取异常明细列表
 * GET /recon/exceptions
 */
export async function listExceptions(req: AuthenticatedRequest, res: Response) {
  try {
    const { batchId, type, status, dateFrom, dateTo } = req.query

    const where: any = {}
    if (batchId) where.batchId = batchId as string
    if (type) where.exceptionType = type as string
    if (status) where.exceptionStatus = status as string

    // 按对账日期范围筛选（通过 batch 关联）
    if (dateFrom || dateTo) {
      where.batch = {
        reconDate: {
          ...(dateFrom ? { gte: dateFrom as string } : {}),
          ...(dateTo ? { lte: dateTo as string } : {}),
        },
      }
    }

    const exceptions = await prisma.reconException.findMany({
      where,
      include: { batch: { select: { reconDate: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return success(res, exceptions, '查询成功')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取单个异常详情
 * GET /recon/exceptions/:id
 */
export async function getException(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const exception = await prisma.reconException.findUnique({
      where: { id },
      include: { batch: true },
    })
    if (!exception) return error(res, '异常记录不存在', 404)
    return success(res, exception)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 处理异常（带具体业务操作）
 * PUT /recon/exceptions/:id/handle
 *
 * 根据异常类型执行不同处理：
 * - AMOUNT_MISMATCH/FEE_MISMATCH + FIX → 创建 ADJUSTMENT 平账流水
 * - SHORT + FREEZE → 冻结用户余额
 * - LONG + REFUND → 调用渠道退款接口
 * - LONG + FIX → 补单（如信息充足）
 * - IGNORE → 仅标记状态
 */
export async function handleException(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { action, remark } = req.body
    const handlerId = req.user?.id
    const handlerName = req.user?.name || '系统'

    if (!action) return error(res, '请指定处理动作', 400)

    const exception = await prisma.reconException.findUnique({ where: { id } })
    if (!exception) return error(res, '异常记录不存在', 404)
    if (exception.exceptionStatus !== 'PENDING') {
      return error(res, '该异常已处理，不可重复操作', 400)
    }

    let fixTransactionId: string | undefined

    // ========== 执行业务操作 ==========
    if (action === 'FIX') {
      fixTransactionId = await handleFix(exception, remark, handlerId)
    } else if (action === 'FREEZE') {
      fixTransactionId = await handleFreeze(exception, remark, handlerId)
    } else if (action === 'REFUND') {
      await handleRefund(exception, remark)
    }

    const updated = await prisma.reconException.update({
      where: { id },
      data: {
        exceptionStatus: mapActionToStatus(action) as any,
        handleAction: action,
        handleRemark: remark,
        handlerId,
        handlerName,
        handledAt: new Date(),
        fixTransactionId: fixTransactionId || null,
      },
    })

    return success(res, updated, '处理完成')
  } catch (err) {
    console.error('[Recon] 异常处理失败:', err)
    return error(res, (err as Error).message, 500)
  }
}

/**
 * FIX 处理：创建平账流水
 */
async function handleFix(
  exc: any,
  remark?: string,
  handlerId?: string
): Promise<string | undefined> {
  const userId = await resolveUserId(exc)
  if (!userId) {
    console.warn(`[Recon] 无法确定用户ID，跳过创建平账流水: ${exc.id}`)
    return undefined
  }

  const amount = Math.abs(exc.diffAmount || 0)
  if (amount === 0) return undefined

  // 积分差异用 POINTS_EARN / POINTS_DEDUCT
  if (exc.exceptionType === 'STATUS_MISMATCH' && exc.bizType === 'USER') {
    const isPositive = (exc.bizAmount || 0) > 0
    const tx = await prisma.balanceTransaction.create({
      data: {
        userId,
        type: isPositive ? 'POINTS_EARN' : 'POINTS_DEDUCT',
        amount: 0,
        pointsAmount: isPositive ? amount : -amount,
        remark: `对账平账: ${remark || '人工调整'} (异常ID: ${exc.id.slice(0, 8)})`,
      },
    })
    return tx.id
  }

  // 资金差异用 ADJUSTMENT
  const tx = await prisma.balanceTransaction.create({
    data: {
      userId,
      type: 'ADJUSTMENT',
      amount,
      principalAmount: amount,
      bonusAmount: 0,
      totalAmount: amount,
      remark: `对账平账: ${remark || '人工调整'} (异常类型: ${exc.exceptionType}, ID: ${exc.id.slice(0, 8)})`,
    },
  })
  return tx.id
}

/**
 * FREEZE 处理：冻结用户余额（短款时使用）
 */
async function handleFreeze(
  exc: any,
  remark?: string,
  handlerId?: string
): Promise<string | undefined> {
  const userId = await resolveUserId(exc)
  if (!userId) {
    throw new Error('无法确定用户ID，无法执行冻结')
  }

  const amount = Math.abs(exc.diffAmount || 0)
  if (amount === 0) return undefined

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { principalBalance: true } })
  const freezeAmount = Math.min(amount, user?.principalBalance || 0)
  if (freezeAmount === 0) {
    throw new Error('用户本金余额为0，无法冻结')
  }

  await prisma.user.update({
    where: { id: userId },
    data: { principalBalance: { decrement: freezeAmount } },
  })

  const tx = await prisma.balanceTransaction.create({
    data: {
      userId,
      type: 'FREEZE',
      amount: freezeAmount,
      principalAmount: -freezeAmount,
      bonusAmount: 0,
      totalAmount: -freezeAmount,
      remark: `对账短款冻结: ${remark || '无备注'} (异常ID: ${exc.id.slice(0, 8)})`,
    },
  })
  return tx.id
}

/**
 * REFUND 处理：原路退回（长款时使用）
 */
async function handleRefund(exc: any, remark?: string): Promise<void> {
  if (!exc.channel || !exc.bizOrderNo) {
    throw new Error('缺少渠道或订单号信息，无法退款')
  }
  const result = await refundByChannel(
    exc.channel,
    exc.bizOrderNo,
    Math.abs(exc.channelAmount || exc.diffAmount || 0),
    `对账长款退回: ${remark || '无备注'}`
  )
  if (!result.success) {
    throw new Error(result.message || '退款接口调用失败')
  }
}

/**
 * 根据异常记录解析用户ID
 */
async function resolveUserId(exc: any): Promise<string | null> {
  if (exc.bizType === 'USER' && exc.bizOrderNo) {
    // 积分对账异常中 bizOrderNo 存的是 userId
    return exc.bizOrderNo
  }
  if (exc.bizOrderNo) {
    // 尝试从 Order 查
    const order = await prisma.order.findUnique({
      where: { orderNo: exc.bizOrderNo },
      select: { userId: true },
    })
    if (order?.userId) return order.userId

    // 尝试从 RechargeRecord 查
    const recharge = await prisma.rechargeRecord.findUnique({
      where: { id: exc.bizOrderNo },
      select: { userId: true },
    })
    if (recharge?.userId) return recharge.userId
  }
  return null
}

function mapActionToStatus(action: string): string {
  switch (action) {
    case 'FIX': return 'MANUAL_FIXED'
    case 'AUTO_FIX': return 'AUTO_FIXED'
    case 'FREEZE': return 'FROZEN'
    case 'REFUND': return 'REFUNDED'
    case 'IGNORE': return 'IGNORED'
    default: return 'PENDING'
  }
}

/**
 * 清空对账数据（管理员）
 * DELETE /recon/clear
 */
export async function clearReconData(req: AuthenticatedRequest, res: Response) {
  try {
    const delExc = await prisma.reconException.deleteMany()
    const delBatch = await prisma.reconBatch.deleteMany()
    return success(res, { deletedExceptions: delExc.count, deletedBatches: delBatch.count }, '对账数据已清空')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 测试 Webhook 连通性
 * POST /recon/webhook-test
 */
export async function testWebhook(req: AuthenticatedRequest, res: Response) {
  try {
    const { url, type } = req.body
    if (!url) return error(res, '请提供 Webhook URL', 400)

    const result = await testWebhookService(url, type || 'generic')
    return success(res, result, result.success ? '测试消息已发送' : '发送失败')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 手动触发对账
 * POST /recon/run
 */
export async function runRecon(req: AuthenticatedRequest, res: Response) {
  try {
    const { date } = req.body
    const dateStr = date || format(new Date(), 'yyyy-MM-dd')
    const result = await runManualRecon(dateStr)
    return success(res, result, '对账已触发')
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/**
 * 获取对账统计概览
 * GET /recon/summary
 */
export async function getSummary(req: AuthenticatedRequest, res: Response) {
  try {
    const totalBatches = await prisma.reconBatch.count()
    const pendingExceptions = await prisma.reconException.count({
      where: { exceptionStatus: 'PENDING' },
    })
    const todayBatch = await prisma.reconBatch.findFirst({
      orderBy: { reconDate: 'desc' },
    })

    return success(res, {
      totalBatches,
      pendingExceptions,
      lastReconDate: todayBatch?.reconDate || null,
      lastReconStatus: todayBatch?.status || null,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
