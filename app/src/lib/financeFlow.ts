import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import type { FlowItem } from '@/api/finance'

export const typeLabelMap: Record<string, string> = {
  ORDER: '订单收入',
  REFUND: '退款',
  RECHARGE: '充值',
  BALANCE_DEDUCT: '余额扣款',
  BALANCE_REFUND: '余额退款',
  RESCHEDULE_FEE: '改签费收入',
}

export const typeColorMap: Record<string, string> = {
  ORDER: '#10B981',
  REFUND: '#EF4444',
  RECHARGE: '#3B82F6',
  BALANCE_DEDUCT: '#F59E0B',
  BALANCE_REFUND: '#8B5CF6',
  RESCHEDULE_FEE: '#F97316',
}

export const payMethodLabelMap: Record<string, string> = {
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  BALANCE: '余额支付',
  BALANCE_POINTS: '余额+积分',
  CASH: '现金',
  CARD: '刷卡',
}

export const payMethodColorMap: Record<string, string> = {
  WECHAT: '#10B981',
  ALIPAY: '#3B82F6',
  BALANCE: '#F59E0B',
  BALANCE_POINTS: '#F59E0B',
  CASH: '#64748B',
  CARD: '#8B5CF6',
}

export function exportFlowToExcel(items: FlowItem[], filename: string) {
  const rows = items.map((i) => ({
    时间: i.createdAt ? format(new Date(i.createdAt), 'yyyy-MM-dd HH:mm:ss') : '-',
    类型: typeLabelMap[i.type] || i.type,
    订单号: i.orderNo,
    关联订单号: i.parentOrderNo || '-',
    用户: i.userName,
    手机号: i.userPhone,
    金额: i.amount / 100,
    支付方式: payMethodLabelMap[i.payMethod] || i.payMethod || '-',
    备注: i.remark,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 20 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '收支明细')
  XLSX.writeFile(wb, filename)
}
