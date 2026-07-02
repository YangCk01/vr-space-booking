import { z } from 'zod'
import { idParamSchema } from '../contracts/common'
import { payOrderSchema, refundOrderSchema } from '../contracts/order'
import { createRechargeSchema, confirmRechargeSchema } from '../contracts/recharge'
import { openApiRegistry } from './registry'

let registered = false

const responseMetaSchema = z.object({
  requestId: z.string().optional(),
  timestamp: z.string(),
})

const successResponseSchema = z.object({
  code: z.literal(0),
  message: z.string(),
  data: z.unknown(),
  meta: responseMetaSchema,
})

const errorResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  details: z.unknown().optional(),
  meta: responseMetaSchema,
})

function jsonBody(schema: z.ZodTypeAny) {
  return {
    content: {
      'application/json': { schema },
    },
  }
}

function standardResponses(successDescription: string) {
  return {
    200: {
      description: successDescription,
      content: {
        'application/json': { schema: successResponseSchema },
      },
    },
    400: {
      description: '请求参数或业务规则不通过',
      content: {
        'application/json': { schema: errorResponseSchema },
      },
    },
    401: {
      description: '未登录或登录已过期',
      content: {
        'application/json': { schema: errorResponseSchema },
      },
    },
  }
}

export function registerCoreRoutes(): void {
  if (registered) return
  registered = true

  openApiRegistry.registerPath({
    method: 'post',
    path: '/recharges',
    tags: ['Recharge'],
    summary: '创建线下充值订单',
    description: '真实线上支付未接入前，必须选择归属门店，且仅允许现金或刷卡收款。',
    request: {
      body: {
        required: true,
        ...jsonBody(createRechargeSchema),
      },
    },
    responses: standardResponses('充值订单创建成功'),
  })

  openApiRegistry.registerPath({
    method: 'post',
    path: '/recharges/confirm',
    tags: ['Recharge'],
    summary: '确认线下充值到账',
    description: '用于人工确认现金/刷卡充值已收款，确认后写入全局余额与门店余额。',
    request: {
      body: {
        required: true,
        ...jsonBody(confirmRechargeSchema),
      },
    },
    responses: standardResponses('充值确认成功'),
  })

  openApiRegistry.registerPath({
    method: 'put',
    path: '/orders/{id}/pay',
    tags: ['Order'],
    summary: '订单收款',
    description: '真实微信/支付宝支付未接入前，仅允许余额、现金或刷卡收款。',
    request: {
      params: idParamSchema,
      body: {
        required: true,
        ...jsonBody(payOrderSchema),
      },
    },
    responses: standardResponses('订单支付成功'),
  })

  openApiRegistry.registerPath({
    method: 'put',
    path: '/orders/{id}/refund',
    tags: ['Order'],
    summary: '订单退款',
    description: '按订单原始余额扣减快照退回门店余额，不对未归属历史余额写门店余额。',
    request: {
      params: idParamSchema,
      body: {
        required: true,
        ...jsonBody(refundOrderSchema),
      },
    },
    responses: standardResponses('订单退款成功'),
  })
}
