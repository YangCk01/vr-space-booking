import { z } from 'zod'

const manualOrderPayMethods = ['BALANCE', 'CASH', 'CARD'] as const

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const payOrderSchema = z.object({
  method: z.preprocess(value => normalizeString(value), z.string().optional()),
  payMethod: z.preprocess(value => normalizeString(value), z.string().optional()),
  thirdPartyCouponCode: z.preprocess(value => normalizeString(value) || undefined, z.string().optional()),
}).superRefine((value, ctx) => {
  const normalized = (value.method || value.payMethod || '').toUpperCase()
  if (!normalized) {
    ctx.addIssue({
      code: 'custom',
      path: ['method'],
      message: '请选择收款方式',
    })
    return
  }

  if (!manualOrderPayMethods.includes(normalized as any)) {
    ctx.addIssue({
      code: 'custom',
      path: ['method'],
      message: '微信/支付宝真实支付暂未接入，当前仅允许余额、现金或刷卡收款',
    })
  }
}).transform(value => ({
  method: (value.method || value.payMethod || '').toUpperCase() as typeof manualOrderPayMethods[number],
  ...(value.thirdPartyCouponCode ? { thirdPartyCouponCode: value.thirdPartyCouponCode } : {}),
}))

export const refundOrderSchema = z.object({
  amount: z.preprocess(
    value => value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
    z.number({ error: '退款金额必须是数字' }).int('退款金额必须是整数').positive('退款金额必须大于0').optional(),
  ),
  reason: z.preprocess(
    value => normalizeString(value),
    z.string().min(1, '退款原因不能为空'),
  ),
})

export type PayOrderInput = z.infer<typeof payOrderSchema>
export type RefundOrderInput = z.infer<typeof refundOrderSchema>
