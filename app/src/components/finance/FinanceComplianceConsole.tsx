
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Calculator,
  Calendar,
  Clock,
  Crown,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Landmark,
  Loader2,
  MapPin,
  MessageSquare,
  Receipt,
  Search,
  ShieldCheck,
  Undo2,
  UploadCloud,
  User,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateFilterPicker } from '@/components/ui/date-filter-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/authStore'
import {
  formatMoney,
  formatMoneyRaw,
  TAX_RATE,
  type ComplianceRecord,
} from '@/lib/compliance'
import {
  getComplianceRecords,
  forceMatchComplianceRecord,
  invoiceComplianceRecord,
  batchInvoiceComplianceRecords,
  importBankStatements,
  type InvoiceFormData,
} from '@/api/compliance'

const tabList = [
  { id: 'all', label: '全景流水' },
  { id: 'unconsumed', label: '未核销/预售单' },
  { id: 'transit', label: 'T+N在途未结' },
  { id: 'invoice', label: '开票预警' },
  { id: 'cancelled', label: '已取消待处理' },
  { id: 'exception', label: '异常处理池' },
] as const

type TabId = (typeof tabList)[number]['id']

const statusConfig = {
  matched: { text: '账面平账', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30' },
  short: { text: '短款待查', color: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-500/15 dark:border-rose-500/30' },
  over: { text: '长款待查', color: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/15 dark:border-blue-500/30' },
  diff: { text: '金额不符', color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/15 dark:border-amber-500/30' },
  refunded: { text: '已退款', color: 'text-slate-700 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-500/15 dark:border-slate-500/30' },
}

const consumeConfig = {
  consumed: { text: '已核销(入收)', color: 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/15' },
  unconsumed: { text: '待核销(递延)', color: 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/15' },
  recharge: { text: '预充值(负债)', color: 'text-purple-700 bg-purple-100 dark:text-purple-400 dark:bg-purple-500/15' },
  refunded: { text: '售后失效', color: 'text-slate-600 bg-slate-200 dark:text-slate-300 dark:bg-slate-500/15' },
  cancelled: { text: '已取消(待处理)', color: 'text-rose-700 bg-rose-100 dark:text-rose-400 dark:bg-rose-500/15' },
}

const invoiceConfig = {
  none: { text: '未申请', color: 'text-slate-400 dark:text-slate-500' },
  pending: {
    text: '待开票',
    color: 'text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 font-medium dark:text-rose-400 dark:bg-rose-500/15 dark:border-rose-500/30',
  },
  issued: {
    text: '已开票',
    color: 'text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30',
  },
  red_ink: {
    text: '已红冲',
    color: 'text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 dark:text-slate-300 dark:bg-slate-500/15 dark:border-slate-500/30',
  },
}

function AssetChangeCell({ assetChange }: { assetChange: ComplianceRecord['assetChange'] }) {
  if (!assetChange) return <span className="text-slate-300">-</span>
  return (
    <div className="flex flex-col gap-1 items-center justify-center">
      {assetChange.type === 'points_added' && (
        <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/15 dark:border-indigo-500/30">
          +{assetChange.value} 积分
        </span>
      )}
      {assetChange.type === 'points_deducted' && (
        <span className="text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 dark:text-slate-300 dark:bg-slate-500/15 dark:border-slate-500/30">
          扣回 {Math.abs(assetChange.value || 0)} 积分
        </span>
      )}
      {assetChange.type === 'recharge' && (
        <>
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30">
            +{formatMoneyRaw(assetChange.principal)} 本金负债
          </span>
          {(assetChange.gift || 0) > 0 && (
            <span className="text-[10px] text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 dark:text-orange-300 dark:bg-orange-500/15 dark:border-orange-500/30">
              +{formatMoneyRaw(assetChange.gift)} 赠金负债
            </span>
          )}
        </>
      )}
      {assetChange.type === 'balance_reserved' && (
        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 dark:text-amber-400 dark:bg-amber-500/15 dark:border-amber-500/30">
          {formatMoneyRaw(assetChange.value)} 待核销
        </span>
      )}
      {assetChange.type === 'balance_used' && (
        <>
          <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 dark:text-purple-300 dark:bg-purple-500/15 dark:border-purple-500/30">
            -{formatMoneyRaw(assetChange.value)} 储值核销
          </span>
          {assetChange.principalUsed !== undefined && (
            <span className="text-[10px] text-slate-500">
              本金{formatMoneyRaw(assetChange.principalUsed)} 赠金{formatMoneyRaw(assetChange.giftUsed)}
            </span>
          )}
        </>
      )}
    </div>
  )
}

const defaultInvoiceForm = {
  type: '增值税电子普票',
  buyerName: '',
  taxNumber: '',
  addressPhone: '',
  bankAccount: '',
  email: '',
  phone: '',
  remark: '',
}

function InvoiceDialog({
  open,
  onOpenChange,
  records,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: ComplianceRecord[]
  onSubmit: (info: typeof defaultInvoiceForm) => void
}) {
  const [form, setForm] = useState({ ...defaultInvoiceForm })

  const totalAmount = records.reduce((sum, r) => sum + (r.expectedRecv || 0) / (1 + TAX_RATE), 0)
  const totalTax = records.reduce((sum, r) => sum + (r.expectedRecv || 0) - (r.expectedRecv || 0) / (1 + TAX_RATE), 0)

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = () => {
    if (!form.buyerName.trim()) return toast.error('请填写购买方名称')
    if (!form.email.trim()) return toast.error('请填写收票人邮箱')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return toast.error('收票人邮箱格式不正确')
    onSubmit({ ...form, buyerName: form.buyerName.trim(), email: form.email.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            开具发票
          </DialogTitle>
          <DialogDescription>
            本次将为 <span className="font-bold text-primary">{records.length}</span> 笔单据开具发票，请填写真实发票信息。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 p-3 rounded-lg border border-border/60 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">待开票单据</span>
              <span className="font-medium">{records.length} 笔</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">不含税金额合计</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">税额合计 ({(TAX_RATE * 100).toFixed(0)}%)</span>
              <span>{formatMoney(totalTax)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-type">发票类型</Label>
            <Select value={form.type} onValueChange={(v) => update('type', v)}>
              <SelectTrigger id="invoice-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="增值税电子普票">增值税电子普票</SelectItem>
                <SelectItem value="增值税专用发票">增值税专用发票</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-buyer">
              购买方名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invoice-buyer"
              value={form.buyerName}
              onChange={(e) => update('buyerName', e.target.value)}
              placeholder="请输入购买方名称"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-tax">纳税人识别号</Label>
            <Input
              id="invoice-tax"
              value={form.taxNumber}
              onChange={(e) => update('taxNumber', e.target.value)}
              placeholder="企业必填，个人可留空"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-address">购买方地址、电话</Label>
            <Input
              id="invoice-address"
              value={form.addressPhone}
              onChange={(e) => update('addressPhone', e.target.value)}
              placeholder="请输入地址和电话"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-bank">购买方开户行及账号</Label>
            <Input
              id="invoice-bank"
              value={form.bankAccount}
              onChange={(e) => update('bankAccount', e.target.value)}
              placeholder="请输入开户行及账号"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-email">
              收票人邮箱 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invoice-email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="用于接收电子发票"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-phone">收票人手机</Label>
            <Input
              id="invoice-phone"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="请输入收票人手机号"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-remark">备注</Label>
            <textarea
              id="invoice-remark"
              value={form.remark}
              onChange={(e) => update('remark', e.target.value)}
              rows={2}
              placeholder="可填写特殊说明"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>确认开具</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickInvoiceInput({
  records,
  onConfirm,
  onCancel,
}: {
  records: ComplianceRecord[]
  onConfirm: (id: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [preview, setPreview] = useState<
    (ComplianceRecord & { amount: number; taxAmount: number }) | null
  >(null)

  const handleChange = (v: string) => {
    setValue(v)
    const target = records.find((r) => r.id === v.trim())
    if (target && target.invoice.status === 'pending') {
      const amount = target.expectedRecv ? target.expectedRecv / (1 + TAX_RATE) : 0
      setPreview({ ...target, amount, taxAmount: amount * TAX_RATE })
    } else {
      setPreview(null)
    }
  }

  return (
    <div>
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="输入 ORD- 开头的单号"
        className="mb-3"
      />
      {preview && (
        <div className="bg-muted/50 p-3 rounded-lg border border-border/60 text-xs mb-4 space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">单号</span>
            <span className="font-mono">{preview.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">业务类型</span>
            <span>{preview.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">开票金额(不含税)</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(preview.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">税额</span>
            <span>{formatMoney(preview.taxAmount)}</span>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={() => preview && onConfirm(value.trim())} disabled={!preview}>
          确认开具
        </Button>
      </DialogFooter>
    </div>
  )
}

function ForceMatchDialog({
  open,
  onOpenChange,
  targetIds,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetIds: string[]
  onSubmit: (reason: string, approver: string, attachments: string[]) => void
}) {
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState('')
  const [attachments, setAttachments] = useState('')

  const handleSubmit = () => {
    if (!reason.trim()) return toast.error('请填写平账原因')
    if (!approver.trim()) return toast.error('请填写审批人')
    onSubmit(reason.trim(), approver.trim(), attachments.split(';').map((s) => s.trim()).filter(Boolean))
    setReason('')
    setApprover('')
    setAttachments('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            强制平账审批
          </DialogTitle>
          <DialogDescription>
            本次将对 <span className="font-bold text-primary">{targetIds.length}</span> 笔差异单进行人工平账，操作将被审计记录。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              平账原因 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="例如：经核实为顾客扫码少付，已联系补差"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              审批人 <span className="text-destructive">*</span>
            </label>
            <Input
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="输入审批人姓名"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">附件说明（可选）</label>
            <Input
              value={attachments}
              onChange={(e) => setAttachments(e.target.value)}
              placeholder="例如：监控截图、POS小票、沟通记录；用分号分隔"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>提交审批并平账</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BankImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (text: string) => void
}) {
  const [text, setText] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="size-5 text-primary" />
            导入银行流水对账
          </DialogTitle>
          <DialogDescription>格式：单号,实收金额,到账时间。系统将自动匹配并更新对账状态。</DialogDescription>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={`ORD-260623-001,319.20,2026-06-25\nORD-260623-005,99.40,2026-06-23`}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              onImport(text)
              setText('')
            }}
          >
            执行对账
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VoucherDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: ComplianceRecord | null
}) {
  if (!record) return null
  const vouchers = record.vouchers || []
  const totalDebit = vouchers.reduce((s, v) => s + (v.debit || 0), 0)
  const totalCredit = vouchers.reduce((s, v) => s + (v.credit || 0), 0)
  const balanced = totalDebit.toFixed(2) === totalCredit.toFixed(2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            会计分录
          </DialogTitle>
          <DialogDescription>
            业务单号：{record.id} · 类型：{record.type}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/60 mb-4">
          业务单号：
          <span className="font-mono font-medium text-foreground">{record.id}</span> · 类型：
          <span className="font-medium text-foreground">{record.type}</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">会计科目</th>
                <th className="px-4 py-2 text-right font-medium">借方</th>
                <th className="px-4 py-2 text-right font-medium">贷方</th>
                <th className="px-4 py-2 text-left font-medium">摘要</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vouchers.map((v, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-medium text-foreground">{v.subject}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {v.debit ? formatMoneyRaw(v.debit) : ''}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {v.credit ? formatMoneyRaw(v.credit) : ''}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{v.summary}</td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-semibold">
                <td className="px-4 py-2 text-foreground">合计</td>
                <td className="px-4 py-2 text-right font-mono text-foreground">
                  {formatMoneyRaw(totalDebit)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-foreground">
                  {formatMoneyRaw(totalCredit)}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {balanced ? '借贷平衡 ✓' : '借贷不平 ✗'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: ComplianceRecord | null
}) {
  if (!record) return null
  const diff = Number((record.actualRecv - (record.expectedRecv || 0)).toFixed(2))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            单据全息审计档案
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-y-4 text-sm bg-muted/50 p-4 rounded-lg border border-border/60">
            <div>
              <span className="text-muted-foreground block mb-1">业务单号</span>
              <span className="font-mono text-foreground font-medium">{record.id}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">归属门店</span>
              <span className="text-foreground font-medium">{record.store}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">操作员工</span>
              <span className="text-foreground font-medium">{record.operator}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">交易产生时间</span>
              <span className="text-foreground font-mono">{record.orderTime}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">财务轧账时间</span>
              <span className="text-foreground font-mono">{record.reconTime}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">对账状态</span>
              <span
                className={cn(
                  'inline-flex px-2 py-0.5 rounded text-[11px] border',
                  statusConfig[record.status || 'matched'].color,
                )}
              >
                {statusConfig[record.status || 'matched'].text}
              </span>
            </div>
            {record.relatedOrderId && (
              <div className="col-span-3">
                <span className="text-muted-foreground block mb-1">关联单据</span>
                <span className="font-mono text-primary">{record.relatedOrderId}</span>
              </div>
            )}
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted px-4 py-2 font-medium text-foreground text-sm flex items-center gap-2">
              <Calculator className="size-4" /> 资金拆解沙盘（系统自动计算）
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">系统原始价格</span>
                <span className="font-medium text-foreground">{formatMoney(record.originalPrice)}</span>
              </div>
              {record.discountBreakdown.map((d, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-orange-600 dark:text-orange-400 pl-4 text-xs">└ 营销抵扣：{d.name}</span>
                  <span className="text-orange-700 dark:text-orange-400">{formatMoney(d.amount)}</span>
                </div>
              ))}
              {record.platformFee !== 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-rose-600 dark:text-rose-400 pl-4 text-xs">└ 平台通道费抽成</span>
                  <span className="text-rose-700 dark:text-rose-400">{formatMoney(record.platformFee)}</span>
                </div>
              )}
              {record.gatewayFee !== 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-rose-600 dark:text-rose-400 pl-4 text-xs">└ 支付网关费率 (千分之六)</span>
                  <span className="text-rose-700 dark:text-rose-400">{formatMoney(record.gatewayFee)}</span>
                </div>
              )}
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between items-center text-base">
                <span className="font-bold text-foreground">财务应收净额</span>
                <span className="font-bold text-foreground">{formatMoney(record.expectedRecv)}</span>
              </div>
              <div className="flex justify-between items-center text-base">
                <span className="font-bold text-foreground">账户实收(或扣款)</span>
                <span className={cn('font-bold', diff === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                  {formatMoney(record.actualRecv)}
                </span>
              </div>
              {diff !== 0 && (
                <div className="flex justify-between items-center text-base">
                  <span className="font-bold text-foreground">差异金额</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400">{formatMoney(diff)}</span>
                </div>
              )}
            </div>
          </div>

          {record.invoice.status !== 'none' && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-primary/10 px-4 py-2 font-medium text-primary text-sm flex items-center gap-2">
                <Receipt className="size-4" /> 发票信息
              </div>
              <div className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">发票状态</span>
                  <span className={invoiceConfig[record.invoice.status].color}>
                    {invoiceConfig[record.invoice.status].text}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">发票类型</span>
                  <span>{record.invoice.type || '电子普票'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">不含税金额</span>
                  <span className="font-medium">{formatMoney(record.invoice.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">税额 ({(TAX_RATE * 100).toFixed(0)}%)</span>
                  <span>{formatMoney(record.invoice.taxAmount)}</span>
                </div>
                {record.invoice.originalInvoiceId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">原蓝字发票</span>
                    <span className="font-mono text-primary">{record.invoice.originalInvoiceId}</span>
                  </div>
                )}
                {record.invoice.info && (
                  <>
                    <div className="h-px bg-border my-2" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">购买方名称</span>
                      <span className="font-medium">{record.invoice.info.buyerName}</span>
                    </div>
                    {record.invoice.info.taxNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">纳税人识别号</span>
                        <span className="font-mono">{record.invoice.info.taxNumber}</span>
                      </div>
                    )}
                    {record.invoice.info.email && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">收票人邮箱</span>
                        <span>{record.invoice.info.email}</span>
                      </div>
                    )}
                    {record.invoice.info.phone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">收票人手机</span>
                        <span>{record.invoice.info.phone}</span>
                      </div>
                    )}
                    {record.invoice.info.addressPhone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">地址、电话</span>
                        <span>{record.invoice.info.addressPhone}</span>
                      </div>
                    )}
                    {record.invoice.info.bankAccount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">开户行及账号</span>
                        <span>{record.invoice.info.bankAccount}</span>
                      </div>
                    )}
                    {record.invoice.info.remark && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">备注</span>
                        <span>{record.invoice.info.remark}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {record.remark && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-lg text-sm flex items-start gap-2">
              <MessageSquare className="size-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold block mb-0.5">异常备注</span>
                {record.remark}
              </div>
            </div>
          )}

          {record.auditLog && record.auditLog.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 font-medium text-foreground text-sm flex items-center gap-2">
                <History className="size-4" /> 审计日志
              </div>
              <div className="max-h-48 overflow-y-auto">
                {record.auditLog.map((log, i) => (
                  <div key={log.id || i} className="px-4 py-3 border-b border-border text-xs last:border-0">
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{log.time}</span>
                      <span>{log.operator}</span>
                    </div>
                    <div className="font-medium text-foreground">{log.action}</div>
                    <div className="text-muted-foreground mt-0.5">{log.reason}</div>
                    {log.attachments?.length > 0 && (
                      <div className="text-primary mt-1">附件: {log.attachments.join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>已知悉并关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


export default function FinanceComplianceConsole() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const canForceMatch = hasPermission(currentUser, 'finance:adjust')
  const canInvoice = hasPermission(currentUser, 'finance:adjust')
  const canImportBank = hasPermission(currentUser, 'finance:reconcile')

  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStore, setSelectedStore] = useState('all')
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 弹窗状态
  const [detailRecord, setDetailRecord] = useState<ComplianceRecord | null>(null)
  const [quickInvoiceOpen, setQuickInvoiceOpen] = useState(false)
  const [quickInvoiceRecord, setQuickInvoiceRecord] = useState<ComplianceRecord | null>(null)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [invoiceDialogRecords, setInvoiceDialogRecords] = useState<ComplianceRecord[]>([])
  const [forceMatchOpen, setForceMatchOpen] = useState(false)
  const [forceMatchIds, setForceMatchIds] = useState<string[]>([])
  const [bankImportOpen, setBankImportOpen] = useState(false)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [voucherRecord, setVoucherRecord] = useState<ComplianceRecord | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!invoiceDialogOpen && quickInvoiceRecord) {
      setQuickInvoiceOpen(false)
      setQuickInvoiceRecord(null)
    }
  }, [invoiceDialogOpen, quickInvoiceRecord])

  const recordsQuery = useQuery({
    queryKey: ['compliance', 'records', { activeTab, searchQuery, selectedStore, selectedDate, page, pageSize }],
    queryFn: () =>
      getComplianceRecords({
        tab: activeTab,
        search: searchQuery,
        store: selectedStore,
        startDate: selectedDate || undefined,
        endDate: selectedDate || undefined,
        page,
        pageSize,
      }),
  })

  const records = recordsQuery.data?.data || []
  const overview = recordsQuery.data?.overview
  const stores = recordsQuery.data?.stores || []
  const meta = recordsQuery.data?.meta

  const forceMatchMut = useMutation({
    mutationFn: async (payload: { ids: string[]; reason: string; approver: string; attachments: string[] }) => {
      await Promise.all(
        payload.ids.map((id) =>
          forceMatchComplianceRecord(id, {
            reason: payload.reason,
            approver: payload.approver,
            attachments: payload.attachments,
          }),
        ),
      )
    },
    onSuccess: (_, payload) => {
      toast.success(`成功将 ${payload.ids.length} 笔异常金额补平并销账`)
      setForceMatchOpen(false)
      setForceMatchIds([])
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ['compliance'] })
    },
    onError: (err: any) => toast.error(err?.message || '平账失败'),
  })

  const invoiceMut = useMutation({
    mutationFn: ({ id, invoiceInfo }: { id: string; invoiceInfo: InvoiceFormData }) =>
      invoiceComplianceRecord(id, invoiceInfo),
    onSuccess: () => {
      toast.success('开票成功')
      setInvoiceDialogOpen(false)
      setInvoiceDialogRecords([])
      setQuickInvoiceOpen(false)
      setQuickInvoiceRecord(null)
      queryClient.invalidateQueries({ queryKey: ['compliance'] })
    },
    onError: (err: any) => toast.error(err?.message || '开票失败'),
  })

  const batchInvoiceMut = useMutation({
    mutationFn: ({ ids, invoiceInfo }: { ids: string[]; invoiceInfo: InvoiceFormData }) =>
      batchInvoiceComplianceRecords(ids, invoiceInfo),
    onSuccess: (res) => {
      toast.success(`批量开具 ${res.count} 张发票成功`)
      setInvoiceDialogOpen(false)
      setInvoiceDialogRecords([])
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ['compliance'] })
    },
    onError: (err: any) => toast.error(err?.message || '批量开票失败'),
  })

  const bankImportMut = useMutation({
    mutationFn: importBankStatements,
    onSuccess: (res) => {
      toast.success(`成功匹配并导入 ${res.matchedCount} 条银行流水`)
      setBankImportOpen(false)
      queryClient.invalidateQueries({ queryKey: ['compliance'] })
    },
    onError: (err: any) => toast.error(err?.message || '导入失败'),
  })

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? records.map((r) => r.id) : [])
  }

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const openInvoiceDialog = (targetRecords: ComplianceRecord[]) => {
    if (targetRecords.length === 0) return
    setInvoiceDialogRecords(targetRecords)
    setInvoiceDialogOpen(true)
  }

  const handleBatchInvoice = () => {
    const targetRecords = selectedIds
      .map((id) => records.find((x) => x.id === id))
      .filter((r): r is ComplianceRecord => !!r && r.invoice.status === 'pending')
    if (targetRecords.length === 0) return toast.error('所选记录无待开票单据')
    openInvoiceDialog(targetRecords)
  }

  const submitInvoice = (invoiceInfo: InvoiceFormData) => {
    if (invoiceDialogRecords.length === 1 && quickInvoiceRecord) {
      invoiceMut.mutate({ id: invoiceDialogRecords[0].id, invoiceInfo })
    } else {
      batchInvoiceMut.mutate({ ids: invoiceDialogRecords.map((r) => r.id), invoiceInfo })
    }
  }

  const openForceMatch = (ids: string[]) => {
    const targetIds = ids.filter((id) => {
      const r = records.find((x) => x.id === id)
      return r && !['matched', 'refunded'].includes(r.status || '')
    })
    if (targetIds.length === 0) return toast.error('所选记录无需强制平账')
    setForceMatchIds(targetIds)
    setForceMatchOpen(true)
  }

  const submitForceMatch = (reason: string, approver: string, attachments: string[]) => {
    forceMatchMut.mutate({ ids: forceMatchIds, reason, approver, attachments })
  }

  const handleBankImport = (text: string) => {
    const lines = text
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) return toast.error('请输入银行流水')
    bankImportMut.mutate(lines)
  }

  const handleQuickInvoice = (id: string) => {
    const record = records.find((r) => r.id === id)
    if (!record || record.invoice.status !== 'pending') return toast.error('该单据不可开票')
    setQuickInvoiceRecord(record)
    openInvoiceDialog([record])
  }

  const openVoucher = (record: ComplianceRecord) => {
    setVoucherRecord(record)
    setVoucherOpen(true)
  }

  const handleExport = () => {
    setExporting(true)
    setTimeout(() => {
      setExporting(false)
      const headers = ['单号', '门店', '渠道', '原价', '应收', '实收', '状态', '发票状态']
      const rows = records.map((r) => [
        r.id,
        r.store,
        r.channel,
        r.originalPrice,
        r.expectedRecv,
        r.actualRecv,
        statusConfig[r.status || 'matched'].text,
        invoiceConfig[r.invoice.status].text,
      ])
      const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${new Date().toISOString().slice(0, 7)}业财审计流水总表.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('导出成功')
    }, 800)
  }

  const pendingInvoiceCount = overview?.pendingInvoice || 0

  return (
    <div className="space-y-6">
      {/* 顶部控制栏 */}
      <div className="bg-card border border-border rounded-xl shadow-sm px-4 md:px-6 py-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Calculator className="text-primary" size={28} />
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">
                大空间业财合规控制台
                <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded ml-1 align-top">
                  PRO
                </span>
              </h1>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <span>实时轧账批次: {new Date().toISOString().slice(0, 10)}</span>
                <span>|</span>
                <span>当前操作人: {currentUser?.name || '-'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            <DateFilterPicker
              mode="single"
              startDate={selectedDate}
              endDate={selectedDate}
              onChange={({ startDate }) => {
                setSelectedDate(startDate)
                setPage(1)
                setSelectedIds([])
              }}
            />
            <Select value={selectedStore} onValueChange={(v) => { setSelectedStore(v); setPage(1); setSelectedIds([]) }}>
              <SelectTrigger className="w-[180px]">
                <MapPin className="size-4 text-muted-foreground" />
                <SelectValue placeholder="选择门店" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全国所有门店 ({stores.filter((s) => s !== '会员中心').length}家)</SelectItem>
                {stores
                  .filter((store) => store !== '会员中心')
                  .map((store) => (
                    <SelectItem key={store} value={store}>
                      {store}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => setBankImportOpen(true)}
              disabled={!canImportBank}
              className="gap-2"
            >
              <UploadCloud className="size-4 text-primary" />
              导入银行流水
            </Button>
            <Button onClick={handleExport} disabled={exporting} className="gap-2">
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {exporting ? '生成报表中...' : '导出凭证总表'}
            </Button>
          </div>
        </div>
      </div>

      {/* KPI 与资产池 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* GTV */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
            <h3 className="text-xs font-medium text-muted-foreground mb-1">系统毛收入 (GTV)</h3>
            <p className="text-xl font-bold text-foreground">{formatMoney(overview?.gtv || 0)}</p>
            <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">正向订单</span>
                <span className="font-medium text-foreground">{formatMoney(overview?.forwardGtv || 0)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">退款金额</span>
                <span className="font-medium text-rose-600 dark:text-rose-400">-{formatMoney(overview?.refund || 0)}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{
                    width: `${overview?.gtv ? Math.min(100, ((overview?.refund || 0) / overview.gtv) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 营销与卡券折让 */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
            <h3 className="text-xs font-medium text-muted-foreground mb-1">营销与卡券折让</h3>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">- {formatMoney(overview?.discount || 0)}</p>
            <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">折扣率</span>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {overview?.gtv ? ((overview.discount || 0) / overview.gtv * 100).toFixed(2) : '0.00'}%
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">不含税口径</span>
                <span className="font-medium text-muted-foreground">
                  -{formatMoney((overview?.discount || 0) / (1 + TAX_RATE))}
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{
                    width: `${overview?.gtv ? Math.min(100, ((overview.discount || 0) / overview.gtv) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 平台佣金与网关费 */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
            <h3 className="text-xs font-medium text-muted-foreground mb-1">平台佣金与网关费</h3>
            <p className="text-xl font-bold text-rose-700 dark:text-rose-400">
              - {formatMoney((overview?.platformFee || 0) + (overview?.gatewayFee || 0))}
            </p>
            <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">综合费率</span>
                <span className="font-medium text-rose-700 dark:text-rose-400">
                  {overview?.gtv
                    ? (((overview.platformFee || 0) + (overview.gatewayFee || 0)) / overview.gtv * 100).toFixed(2)
                    : '0.00'}%
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">平台 / 网关</span>
                <span className="font-medium text-muted-foreground">
                  {formatMoneyRaw(overview?.platformFee || 0)} / {formatMoneyRaw(overview?.gatewayFee || 0)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{
                    width: `${overview?.gtv
                      ? Math.min(100, ((overview.platformFee || 0) + (overview.gatewayFee || 0)) / overview.gtv * 100)
                      : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 资金账户实收净额 */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
            <h3 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Wallet className="size-3" />
              资金账户实收净额
            </h3>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(overview?.netRecv || 0)}</p>
            <div className="mt-auto pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">实收率</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {overview?.gtv ? ((overview.netRecv || 0) / overview.gtv * 100).toFixed(2) : '0.00'}%
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">退款冲减</span>
                <span className="font-medium text-rose-600 dark:text-rose-400">-{formatMoney(overview?.refund || 0)}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{
                    width: `${overview?.gtv
                      ? Math.min(100, Math.max(0, (overview.netRecv || 0) / overview.gtv * 100))
                      : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-card border border-border rounded-xl shadow-sm p-4 grid grid-cols-2 gap-x-4 gap-y-3 relative overflow-hidden dark:bg-slate-900/50">
          <div className="absolute right-0 top-0 opacity-5 pointer-events-none dark:opacity-10">
            <Crown className="size-32 text-muted-foreground" />
          </div>
          <div className="col-span-2 border-b border-border pb-2 mb-1">
            <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="size-4" /> 合规与递延资产池
            </h3>
          </div>

          <div className="col-span-1 z-10">
            <span className="text-[10px] text-muted-foreground block mb-0.5">未核销票务(递延收入)</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 text-lg">{formatMoney(overview?.deferred || 0)}</span>
          </div>
          <div className="col-span-1 z-10">
            <span className="text-[10px] text-muted-foreground block mb-0.5">当日待处理积压</span>
            <span className="font-bold text-rose-600 dark:text-rose-400 text-lg flex items-center gap-1">
              {pendingInvoiceCount} 笔发票
              {pendingInvoiceCount > 0 && (
                <button
                  className="text-[10px] bg-rose-100 text-rose-700 px-1 rounded hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/40"
                  onClick={() => setActiveTab('invoice')}
                >
                  处理
                </button>
              )}
            </span>
          </div>

          <div className="col-span-1 z-10">
            <span className="text-[10px] text-muted-foreground block mb-0.5">储值余额总负债</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">
              {formatMoney(overview?.rechargeLiability || 0)}
            </span>
          </div>
          <div className="col-span-1 z-10">
            <span className="text-[10px] text-muted-foreground block mb-0.5">未消耗积分成本估算</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">{formatMoney(overview?.pointsCost || 0)}</span>
          </div>
        </div>
      </div>

      {/* 数据表格卡片 */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
        {/* 工具栏 */}
        <div className="p-3 border-b border-border flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-muted/30">
          <div className="flex flex-wrap gap-1.5">
            {tabList.map((tab) => {
              const isInvoice = tab.id === 'invoice'
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setPage(1); setSelectedIds([]) }}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border',
                    active
                      ? isInvoice && pendingInvoiceCount > 0
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-background text-primary border-primary/30 shadow-sm'
                      : isInvoice && pendingInvoiceCount > 0
                        ? 'text-rose-700 border-rose-200 bg-rose-50 hover:bg-rose-100 dark:text-rose-400 dark:border-rose-500/30 dark:bg-rose-500/15 dark:hover:bg-rose-500/25'
                        : 'text-foreground hover:bg-muted border-transparent',
                  )}
                >
                  {tab.label}
                  {isInvoice && pendingInvoiceCount > 0 && ` (${pendingInvoiceCount})`}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 w-full xl:w-auto items-center">
            {selectedIds.length > 0 && (
              <div className="flex gap-2 animate-in fade-in mr-2 border-r border-border pr-4">
                <span className="text-[13px] text-primary font-medium py-1.5">已选 {selectedIds.length}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBatchInvoice}
                  disabled={!canInvoice || batchInvoiceMut.isPending}
                >
                  批量开票
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openForceMatch(selectedIds)}
                  disabled={!canForceMatch || forceMatchMut.isPending}
                >
                  批量强制平账
                </Button>
              </div>
            )}
            {selectedIds.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuickInvoiceOpen(true)}
                disabled={!canInvoice}
                className="mr-2 gap-1"
              >
                <Receipt className="size-4" /> 快捷开票
              </Button>
            )}
            <div className="relative flex-1 xl:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
              <Input
                type="text"
                placeholder="搜索单号/门店/渠道/备注/经办人..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                className="pl-8 w-full xl:w-64"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFilterOpen(!filterOpen)}
              className={cn(filterOpen && 'bg-primary/10 text-primary border-primary/30')}
            >
              <Filter className="size-4" />
            </Button>
          </div>
        </div>

        {/* 高级筛选 */}
        {filterOpen && (
          <div className="p-4 bg-muted/30 border-b border-border grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">交易渠道</label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全渠道</SelectItem>
                  <SelectItem value="美团团购">美团团购</SelectItem>
                  <SelectItem value="微信小程序">微信小程序</SelectItem>
                  <SelectItem value="支付宝">支付宝</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">财务核销状态</label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="consumed">已核销(入收)</SelectItem>
                  <SelectItem value="unconsumed">待核销(递延)</SelectItem>
                  <SelectItem value="cancelled">已取消(待处理)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">发票状态</label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="pending">待开票</SelectItem>
                  <SelectItem value="issued">已开票</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => { setFilterOpen(false); toast.success('筛选已应用') }} className="w-full">
                应用检索条件
              </Button>
            </div>
          </div>
        )}

        {/* 表格 */}
        <div className="overflow-x-auto relative" style={{ maxHeight: '600px' }}>
          {recordsQuery.isLoading ? (
            <div className="p-20 text-center text-muted-foreground">
              <Loader2 className="size-8 animate-spin mx-auto mb-2" />
              加载中...
            </div>
          ) : (
            <table className="w-full text-left text-[13px] whitespace-nowrap min-w-[2000px]">
              <thead className="text-foreground font-medium sticky top-0 z-20">
                <tr>
                  <th colSpan={3} className="px-3 py-2 border-r border-b border-border sticky left-0 bg-muted z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    基础业务信息
                  </th>
                  <th colSpan={2} className="px-3 py-2 border-r border-b border-border text-center bg-muted/60">
                    交易与时间戳
                  </th>
                  <th colSpan={5} className="px-3 py-2 border-r border-b border-border text-center bg-primary/5">
                    账单与资金拆解 (¥)
                  </th>
                  <th colSpan={2} className="px-3 py-2 border-r border-b border-border text-center bg-emerald-500/5">
                    资金流向与账户
                  </th>
                  <th colSpan={3} className="px-3 py-2 border-r border-b border-border text-center bg-purple-500/5">
                    会员资产、税务与合规
                  </th>
                  <th colSpan={2} className="px-3 py-2 border-b border-border sticky right-0 bg-muted z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] text-center">
                    状态与操作
                  </th>
                </tr>
                <tr className="border-b border-border text-xs">
                  <th className="px-3 py-2 w-10 text-center sticky left-0 bg-muted z-30 border-r border-border">
                    <Checkbox
                      checked={records.length > 0 && selectedIds.length === records.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-3 py-2 sticky left-[40px] bg-muted z-30 min-w-[240px]">单号 / 备注</th>
                  <th className="px-3 py-2 sticky left-[280px] bg-muted z-30 border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[140px]">
                    门店 / 经办人
                  </th>

                  <th className="px-3 py-2 bg-muted/60">交易渠道 / 支付工具</th>
                  <th className="px-3 py-2 border-r border-border bg-muted/60">产生时间 / 轧账时间</th>

                  <th className="px-3 py-2 text-right bg-primary/5">原价总额</th>
                  <th className="px-3 py-2 text-right text-orange-700 dark:text-orange-400 bg-primary/5">营销折扣</th>
                  <th className="px-3 py-2 text-right text-red-700 dark:text-red-400 bg-primary/5">平台佣金</th>
                  <th className="px-3 py-2 text-right text-red-700 dark:text-red-400 bg-primary/5">网关费</th>
                  <th className="px-3 py-2 text-right font-bold text-foreground border-r border-border bg-primary/10">
                    系统应收/实收净额
                  </th>

                  <th className="px-3 py-2 text-center bg-emerald-500/5">收入核销状态</th>
                  <th className="px-3 py-2 text-center border-r border-border bg-emerald-500/5">银行到账节点</th>

                  <th className="px-3 py-2 text-center bg-purple-500/5">资产增减负债</th>
                  <th className="px-3 py-2 text-center bg-purple-500/5">税务发票申请</th>
                  <th className="px-3 py-2 text-center border-r border-border bg-purple-500/5">会计凭证</th>

                  <th className="px-3 py-2 text-center sticky right-[80px] bg-muted z-30 border-l border-border shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[100px]">
                    对账结果
                  </th>
                  <th className="px-3 py-2 text-center w-20 sticky right-0 bg-muted z-30 border-l border-border shadow-[-2px_0_5px_rgba(0,0,0,0.03)]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {records.length > 0 ? (
                  records.map((record) => {
                    const isRefund = record.originalPrice < 0
                    const isSelected = selectedIds.includes(record.id)
                    const rowBg = isSelected ? 'bg-blue-50 dark:bg-blue-900' : isRefund ? 'bg-slate-50 dark:bg-slate-900' : 'bg-background'
                    const diff = Number((record.actualRecv - (record.expectedRecv || 0)).toFixed(2))

                    return (
                      <tr
                        key={record.id}
                        onClick={() => handleSelectRow(record.id)}
                        className={cn('cursor-pointer transition-colors group', rowBg)}
                      >
                        <td
                          className={cn(
                            'px-3 py-3 text-center sticky left-0 z-10 border-r border-border',
                            rowBg,
                            'group-hover:bg-slate-100 dark:group-hover:bg-slate-800',
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleSelectRow(record.id)}
                          />
                        </td>
                        <td
                          className={cn(
                            'px-3 py-3 sticky left-[40px] z-10 border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.03)]',
                            rowBg,
                            'group-hover:bg-slate-100 dark:group-hover:bg-slate-800',
                          )}
                        >
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="font-mono text-xs text-foreground font-medium flex items-center gap-1 truncate" title={record.id}>
                              {isRefund && <Undo2 className="size-3 text-muted-foreground flex-shrink-0" />} {record.id}
                            </span>
                            {record.remark ? (
                              <span
                                className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 w-fit border border-rose-100 truncate max-w-[220px] dark:text-rose-400 dark:bg-rose-500/15 dark:border-rose-500/30"
                                title={record.remark}
                              >
                                <MessageSquare className="size-2.5 flex-shrink-0" /> {record.remark}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[220px]" title={record.type}>{record.type}</span>
                            )}
                            {record.relatedOrderId && (
                              <span className="text-[10px] text-primary truncate max-w-[220px]" title={`关联: ${record.relatedOrderId}`}>关联: {record.relatedOrderId}</span>
                            )}
                          </div>
                        </td>
                        <td
                          className={cn(
                            'px-3 py-3 sticky left-[280px] z-10 border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.01)]',
                            rowBg,
                            'group-hover:bg-slate-100 dark:group-hover:bg-slate-800',
                          )}
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-foreground bg-muted px-1.5 py-0.5 rounded w-fit border border-border">
                              {record.store}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <User className="size-2.5" /> {record.operator}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-primary font-medium">{record.channel}</span>
                            <span className="text-[10px] text-muted-foreground border border-border px-1 rounded w-fit">
                              {record.paymentMethod}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-r border-border">
                          <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                            <span>
                              产生: <span className="font-mono">{record.orderTime}</span>
                            </span>
                            <span>
                              清算: <span className="font-mono">{record.reconTime}</span>
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-3 text-right font-medium text-foreground">
                          {formatMoney(record.originalPrice)}
                        </td>
                        <td className="px-3 py-3 text-right text-orange-700 dark:text-orange-400 text-xs">
                          {(record.discountBreakdown || []).reduce((s, d) => s + Math.abs(d.amount), 0) > 0
                            ? `-${formatMoneyRaw(
                                (record.discountBreakdown || []).reduce((s, d) => s + Math.abs(d.amount), 0),
                              )}`
                            : '-'}
                        </td>
                        <td className="px-3 py-3 text-right text-red-700 dark:text-red-400 text-xs">
                          {record.platformFee !== 0 ? formatMoney(record.platformFee) : '-'}
                        </td>
                        <td className="px-3 py-3 text-right text-red-700 dark:text-red-400 text-xs">
                          {record.gatewayFee !== 0 ? formatMoney(record.gatewayFee) : '-'}
                        </td>
                        <td className="px-3 py-3 text-right border-r border-border bg-muted/20">
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-muted-foreground">
                              应: {formatMoney(record.expectedRecv)}
                            </span>
                            <span className={cn('font-bold', diff === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                              实: {formatMoney(record.actualRecv)}
                            </span>
                            {diff !== 0 && <span className="text-[10px] text-rose-600 dark:text-rose-400">差: {formatMoney(diff)}</span>}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-center">
                          <span
                            className={cn(
                              'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium',
                              consumeConfig[record.consumeStatus]?.color,
                            )}
                          >
                            {consumeConfig[record.consumeStatus]?.text}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center border-r border-border">
                          <div className="flex flex-col items-center justify-center gap-1">
                            {record.bankStatus === 'in_transit' && (
                              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full flex items-center gap-1 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30">
                                <Clock className="size-2.5" /> {record.settlementCycle} 在途
                              </span>
                            )}
                            {record.bankStatus === 'arrived' && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                                已入账({record.settlementCycle})
                              </span>
                            )}
                            {record.bankStatus === 'internal' && (
                              <span className="text-[10px] bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded-full">
                                内部记账
                              </span>
                            )}
                            {record.bankStatus === 'pending_recon' && (
                              <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-full animate-pulse dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30">
                                挂账待查
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-center min-w-[120px]">
                          <AssetChangeCell assetChange={record.assetChange} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={invoiceConfig[record.invoice.status]?.color}>
                              {invoiceConfig[record.invoice.status]?.text}
                            </span>
                            {record.invoice.status !== 'none' && (
                              <span className="text-[9px] text-muted-foreground">
                                {formatMoney(record.invoice.amount)} {record.invoice.type}
                              </span>
                            )}
                            {record.invoice.originalInvoiceId && (
                              <span className="text-[9px] text-primary">原票:{record.invoice.originalInvoiceId}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center border-r border-border">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              openVoucher(record)
                            }}
                            className="text-[10px] h-auto py-1 px-2"
                          >
                            查看凭证
                          </Button>
                        </td>

                        <td
                          className={cn(
                            'px-3 py-3 text-center sticky right-[80px] z-10 border-l border-border shadow-[-2px_0_5px_rgba(0,0,0,0.03)]',
                            rowBg,
                            'group-hover:bg-slate-100 dark:group-hover:bg-slate-800',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border',
                              statusConfig[record.status || 'matched'].color,
                            )}
                          >
                            {statusConfig[record.status || 'matched'].text}
                          </span>
                        </td>
                        <td
                          className={cn(
                            'px-3 py-3 text-center w-20 sticky right-0 z-10 border-l border-border shadow-[-2px_0_5px_rgba(0,0,0,0.03)]',
                            rowBg,
                            'group-hover:bg-slate-100 dark:group-hover:bg-slate-800',
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {record.invoice.status === 'pending' && canInvoice && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openInvoiceDialog([record])}
                                disabled={invoiceMut.isPending || batchInvoiceMut.isPending}
                                className="text-[11px] h-auto py-1 px-2 w-full text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-500/30 dark:hover:bg-rose-500/15"
                              >
                                开票
                              </Button>
                            )}
                            {!['matched', 'refunded'].includes(record.status || '') && canForceMatch && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openForceMatch([record.id])}
                                disabled={forceMatchMut.isPending}
                                className="text-[11px] h-auto py-1 px-2 w-full text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500/30 dark:hover:bg-emerald-500/15"
                              >
                                平账
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDetailRecord(record)}
                              className="text-[11px] h-auto py-1 px-2 w-full"
                            >
                              详情
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={17} className="px-4 py-20 text-center text-muted-foreground bg-background sticky left-0 z-0">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Calculator className="size-8 text-muted-foreground/50" />
                        <p className="font-medium">当前视图下未找到流水记录</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        {meta && meta.total > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/30 flex flex-col sm:flex-row justify-between items-center text-xs text-muted-foreground gap-3">
            <div className="flex items-center gap-4">
              <span>
                共找到 <span className="font-bold text-foreground">{meta.total}</span> 条流水
              </span>
              <div className="hidden sm:flex items-center gap-2">
                每页显示
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                  className="border border-border rounded px-1 py-0.5 bg-background text-foreground outline-none"
                >
                  <option>20</option>
                  <option>50</option>
                  <option>100</option>
                </select>
                条
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                上一页
              </Button>
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>

      <ForceMatchDialog
        open={forceMatchOpen}
        onOpenChange={setForceMatchOpen}
        targetIds={forceMatchIds}
        onSubmit={submitForceMatch}
      />
      <BankImportDialog
        open={bankImportOpen}
        onOpenChange={setBankImportOpen}
        onImport={handleBankImport}
      />
      <Dialog open={quickInvoiceOpen} onOpenChange={setQuickInvoiceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" /> 输入单号快捷开票
            </DialogTitle>
          </DialogHeader>
          <QuickInvoiceInput
            records={records}
            onConfirm={handleQuickInvoice}
            onCancel={() => {
              setQuickInvoiceOpen(false)
              setQuickInvoiceRecord(null)
            }}
          />
        </DialogContent>
      </Dialog>
      <VoucherDialog
        open={voucherOpen}
        onOpenChange={setVoucherOpen}
        record={voucherRecord}
      />
      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        records={invoiceDialogRecords}
        onSubmit={submitInvoice}
      />
      <DetailDialog
        open={!!detailRecord}
        onOpenChange={(open) => !open && setDetailRecord(null)}
        record={detailRecord}
      />
    </div>
  )
}
