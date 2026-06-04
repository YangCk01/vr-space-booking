import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Zap, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  getTriggerRules,
  createTriggerRule,
  updateTriggerRule,
  deleteTriggerRule,
  toggleTriggerRule,
} from '@/api/triggerRules'
import { getCampaigns } from '@/api/campaign'
import type { TriggerRule, CreateTriggerRuleInput } from '@/api/triggerRules'

/* ─── Helpers ─── */
const eventLabelMap: Record<string, string> = {
  USER_REGISTERED: '用户注册',
  ORDER_COMPLETED: '订单完成',
  DORMANT_DETECTED: '沉睡唤醒',
  BIRTHDAY: '生日',
}

const eventOptions = [
  { key: 'USER_REGISTERED', label: '用户注册' },
  { key: 'ORDER_COMPLETED', label: '订单完成' },
  { key: 'DORMANT_DETECTED', label: '沉睡唤醒' },
  { key: 'BIRTHDAY', label: '生日' },
]

const actionTypeOptions = [
  { key: 'GIFT_POINTS', label: '赠送积分' },
  { key: 'GIFT_COUPON', label: '赠送优惠券' },
]

/* ─── Condition Form State ─── */
interface ConditionForm {
  minAmount: string
  maxAmount: string
  dormantDays: string
  birthdayAdvanceDays: string
}

function buildConditions(event: string, form: ConditionForm): Record<string, any> {
  const conditions: Record<string, any> = {}
  if (event === 'ORDER_COMPLETED') {
    if (form.minAmount) conditions.minAmount = parseInt(form.minAmount)
    if (form.maxAmount) conditions.maxAmount = parseInt(form.maxAmount)
  }
  if (event === 'DORMANT_DETECTED' && form.dormantDays) {
    conditions.dormantDays = parseInt(form.dormantDays)
  }
  if (event === 'BIRTHDAY' && form.birthdayAdvanceDays) {
    conditions.birthdayAdvanceDays = parseInt(form.birthdayAdvanceDays)
  }
  return conditions
}

function parseConditions(event: string, conditions: Record<string, any>): ConditionForm {
  return {
    minAmount: conditions?.minAmount?.toString() || '',
    maxAmount: conditions?.maxAmount?.toString() || '',
    dormantDays: conditions?.dormantDays?.toString() || '',
    birthdayAdvanceDays: conditions?.birthdayAdvanceDays?.toString() || '',
  }
}

/* ─── Action Form State ─── */
interface ActionForm {
  type: 'GIFT_POINTS' | 'GIFT_COUPON'
  points: string
  couponName: string
  couponDiscountRate: string
  couponValidDays: string
}

function buildAction(form: ActionForm): { type: string; [key: string]: any } {
  if (form.type === 'GIFT_POINTS') {
    return { type: 'GIFT_POINTS', points: parseInt(form.points) || 0 }
  }
  return {
    type: 'GIFT_COUPON',
    name: form.couponName,
    discountRate: form.couponDiscountRate ? parseInt(form.couponDiscountRate) : undefined,
    validityDays: form.couponValidDays ? parseInt(form.couponValidDays) : undefined,
  }
}

function parseAction(action: { type: string; [key: string]: any }): ActionForm {
  if (action.type === 'GIFT_POINTS') {
    return { type: 'GIFT_POINTS', points: action.points?.toString() || '100', couponName: '', couponDiscountRate: '', couponValidDays: '' }
  }
  return {
    type: 'GIFT_COUPON',
    points: '',
    couponName: action.name || '',
    couponDiscountRate: action.discountRate?.toString() || '',
    couponValidDays: action.validityDays?.toString() || '',
  }
}

/* ─── Rule Modal (Create / Edit) ─── */
interface RuleModalProps {
  open: boolean
  onClose: () => void
  rule: TriggerRule | null
  onSubmit: (data: CreateTriggerRuleInput) => void
  isPending: boolean
}

