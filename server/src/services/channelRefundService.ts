/**
 * 渠道退款服务（空壳预留）
 * Phase 2 接入真实支付时填充实现
 */

/**
 * 微信原路退款
 * @param orderNo 商户订单号
 * @param refundAmount 退款金额（分）
 * @param reason 退款原因
 *
 * TODO: Phase 2 接入微信支付退款 API
 * 参考: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_1_9.shtml
 */
export async function refundWechat(
  orderNo: string,
  refundAmount: number,
  reason: string
): Promise<{ success: boolean; refundId?: string; message?: string }> {
  console.warn(`[ChannelRefund] 微信退款未实现，订单: ${orderNo}, 金额: ${refundAmount}分, 原因: ${reason}`)
  return { success: false, message: '微信支付退款接口未实现' }
}

/**
 * 支付宝原路退款
 * @param orderNo 商户订单号
 * @param refundAmount 退款金额（分）
 * @param reason 退款原因
 *
 * TODO: Phase 2 接入支付宝退款 API
 * 参考: https://opendocs.alipay.com/open/02n4vh
 */
export async function refundAlipay(
  orderNo: string,
  refundAmount: number,
  reason: string
): Promise<{ success: boolean; refundId?: string; message?: string }> {
  console.warn(`[ChannelRefund] 支付宝退款未实现，订单: ${orderNo}, 金额: ${refundAmount}分, 原因: ${reason}`)
  return { success: false, message: '支付宝退款接口未实现' }
}

/**
 * 根据订单支付方式自动选择退款渠道
 */
export async function refundByChannel(
  payMethod: string,
  orderNo: string,
  refundAmount: number,
  reason: string
): Promise<{ success: boolean; refundId?: string; message?: string }> {
  if (payMethod === 'WECHAT') {
    return refundWechat(orderNo, refundAmount, reason)
  }
  if (payMethod === 'ALIPAY') {
    return refundAlipay(orderNo, refundAmount, reason)
  }
  return { success: false, message: `不支持的退款渠道: ${payMethod}` }
}
