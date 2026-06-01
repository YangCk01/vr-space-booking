/**
 * 渠道账单拉取服务（空壳预留）
 * Phase 2 接入真实支付时填充实现
 */

export interface ChannelBillItem {
  channelTransactionId: string
  merchantOrderNo: string
  transactionType: 'PAY' | 'REFUND'
  transactionStatus: string
  buyerPaidAmount: number // 分
  refundAmount: number    // 分
  channelFee: number      // 分
  settlementAmount: number // 分
  channelPaidAt: Date
}

/**
 * 拉取微信支付账单
 * @param date YYYY-MM-DD
 * @returns 解析后的标准化账单数组
 *
 * TODO: Phase 2 接入微信支付 v3 账单下载接口
 * 参考: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_1_10.shtml
 */
export async function fetchWechatBill(date: string): Promise<ChannelBillItem[]> {
  console.warn(`[ChannelBill] 微信支付账单拉取未实现，日期: ${date}`)
  return []
}

/**
 * 拉取支付宝账单
 * @param date YYYY-MM-DD
 *
 * TODO: Phase 2 接入支付宝账单查询接口
 * 参考: https://opendocs.alipay.com/open/02n4vg
 */
export async function fetchAlipayBill(date: string): Promise<ChannelBillItem[]> {
  console.warn(`[ChannelBill] 支付宝账单拉取未实现，日期: ${date}`)
  return []
}

/**
 * 将渠道账单写入 ReconChannelBill 表
 * TODO: Phase 2 实现
 */
export async function saveChannelBills(
  _batchId: string,
  _channel: string,
  _items: ChannelBillItem[]
): Promise<number> {
  console.warn(`[ChannelBill] 账单写入未实现`)
  return 0
}