function RuleModal({ open, onClose, rule, onSubmit, isPending }: RuleModalProps) {
  const [form, setForm] = useState({
    name: '',
    event: 'USER_REGISTERED',
    runOnce: true,
    conditionForm: { minAmount: '', maxAmount: '', dormantDays: '', birthdayAdvanceDays: '' } as ConditionForm,
    actionForm: { type: 'GIFT_POINTS' as 'GIFT_POINTS' | 'GIFT_COUPON', points: '100', couponName: '', couponDiscountRate: '', couponValidDays: '' } as ActionForm,
    campaignId: '',
  })

  // Fetch campaigns for dropdown
  const { data: campaignData } = useQuery({
    queryKey: ['campaigns-for-trigger'],
    queryFn: () => getCampaigns({ pageSize: 100 }),
    enabled: open,
    staleTime: 1000 * 60,
  })
  const conditionalCampaigns = (campaignData?.data || []).filter((c: any) => c.type === 'CONDITIONAL' || c.type === 'TRIGGER')

  useEffect(() => {
    if (!open) return
    if (rule) {
      const actions = (rule.actions as any[]) || []
      const action = actions[0] || { type: 'GIFT_POINTS', points: 100 }
      setForm({
        name: rule.name,
        event: rule.event,
        runOnce: rule.runOnce,
        conditionForm: parseConditions(rule.event, rule.conditions || {}),
        actionForm: parseAction(action),
        campaignId: rule.campaignId ?? '',
      })
    } else {
      setForm({
        name: '',
        event: 'USER_REGISTERED',
        runOnce: true,
        conditionForm: { minAmount: '', maxAmount: '', dormantDays: '', birthdayAdvanceDays: '' },
        actionForm: { type: 'GIFT_POINTS', points: '100', couponName: '', couponDiscountRate: '', couponValidDays: '' },
        campaignId: '',
      })
    }
  }, [open, rule?.id])

  const handleSubmit = () => {
    if (!form.name.trim()) {
      alert('请输入规则名称')
      return
    }
    if (form.actionForm.type === 'GIFT_POINTS' && (!form.actionForm.points || parseInt(form.actionForm.points) <= 0)) {
      alert('请输入有效的积分数')
      return
    }
    if (form.actionForm.type === 'GIFT_COUPON' && !form.actionForm.couponName.trim()) {
      alert('请输入券名称')
      return
    }

    const conditions = buildConditions(form.event, form.conditionForm)
    const action = buildAction(form.actionForm)

    onSubmit({
      name: form.name.trim(),
      event: form.event,
      runOnce: form.runOnce,
      conditions,
      actions: [action],
      campaignId: form.campaignId.trim() || null,
    })
  }

  const setEvent = (event: string) => {
    setForm((p) => ({ ...p, event, conditionForm: { minAmount: '', maxAmount: '', dormantDays: '', birthdayAdvanceDays: '' } }))
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-vrbg-card rounded-xl border border-vrborder-subtle shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-vrborder-subtle">
              <h3 className="text-vr-body font-semibold text-vrtext-primary">
                {rule ? '编辑规则' : '新建规则'}
              </h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-vrbg-elevated transition-colors">
                <X className="w-4 h-4 text-vrtext-muted" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 规则名称 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">规则名称 <span className="text-vrerror">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="请输入规则名称"
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-all"
                />
              </div>

              {/* 触发事件 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">触发事件 <span className="text-vrerror">*</span></label>
                <select
                  value={form.event}
                  onChange={(e) => setEvent(e.target.value)}
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                >
                  {eventOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 执行次数 */}
              <div className="flex items-center gap-3">
                <input
                  id="runOnce"
                  type="checkbox"
                  checked={form.runOnce}
                  onChange={(e) => setForm((p) => ({ ...p, runOnce: e.target.checked }))}
                  className="w-4 h-4 accent-vraccent-primary rounded border-vrborder-subtle"
                />
                <label htmlFor="runOnce" className="text-vr-body-sm text-vrtext-primary cursor-pointer select-none">
                  每个用户仅执行一次
                </label>
              </div>

              {/* 条件配置 - 根据事件动态显示 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">触发条件</label>
                <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg p-4 space-y-3">
                  {form.event === 'USER_REGISTERED' && (
                    <p className="text-vr-body-sm text-vrtext-muted">用户注册时自动触发，无需额外条件</p>
                  )}

                  {form.event === 'ORDER_COMPLETED' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">最小订单金额（分）</label>
                          <input
                            type="number"
                            value={form.conditionForm.minAmount}
                            onChange={(e) => setForm((p) => ({ ...p, conditionForm: { ...p.conditionForm, minAmount: e.target.value } }))}
                            placeholder="不限"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">最大订单金额（分）</label>
                          <input
                            type="number"
                            value={form.conditionForm.maxAmount}
                            onChange={(e) => setForm((p) => ({ ...p, conditionForm: { ...p.conditionForm, maxAmount: e.target.value } }))}
                            placeholder="不限"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                          />
                        </div>
                      </div>
                      <p className="text-vr-caption text-vrtext-muted">留空表示不限制金额范围</p>
                    </>
                  )}

                  {form.event === 'DORMANT_DETECTED' && (
                    <div>
                      <label className="block text-vr-caption text-vrtext-tertiary mb-1">沉默天数 <span className="text-vrerror">*</span></label>
                      <input
                        type="number"
                        value={form.conditionForm.dormantDays}
                        onChange={(e) => setForm((p) => ({ ...p, conditionForm: { ...p.conditionForm, dormantDays: e.target.value } }))}
                        placeholder="如 30"
                        className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                      />
                    </div>
                  )}

                  {form.event === 'BIRTHDAY' && (
                    <div>
                      <label className="block text-vr-caption text-vrtext-tertiary mb-1">提前天数 <span className="text-vrerror">*</span></label>
                      <input
                        type="number"
                        value={form.conditionForm.birthdayAdvanceDays}
                        onChange={(e) => setForm((p) => ({ ...p, conditionForm: { ...p.conditionForm, birthdayAdvanceDays: e.target.value } }))}
                        placeholder="如 7"
                        className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 动作配置 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">执行动作 <span className="text-vrerror">*</span></label>
                <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-vr-caption text-vrtext-tertiary mb-1">动作类型</label>
                    <div className="flex gap-2">
                      {actionTypeOptions.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setForm((p) => ({ ...p, actionForm: { ...p.actionForm, type: opt.key as 'GIFT_POINTS' | 'GIFT_COUPON' } }))}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-vr-body-sm border transition-colors',
                            form.actionForm.type === opt.key
                              ? 'bg-vraccent-primary/10 border-vraccent-primary text-vraccent-primary'
                              : 'bg-vrbg-card border-vrborder-subtle text-vrtext-secondary hover:border-vrborder-hover'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.actionForm.type === 'GIFT_POINTS' && (
                    <div>
                      <label className="block text-vr-caption text-vrtext-tertiary mb-1">积分数 <span className="text-vrerror">*</span></label>
                      <input
                        type="number"
                        value={form.actionForm.points}
                        onChange={(e) => setForm((p) => ({ ...p, actionForm: { ...p.actionForm, points: e.target.value } }))}
                        placeholder="如 100"
                        className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                      />
                    </div>
                  )}

                  {form.actionForm.type === 'GIFT_COUPON' && (
                    <>
                      <div>
                        <label className="block text-vr-caption text-vrtext-tertiary mb-1">券名称 <span className="text-vrerror">*</span></label>
                        <input
                          type="text"
                          value={form.actionForm.couponName}
                          onChange={(e) => setForm((p) => ({ ...p, actionForm: { ...p.actionForm, couponName: e.target.value } }))}
                          placeholder="如 八折券"
                          className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">折扣率 (%)</label>
                          <input
                            type="number"
                            value={form.actionForm.couponDiscountRate}
                            onChange={(e) => setForm((p) => ({ ...p, actionForm: { ...p.actionForm, couponDiscountRate: e.target.value } }))}
                            placeholder="如 80 表示8折"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">有效期（天）</label>
                          <input
                            type="number"
                            value={form.actionForm.couponValidDays}
                            onChange={(e) => setForm((p) => ({ ...p, actionForm: { ...p.actionForm, couponValidDays: e.target.value } }))}
                            placeholder="如 30"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 关联活动 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">关联条件触发活动</label>
                <select
                  value={form.campaignId}
                  onChange={(e) => setForm((p) => ({ ...p, campaignId: e.target.value }))}
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary transition-all"
                >
                  <option value="">不关联</option>
                  {conditionalCampaigns.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-vr-caption text-vrtext-muted mt-1">关联后，触发时将自动发放该活动的奖励</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-subtle">
              <button onClick={onClose} className="px-4 py-2 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors">
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="px-4 py-2 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {rule ? '保存' : '创建'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ─── Delete Confirm Dialog ─── */
interface DeleteConfirmProps {
  rule: TriggerRule | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
  isPending: boolean
}

function DeleteConfirmDialog({ rule, open, onOpenChange, onConfirm, isPending }: DeleteConfirmProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-vrtext-primary">确认删除</AlertDialogTitle>
          <AlertDialogDescription className="text-vrtext-secondary">
            确定要删除规则 <span className="text-vrtext-primary font-medium">{rule?.name}</span> 吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary">
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm() }}
            disabled={isPending}
            className="bg-vrerror text-white hover:bg-vrerror/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ─── Main Page ─── */
export default function TriggerRules() {
  const queryClient = useQueryClient()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<TriggerRule | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRule, setDeletingRule] = useState<TriggerRule | null>(null)

  const { data } = useQuery({
    queryKey: ['triggerRules', currentPage, pageSize],
    queryFn: () => getTriggerRules({ page: currentPage, pageSize }),
    staleTime: 1000 * 30,
    placeholderData: (previousData: any) => previousData,
  })

  const rules: TriggerRule[] = data?.data || []
  const total = data?.meta?.total || 0
  const totalPages = data?.meta?.totalPages || 1
  const safePage = Math.min(currentPage, totalPages)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['triggerRules'] })
  }

  const createMutation = useMutation({
    mutationFn: createTriggerRule,
    onSuccess: () => {
      invalidate()
      setModalOpen(false)
      setEditingRule(null)
    },
    onError: (error: any) => {
      alert('创建失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTriggerRuleInput> }) => updateTriggerRule(id, data),
    onSuccess: () => {
      invalidate()
      setModalOpen(false)
      setEditingRule(null)
    },
    onError: (error: any) => {
      alert('更新失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTriggerRule,
    onSuccess: () => {
      invalidate()
      setDeleteDialogOpen(false)
      setDeletingRule(null)
    },
    onError: (error: any) => {
      alert('删除失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const toggleMutation = useMutation({
    mutationFn: toggleTriggerRule,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['triggerRules'] })
      const previousData = queryClient.getQueryData(['triggerRules'])
      queryClient.setQueryData(['triggerRules'], (old: any) => {
        if (!old || !old.data) return old
        return { ...old, data: old.data.map((r: TriggerRule) => r.id === id ? { ...r, enabled: !r.enabled } : r) }
      })
      return { previousData }
    },
    onError: (err: any, _id, context: any) => {
      if (context?.previousData) queryClient.setQueryData(['triggerRules'], context.previousData)
      alert('切换状态失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['triggerRules'] })
    },
  })

  const handleOpenCreate = () => {
    setEditingRule(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (rule: TriggerRule) => {
    setEditingRule(rule)
    setModalOpen(true)
  }

  const handleOpenDelete = (rule: TriggerRule) => {
    setDeletingRule(rule)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (!deletingRule) return
    deleteMutation.mutate(deletingRule.id)
  }

  const handleSubmit = (formData: CreateTriggerRuleInput) => {
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  return (
    <Layout breadcrumb={['触发器规则']}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">
        <div className="flex items-center justify-between">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">触发器规则</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">管理自动化触发规则与动作</p>
          </motion.div>
          <motion.button initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }} onClick={handleOpenCreate} className="inline-flex items-center gap-2 h-9 px-4 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors">
            <Plus className="w-4 h-4" />
            新建规则
          </motion.button>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.2 }} className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-vrbg-elevated">
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[180px]">规则名称</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">触发事件</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[110px]">状态</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[110px]">执行次数</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">关联活动</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="wait">
                  {rules.map((rule, idx) => (
                    <motion.tr key={rule.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: idx * 0.06 }} className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors">
                      <td className="px-4 py-3"><span className="text-vr-body-sm text-vrtext-primary font-medium">{rule.name}</span></td>
                      <td className="px-4 py-3"><span className="text-vr-body-sm text-vrtext-primary">{eventLabelMap[rule.event] || rule.event}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Switch checked={rule.enabled} onCheckedChange={() => toggleMutation.mutate(rule.id)} disabled={toggleMutation.isPending && toggleMutation.variables === rule.id} />
                          <span className={cn('text-vr-caption', rule.enabled ? 'text-vrsuccess' : 'text-vrtext-muted')}>{rule.enabled ? '启用' : '禁用'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center"><span className="text-vr-body-sm text-vrtext-primary">{rule.runOnce ? '仅一次' : '每次'}</span></td>
                      <td className="px-4 py-3"><span className="text-vr-body-sm text-vrtext-primary">{rule.campaignId || '-'}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleOpenEdit(rule)} className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors" title="编辑"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleOpenDelete(rule)} className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vrerror hover:bg-vrerror/10 transition-colors" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {rules.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Zap className="w-12 h-12 text-vrtext-muted mb-3" />
              <p className="text-vr-body text-vrtext-secondary">暂无触发器规则</p>
            </div>
          )}

          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-vrborder-subtle">
              <div className="flex items-center gap-2">
                <span className="text-vr-caption text-vrtext-tertiary">每页</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }} className="h-7 px-2 bg-vrbg-surface border border-vrborder-subtle rounded text-vr-caption text-vrtext-primary focus:outline-none focus:border-vraccent-primary">
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span className="text-vr-caption text-vrtext-tertiary">条</span>
                <span className="text-vr-caption text-vrtext-tertiary ml-2">共 {total} 条</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button key={page} onClick={() => setCurrentPage(page)} className={cn('w-8 h-8 flex items-center justify-center rounded-lg text-vr-body-sm font-medium transition-colors', page === safePage ? 'bg-vraccent-primary text-white' : 'border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated')}>{page}</button>
                ))}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 transition-colors"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      <RuleModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingRule(null) }} rule={editingRule} onSubmit={handleSubmit} isPending={createMutation.isPending || updateMutation.isPending} />
      <DeleteConfirmDialog rule={deletingRule} open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={handleDeleteConfirm} isPending={deleteMutation.isPending} />
    </Layout>
  )
}
