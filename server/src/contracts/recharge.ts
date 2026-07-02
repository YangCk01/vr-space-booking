import { z } from 'zod'

const manualRechargePayMethods = ['CASH', 'CARD'] as const

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const createRechargeSchema = z.object({
  amount: z.coerce.number().int('充值金额必须是整数').positive('充值金额必须大于0'),
  payMethod: z.preprocess(
    value => normalizeString(value).toUpperCase() || 'CASH',
    z.string().superRefine((value, ctx) => {
      if (!manualRechargePayMethods.includes(value as any)) {
        ctx.addIssue({
          code: 'custom',
          message: '真实线上充值支付暂未接入，当前仅允许现金或刷卡收款',
        })
      }
    }).transform(value => value as typeof manualRechargePayMethods[number]),
  ),
  venueId: z.preprocess(
    value => normalizeString(value),
    z.string().min(1, '充值必须选择归属门店'),
  ),
})

export const confirmRechargeSchema = z.object({
  rechargeId: z.preprocess(
    value => normalizeString(value),
    z.string().min(1, '充值订单ID不能为空'),
  ),
})

export const staffRechargeSchema = createRechargeSchema.extend({
  userId: z.preprocess(
    value => normalizeString(value),
    z.string().min(1, '会员不能为空'),
  ),
  remark: z.preprocess(value => normalizeString(value) || undefined, z.string().max(200, '备注最多200字').optional()),
})

export type CreateRechargeInput = z.infer<typeof createRechargeSchema>
export type ConfirmRechargeInput = z.infer<typeof confirmRechargeSchema>
export type StaffRechargeInput = z.infer<typeof staffRechargeSchema>
