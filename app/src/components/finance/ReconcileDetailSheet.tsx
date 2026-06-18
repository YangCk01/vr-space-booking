import { CheckCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import type { ReconcileDetailItem, ReconcileDetailsResult, ReconcileFixResult } from '@/api/finance'
import {
  describeFixEffect,
  formatReconValue,
  getReconPlainText,
} from '@/lib/financeReconcile'

type ReconcileDetailParams = {
  type: string
  date?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  detailData?: ReconcileDetailsResult | null
  detailParams: ReconcileDetailParams | null
  fixResult: ReconcileFixResult | null
  onClearFixResult: () => void
  fixDraft: ReconcileDetailItem | null
  setFixDraft: (item: ReconcileDetailItem | null) => void
  fixReason: string
  setFixReason: (reason: string) => void
  isFixPending: boolean
  canFix?: boolean
  onSubmitFix: (params: {
    type: string
    targetId: string
    diff: number
    date?: string
    mode?: string
    reason: string
  }) => void
}

export default function ReconcileDetailSheet({
  open,
  onOpenChange,
  detailData,
  detailParams,
  fixResult,
  onClearFixResult,
  fixDraft,
  setFixDraft,
  fixReason,
  setFixReason,
  isFixPending,
  canFix = false,
  onSubmitFix,
}: Props) {
  const closeFixDialog = () => {
    setFixDraft(null)
    setFixReason('')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[620px] bg-vrbg-card border-vrborder-subtle overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-vrtext-primary">差异定位与修复</SheetTitle>
          <SheetDescription className="text-vrtext-secondary">
            {detailData ? `已定位 ${detailData.items.length} 条差异记录，先核实再生成调整单` : '加载中...'}
          </SheetDescription>
        </SheetHeader>

        {fixResult && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-vr-body-sm font-semibold text-emerald-300">修复已生效</p>
                <p className="text-vr-caption text-vrtext-secondary mt-1">{describeFixEffect(fixResult)}</p>
                <div className="grid grid-cols-2 gap-2 mt-3 text-vr-caption">
                  <div className="rounded-lg bg-vrbg-surface p-2">
                    <p className="text-vrtext-muted">调整单号</p>
                    <p className="font-mono text-vrtext-primary mt-0.5">{fixResult.adjustmentNo || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-vrbg-surface p-2">
                    <p className="text-vrtext-muted">余额流水</p>
                    <p className="font-mono text-vrtext-primary mt-0.5">{fixResult.balanceTransactionId?.slice(0, 8) || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-vrbg-surface p-2">
                    <p className="text-vrtext-muted">修复前本金/赠送/积分</p>
                    <p className="text-vrtext-primary mt-0.5">
                      {formatReconValue(fixResult.userBefore?.principalBalance || 0, '元')} / {formatReconValue(fixResult.userBefore?.bonusBalance || 0, '元')} / {(fixResult.userBefore?.points || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-vrbg-surface p-2">
                    <p className="text-vrtext-muted">修复后本金/赠送/积分</p>
                    <p className="text-vrtext-primary mt-0.5">
                      {formatReconValue(fixResult.userAfter?.principalBalance || 0, '元')} / {formatReconValue(fixResult.userAfter?.bonusBalance || 0, '元')} / {(fixResult.userAfter?.points || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={onClearFixResult}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-muted hover:text-vrtext-primary hover:bg-vrbg-surface"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {detailData?.items.map((item) => {
            const plain = getReconPlainText({ name: item.title, diff: item.diff, unit: item.unit, note: item.reason })
            return (
              <div key={item.id} className="bg-vrbg-surface rounded-xl p-4 border border-vrborder-subtle">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-vr-body-sm text-vrtext-primary font-semibold">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-vr-caption text-vrtext-tertiary mt-1">{item.subtitle}</p>
                    )}
                    <p className="text-vr-body-sm text-red-300 font-medium mt-2">{plain.title}</p>
                  </div>
                  {canFix && item.diff !== 0 && detailParams && item.canAutoFix !== false && (
                    <button
                      onClick={() => {
                        setFixDraft(item)
                        setFixReason('')
                        onClearFixResult()
                      }}
                      disabled={isFixPending}
                      className="shrink-0 h-8 px-3 rounded-lg bg-vraccent-primary text-white text-vr-caption hover:opacity-90 disabled:opacity-50"
                    >
                      生成调整单
                    </button>
                  )}
                  {item.diff !== 0 && (!canFix || item.canAutoFix === false) && (
                    <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-vr-caption text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                      {item.canAutoFix === false ? '需人工处理' : '只读'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 text-vr-caption">
                  <div className="rounded-lg bg-vrbg-card p-2">
                    <p className="text-vrtext-muted">系统账</p>
                    <p className="text-vrtext-primary font-medium mt-0.5">{formatReconValue(item.actual, item.unit)}</p>
                  </div>
                  <div className="rounded-lg bg-vrbg-card p-2">
                    <p className="text-vrtext-muted">业务账</p>
                    <p className="text-vrtext-primary font-medium mt-0.5">{formatReconValue(item.expected, item.unit)}</p>
                  </div>
                  <div className="rounded-lg bg-vrbg-card p-2">
                    <p className="text-vrtext-muted">需要调整</p>
                    <p className="text-red-400 font-semibold mt-0.5">{item.diff > 0 ? '+' : ''}{formatReconValue(item.diff, item.unit)}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-orange-50 border border-orange-300 px-3 py-2 dark:bg-orange-500/10 dark:border-orange-500/30">
                  <p className="text-vr-caption text-orange-800 dark:text-orange-200">定位原因：{item.reason}</p>
                  <p className="text-vr-caption text-vrtext-secondary mt-1">
                    处理建议：{item.canAutoFix === false
                      ? (item.fixHint || '该差异不能自动生成调整单，请先人工核实原始记录。')
                      : (item.fixHint || '确认这条记录确实需要平账后，再生成调整单；不确定时先联系财务复核。')}
                  </p>
                </div>
              </div>
            )
          })}
          {detailData && detailData.items.length === 0 && (
            <div className="text-center text-vr-caption text-vrtext-tertiary py-8">暂无差异明细</div>
          )}
        </div>

        {fixDraft && detailParams && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-vrborder-subtle bg-vrbg-card shadow-xl">
              <div className="flex items-start justify-between gap-3 border-b border-vrborder-subtle px-5 py-4">
                <div>
                  <h3 className="text-vr-body font-semibold text-vrtext-primary">确认生成财务调整单</h3>
                  <p className="text-vr-caption text-vrtext-muted mt-1">系统会写入余额流水、调整单和审计记录。</p>
                </div>
                <button
                  onClick={closeFixDialog}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-vrtext-muted hover:text-vrtext-primary hover:bg-vrbg-surface"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-lg bg-vrbg-surface p-4">
                  <p className="text-vr-body-sm font-medium text-vrtext-primary">{fixDraft.title}</p>
                  {fixDraft.subtitle && <p className="text-vr-caption text-vrtext-muted mt-1">{fixDraft.subtitle}</p>}
                  <div className="grid grid-cols-3 gap-2 mt-3 text-vr-caption">
                    <div>
                      <p className="text-vrtext-muted">系统账</p>
                      <p className="text-vrtext-primary font-medium">{formatReconValue(fixDraft.actual, fixDraft.unit)}</p>
                    </div>
                    <div>
                      <p className="text-vrtext-muted">业务账</p>
                      <p className="text-vrtext-primary font-medium">{formatReconValue(fixDraft.expected, fixDraft.unit)}</p>
                    </div>
                    <div>
                      <p className="text-vrtext-muted">调整额</p>
                      <p className="text-red-400 font-semibold">{fixDraft.diff > 0 ? '+' : ''}{formatReconValue(fixDraft.diff, fixDraft.unit)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-vr-caption text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
                  生成调整单后会立即修改关联会员余额或积分。请确认这不是渠道漏单、重复支付或订单状态未同步导致的临时差异。
                </div>

                <div>
                  <label className="block text-vr-caption text-vrtext-muted mb-1">修复原因</label>
                  <textarea
                    value={fixReason}
                    onChange={(e) => setFixReason(e.target.value)}
                    rows={4}
                    maxLength={300}
                    placeholder="例如：已与收银流水核对，会员余额少记，生成调整单补齐"
                    className="w-full rounded-lg border border-vrborder-subtle bg-vrbg-surface px-3 py-2 text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary resize-none"
                  />
                  <p className="text-vr-caption text-vrtext-muted mt-1">{fixReason.trim().length}/300，至少 4 个字</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-vrborder-subtle px-5 py-4">
                <button
                  onClick={closeFixDialog}
                  className="h-9 px-4 rounded-lg bg-vrbg-surface text-vrtext-secondary hover:text-vrtext-primary"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const reason = fixReason.trim()
                    if (reason.length < 4) {
                      toast.error('请填写至少 4 个字的修复原因')
                      return
                    }
                    onSubmitFix({
                      type: detailParams.type,
                      targetId: fixDraft.id,
                      diff: fixDraft.diff,
                      date: detailParams.date,
                      mode: detailData?.mode,
                      reason,
                    })
                  }}
                  disabled={isFixPending || fixReason.trim().length < 4}
                  className="h-9 px-4 rounded-lg bg-vraccent-primary text-white disabled:opacity-50"
                >
                  {isFixPending ? '生成中...' : '确认生成调整单'}
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
