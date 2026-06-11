import type { ReconcileFixResult } from '@/api/finance'

export const reconcileTypeMap: Record<string, string> = {
  '本金余额': 'BALANCE_PRINCIPAL',
  '赠送余额': 'BALANCE_BONUS',
  '积分余额': 'BALANCE_POINTS',
  '充值本金': 'RECHARGE_PRINCIPAL',
  '充值赠送': 'RECHARGE_BONUS',
  '在线支付金额': 'DIRECT_PAY',
  '消费本金': 'CONSUME_PRINCIPAL',
  '消费赠送': 'CONSUME_BONUS',
  '退款总额': 'REFUND',
  '消费赠送积分': 'POINTS_EARN',
  '管理员赠送积分': 'POINTS_GIFT',
  '积分兑换消耗': 'POINTS_EXCHANGE',
  '手动发放折扣券': 'COUPON_GIFT',
  '手动发放体验券': 'EXPERIENCE_GIFT',
  '活动发放折扣券': 'COUPON_CAMPAIGN',
  '活动发放体验券': 'EXPERIENCE_CAMPAIGN',
  '折扣券核销': 'COUPON_USED',
  '体验券核销': 'EXPERIENCE_USED',
}

export function formatReconValue(value: number, unit?: string) {
  if (unit === '元') {
    return `¥${(value / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  return `${value.toLocaleString()}${unit || '分'}`
}

export function getReconPlainText(item: { name: string; diff: number; unit?: string; note?: string }) {
  const abs = formatReconValue(Math.abs(item.diff), item.unit)
  if (item.diff === 0) {
    return {
      title: `${item.name} 已平衡`,
      desc: '系统账和业务账一致，无需处理。',
      suggestion: '无需操作',
      tone: 'green',
    }
  }

  const direction = item.diff > 0 ? '系统账比业务账多' : '系统账比业务账少'
  const isBalance = item.name.includes('余额') || item.name.includes('本金') || item.name.includes('赠送') || item.name.includes('积分')
  const suggestion = isBalance
    ? '建议查看明细，确认具体会员后生成调整单。'
    : '建议先查看明细，确认订单/流水来源；不能自动修复的，走人工处置。'

  return {
    title: `${direction} ${abs}`,
    desc: item.note || `${item.name} 存在差异，需要定位到具体记录。`,
    suggestion,
    tone: 'red',
  }
}

export function describeFixEffect(result?: ReconcileFixResult | null) {
  if (!result?.txData) return '已创建财务调整单并写入审计记录。'

  const effects: string[] = []
  if (result.txData.principalAmount) effects.push(`本金 ${formatReconValue(result.txData.principalAmount, '元')}`)
  if (result.txData.bonusAmount) effects.push(`赠送余额 ${formatReconValue(result.txData.bonusAmount, '元')}`)
  if (result.txData.pointsAmount) effects.push(`积分 ${result.txData.pointsAmount > 0 ? '+' : ''}${result.txData.pointsAmount}`)
  if (!effects.length && result.txData.totalAmount) effects.push(`金额 ${formatReconValue(result.txData.totalAmount, '元')}`)

  return effects.length ? `本次调整：${effects.join('，')}` : '已创建财务调整单并写入审计记录。'
}
