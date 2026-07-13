import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Clock,
  CheckCircle2,
  PauseCircle,
  Ban,
  Eye,
  Play,
  Square,
  Flag,
  X,
  Copy,
  Gift,
} from 'lucide-react'
import Layout from '@/components/Layout'
import CampaignRewardRecordsModal from '@/components/campaigns/CampaignRewardRecordsModal'
import CampaignRewardEligibilityFields, {
  type CampaignRewardEligibilityValue,
  type EligibilityConditionKey,
} from '@/components/campaigns/CampaignRewardEligibilityFields'
import { selectableVenuesFromResponse } from '@/domain/campaignVenueOptions'
import {
  getCampaigns,
  createCampaign,
  pauseCampaign,
  endCampaign,
  activateCampaign,
  getCampaignTracks,
  getCampaignLogs,
  getCampaignEffects,
  deleteCampaign,
  updateCampaign,
  cloneCampaign,
  type Campaign,
  type CampaignReward,
  type CreateCampaignInput,
} from '@/api/campaign'
import {
  batchGiftPoints,
  batchGiftCoupon,
  getUsers,
  type User,
} from '@/api/users'
import { getGames, type Game } from '@/api/games'
import { getVenues, type Venue } from '@/api/venues'
import { cn } from '@/lib/utils'

// 用户标签选项（与后端 userTagJob.ts 保持一致）
const TAG_OPTIONS = [
  { key: 'NEW_CUSTOMER', label: '新用户' },
  { key: 'FIRST_ORDER', label: '首单用户' },
  { key: 'ACTIVE', label: '活跃用户' },
  { key: 'DORMANT', label: '沉睡用户' },
  { key: 'CHURN_RISK', label: '流失风险' },
  { key: 'VIP', label: 'VIP用户' },
]

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

/* ─── Helpers ─── */
function formatDateTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDate(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ─── Status Badge ─── */
type CampaignStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'ENDED'

const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
  DRAFT: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted', icon: <Clock className="w-3 h-3" />, label: '草稿' },
  RUNNING: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess', icon: <CheckCircle2 className="w-3 h-3" />, label: '进行中' },
  PAUSED: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', icon: <PauseCircle className="w-3 h-3" />, label: '已暂停' },
  ENDED: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-muted', icon: <Ban className="w-3 h-3" />, label: '已结束' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-vr-caption font-medium', cfg.bg, cfg.text)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

/* ─── Type Map ─── */
const typeLabelMap: Record<string, string> = {
  AUTO: '自动发放',
  AUTO_GIFT: '自动发放',
  MANUAL: '手动发放',
  MANUAL_GIFT: '手动发放',
  TRIGGER: '条件触发',
  CONDITIONAL: '条件触发',
}

/* ─── Trigger Rule Helpers ─── */
const eventOptions = [
  { key: 'USER_REGISTERED', label: '用户注册' },
  { key: 'ORDER_COMPLETED', label: '订单完成' },
  { key: 'DORMANT_DETECTED', label: '沉睡唤醒' },
  { key: 'BIRTHDAY', label: '生日' },
]

const eventLabelMap: Record<string, string> = {
  USER_REGISTERED: '用户注册',
  ORDER_COMPLETED: '订单完成',
  DORMANT_DETECTED: '沉睡唤醒',
  BIRTHDAY: '生日',
}

function buildConditions(event: string, conditionForm: any): Record<string, any> {
  const conditions: Record<string, any> = {}
  if (event === 'ORDER_COMPLETED') {
    if (conditionForm.minAmount) conditions.minAmount = parseInt(conditionForm.minAmount)
    if (conditionForm.maxAmount) conditions.maxAmount = parseInt(conditionForm.maxAmount)
  }
  if (event === 'DORMANT_DETECTED' && conditionForm.dormantDays) {
    conditions.dormantDays = parseInt(conditionForm.dormantDays)
  }
  if (event === 'BIRTHDAY' && conditionForm.birthdayAdvanceDays) {
    conditions.birthdayAdvanceDays = parseInt(conditionForm.birthdayAdvanceDays)
  }
  return conditions
}

const emptyEligibility = (): CampaignRewardEligibilityValue => ({
  conditions: [], minOrderAmount: '', venueIds: [], gameIds: [], weekdays: [],
  startTime: '', endTime: '', minPeople: '', firstOrderOnly: false, minCompletedOrders: '',
})

function eligibilityAction(value: CampaignRewardEligibilityValue) {
  const has = (key: EligibilityConditionKey) => value.conditions.includes(key)
  return {
    minOrderAmount: has('AMOUNT') ? Math.round(Number(value.minOrderAmount) * 100) : undefined,
    applicableVenues: has('VENUE') ? value.venueIds : [],
    applicableGames: has('GAME') ? value.gameIds : [],
    applicableWeekdays: has('WEEKDAY') ? value.weekdays : [],
    applicableStartTime: has('TIME') ? value.startTime : undefined,
    applicableEndTime: has('TIME') ? value.endTime : undefined,
    minPeople: has('PEOPLE') ? Number(value.minPeople) : undefined,
    firstOrderOnly: has('FIRST_ORDER'),
    minCompletedOrders: has('ORDER_COUNT') ? Number(value.minCompletedOrders) : undefined,
  }
}

function eligibilityError(value: CampaignRewardEligibilityValue): string | null {
  const has = (key: EligibilityConditionKey) => value.conditions.includes(key)
  if (value.conditions.length === 0) return '请至少选择一个门槛条件'
  if (has('AMOUNT') && !(Number(value.minOrderAmount) > 0)) return '请输入有效的最低订单金额'
  if (has('VENUE') && value.venueIds.length === 0) return '请至少选择一个场馆'
  if (has('GAME') && value.gameIds.length === 0) return '请至少选择一个游戏'
  if (has('WEEKDAY') && value.weekdays.length === 0) return '请至少选择一个星期'
  if (has('TIME') && (!value.startTime || !value.endTime)) return '请选择完整的体验时段'
  if (has('PEOPLE') && !(Number.isInteger(Number(value.minPeople)) && Number(value.minPeople) > 0)) return '请输入有效的最低体验人数'
  if (has('ORDER_COUNT') && !(Number.isInteger(Number(value.minCompletedOrders)) && Number(value.minCompletedOrders) > 0)) return '请输入有效的累计完成订单数'
  if (has('FIRST_ORDER') && has('ORDER_COUNT')) return '首次下单与累计完成订单数不能同时启用'
  return null
}

function userScopeTags(scope: 'ALL' | 'NORMAL' | 'PAID') {
  return scope === 'PAID'
    ? { targetTags: ['VIP'], excludeTags: [] }
    : scope === 'NORMAL' ? { targetTags: [], excludeTags: ['VIP'] } : { targetTags: [], excludeTags: [] }
}

function eligibilityFromReward(reward: CampaignReward | undefined, action: any): CampaignRewardEligibilityValue {
  const source: any = reward || action || {}
  const conditions: EligibilityConditionKey[] = []
  if (source.minOrderAmount) conditions.push('AMOUNT')
  if (source.applicableVenues?.length) conditions.push('VENUE')
  if (source.applicableGames?.length) conditions.push('GAME')
  if (source.applicableWeekdays?.length) conditions.push('WEEKDAY')
  if (source.applicableStartTime && source.applicableEndTime) conditions.push('TIME')
  if (source.minPeople) conditions.push('PEOPLE')
  if (source.firstOrderOnly) conditions.push('FIRST_ORDER')
  if (source.minCompletedOrders) conditions.push('ORDER_COUNT')
  return {
    conditions,
    minOrderAmount: source.minOrderAmount ? String(source.minOrderAmount / 100) : '',
    venueIds: source.applicableVenues || [],
    gameIds: source.applicableGames || [],
    weekdays: source.applicableWeekdays || [],
    startTime: source.applicableStartTime || '',
    endTime: source.applicableEndTime || '',
    minPeople: source.minPeople ? String(source.minPeople) : '',
    firstOrderOnly: source.firstOrderOnly === true,
    minCompletedOrders: source.minCompletedOrders ? String(source.minCompletedOrders) : '',
  }
}

function CouponInput({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  type = 'text',
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  suffix?: string
  type?: string
  maxLength?: number
}) {
  return (
    <label className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 text-vr-body-sm">
      <span className="text-right text-vrtext-primary">{label}:</span>
      <div>
        <div className="relative">
          <input
            type={type}
            value={value}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-11 w-full rounded-md border border-vrborder-subtle bg-vrbg-card px-5 pr-16 text-vr-body-sm text-vrtext-primary outline-none transition-colors placeholder:text-vrtext-muted focus:border-vraccent-primary"
          />
          {maxLength && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-vr-body-sm text-vrtext-muted">
              {value.length}/{maxLength}
            </span>
          )}
          {suffix && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-vr-body-sm text-vrtext-secondary">
              {suffix}
            </span>
          )}
        </div>
      </div>
    </label>
  )
}

function CouponRadioRow({
  label,
  options,
  value,
  onChange,
  help,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  help?: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 text-vr-body-sm">
      <span className="pt-1 text-right text-vrtext-primary">{label}:</span>
      <div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {options.map((option) => (
            <label key={option.value} className="inline-flex items-center gap-3 text-vrtext-primary">
              <input
                type="radio"
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="h-4 w-4 accent-vraccent-primary"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {help && <div className="mt-3 leading-6 text-vrtext-tertiary">{help}</div>}
      </div>
    </div>
  )
}

function CouponSelect({
  label,
  value,
  options,
}: {
  label: string
  value?: string
  options: string[]
}) {
  return (
    <label className="flex items-center gap-4">
      <span className="w-24 shrink-0 text-right text-vr-body-sm text-vrtext-primary">{label}:</span>
      <select
        value={value || ''}
        onChange={() => {}}
        className="h-11 min-w-[260px] rounded-md border border-vrborder-subtle bg-vrbg-card px-5 text-vr-body-sm text-vrtext-muted outline-none focus:border-vraccent-primary"
      >
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function AddCouponModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  const { data: games = [] } = useQuery({
    queryKey: ['games', 'ACTIVE', 'campaign-coupon-modal'],
    queryFn: () => getGames({ status: 'ACTIVE' }),
    enabled: open,
  })
  const { data: venueResponse } = useQuery({
    queryKey: ['venues', 'selectable', 'campaign-coupon-modal'],
    queryFn: () => getVenues({ pageSize: 100 }),
    enabled: open,
  })
  const venues: Venue[] = selectableVenuesFromResponse(venueResponse)
  const [form, setForm] = useState({
    couponName: '',
    rewardKind: 'COUPON' as 'COUPON' | 'POINTS' | 'EXPERIENCE',
    couponDiscountRate: '80',
    pointsAmount: '100',
    experienceGameId: '',
    couponUserType: 'ALL' as 'ALL' | 'NORMAL' | 'PAID',
    couponThresholdMode: 'NONE' as 'NONE' | 'THRESHOLD',
    validFrom: '',
    validTo: '',
    couponStartAt: '',
    couponEndAt: '',
    eligibility: emptyEligibility(),
    couponClaimTimeMode: 'UNLIMITED' as 'LIMITED' | 'UNLIMITED',
    couponQuantityMode: 'UNLIMITED' as 'LIMITED' | 'UNLIMITED',
    couponPublishQuantity: '',
    couponPerUserLimit: '1',
    couponEnabled: true,
    triggerEvent: 'USER_REGISTERED',
  })

  const resetForm = () => {
    setForm({
      couponName: '',
      rewardKind: 'COUPON',
      couponDiscountRate: '80',
      pointsAmount: '100',
      experienceGameId: '',
      couponUserType: 'ALL',
      couponThresholdMode: 'NONE',
      validFrom: '',
      validTo: '',
      couponStartAt: '',
      couponEndAt: '',
      eligibility: emptyEligibility(),
      couponClaimTimeMode: 'UNLIMITED',
      couponQuantityMode: 'UNLIMITED',
      couponPublishQuantity: '',
      couponPerUserLimit: '1',
      couponEnabled: true,
      triggerEvent: 'USER_REGISTERED',
    })
  }

  const createMut = useMutation({
    mutationFn: async (payload: CreateCampaignInput) => {
      const campaign = await createCampaign(payload)
      if (form.couponEnabled) {
        await activateCampaign(campaign.id)
      }
      return campaign
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      resetForm()
      onCreated()
      onClose()
    },
    onError: (error: any) => {
      alert('创建失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const submit = () => {
    const name = form.couponName.trim()
    if (!name) {
      alert('请输入优惠券名称')
      return
    }

    const discountRate = Number(form.couponDiscountRate)
    if (form.rewardKind === 'COUPON' && (!Number.isInteger(discountRate) || discountRate < 1 || discountRate > 99)) {
      alert('请输入有效的折扣率（1-99，例如80表示8折）')
      return
    }

    const pointsAmount = Number(form.pointsAmount)
    if (form.rewardKind === 'POINTS' && (!Number.isInteger(pointsAmount) || pointsAmount < 1)) {
      alert('请输入有效的积分数量')
      return
    }

    if (form.rewardKind === 'EXPERIENCE' && !form.experienceGameId) {
      alert('请选择体验券关联的游戏')
      return
    }

    if (!form.validFrom || !form.validTo || new Date(form.validFrom) >= new Date(form.validTo)) {
      alert('请选择有效的奖励生效和失效时间')
      return
    }

    const eligibility = form.couponThresholdMode === 'THRESHOLD' ? eligibilityAction(form.eligibility) : eligibilityAction(emptyEligibility())
    const thresholdError = form.couponThresholdMode === 'THRESHOLD' ? eligibilityError(form.eligibility) : null
    if (thresholdError) {
      alert(thresholdError)
      return
    }
    if (form.couponThresholdMode === 'THRESHOLD' && form.triggerEvent !== 'ORDER_COMPLETED') {
      alert('使用门槛仅适用于订单完成触发场景')
      return
    }

    if (form.couponClaimTimeMode === 'LIMITED' && (!form.couponStartAt || !form.couponEndAt)) {
      alert('请选择领取时间范围')
      return
    }
    if (form.couponClaimTimeMode === 'LIMITED' && new Date(form.couponStartAt) >= new Date(form.couponEndAt)) {
      alert('领取结束时间必须晚于开始时间')
      return
    }

    const maxQuantity = form.couponQuantityMode === 'LIMITED'
      ? Number(form.couponPublishQuantity)
      : 999999
    if (!Number.isInteger(maxQuantity) || maxQuantity < 1) {
      alert('请输入有效的发放数量')
      return
    }
    if (form.couponPerUserLimit !== '1') {
      alert('现有触发规则每个用户只执行一次，用户领取数量请保持为1张')
      return
    }

    const action =
      form.rewardKind === 'POINTS'
        ? { type: 'GIFT_POINTS', points: pointsAmount, validFrom: form.validFrom, validTo: form.validTo, ...eligibility }
        : form.rewardKind === 'EXPERIENCE'
          ? {
              type: 'GIFT_EXPERIENCE_COUPON',
              name,
              validFrom: form.validFrom,
              validTo: form.validTo,
              ...eligibility,
              applicableGames: eligibility.applicableGames.length ? eligibility.applicableGames : [form.experienceGameId],
            }
          : {
              type: 'GIFT_COUPON',
              name,
              discountRate,
              validFrom: form.validFrom,
              validTo: form.validTo,
              ...eligibility,
            }

    const payload: CreateCampaignInput = {
      name,
      type: 'TRIGGER',
      startAt: form.couponClaimTimeMode === 'LIMITED' ? form.couponStartAt : undefined,
      endAt: form.couponClaimTimeMode === 'LIMITED' ? form.couponEndAt : undefined,
      triggerRule: {
        event: form.triggerEvent,
        conditions: {},
        actions: [action],
        runOnce: true,
        maxQuantity,
      },
      ...userScopeTags(form.couponUserType),
      priority: 0,
      autoPauseOnBudgetExhausted: true,
      autoEndOnExpire: true,
    }

    createMut.mutate(payload)
  }

  const handleClose = () => {
    if (!createMut.isPending) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-xl border border-vrborder-subtle bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-vrborder-subtle bg-white px-6">
              <h3 className="text-vr-h3 font-semibold text-vrtext-primary">添加优惠券</h3>
              <button onClick={handleClose} className="rounded-lg p-1 transition-colors hover:bg-vrbg-elevated">
                <X className="h-4 w-4 text-vrtext-muted" />
              </button>
            </div>

            <div className="px-16 py-8">
              <div className="space-y-7">
                <CouponInput
                  label="奖励名称"
                  value={form.couponName}
                  maxLength={18}
                  placeholder="请输入奖励名称"
                  onChange={(value) => setForm((p) => ({ ...p, couponName: value }))}
                />
                <CouponRadioRow
                  label="用户类型"
                  value={form.couponUserType}
                  onChange={(value) => setForm((p) => ({ ...p, couponUserType: value as 'ALL' | 'NORMAL' | 'PAID' }))}
                  options={[
                    { value: 'ALL', label: '所有用户' },
                    { value: 'NORMAL', label: '普通用户' },
                    { value: 'PAID', label: '付费会员用户' },
                  ]}
                  help={(
                    <>
                      <div>所有用户：不限制用户等级；</div>
                      <div>普通用户：排除 VIP 用户；</div>
                      <div>付费会员用户：按现有用户标签限制到 VIP 用户。</div>
                    </>
                  )}
                />
                <CouponRadioRow
                  label="奖励类型"
                  value={form.rewardKind}
                  onChange={(value) => setForm((p) => ({ ...p, rewardKind: value as 'COUPON' | 'POINTS' | 'EXPERIENCE' }))}
                  options={[
                    { value: 'COUPON', label: '优惠券' },
                    { value: 'POINTS', label: '积分' },
                    { value: 'EXPERIENCE', label: '体验券' },
                  ]}
                  help={<div>按现有营销活动触发器发放奖励。</div>}
                />
                {form.rewardKind === 'COUPON' && (
                  <>
                    <CouponInput
                      label="折扣率"
                      type="number"
                      suffix="%"
                      value={form.couponDiscountRate}
                      onChange={(value) => setForm((p) => ({ ...p, couponDiscountRate: value }))}
                    />
                    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
                      <span />
                      <p className="-mt-5 text-vr-body-sm text-vrtext-tertiary">现有系统折扣券按折扣率保存，80 表示 8 折。</p>
                    </div>
                  </>
                )}
                {form.rewardKind === 'POINTS' && (
                  <CouponInput
                    label="积分数量"
                    type="number"
                    value={form.pointsAmount}
                    onChange={(value) => setForm((p) => ({ ...p, pointsAmount: value }))}
                  />
                )}
                {form.rewardKind === 'EXPERIENCE' && (
                  <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 text-vr-body-sm">
                    <span className="text-right text-vrtext-primary">关联游戏:</span>
                    <select
                      value={form.experienceGameId}
                      onChange={(e) => setForm((p) => ({ ...p, experienceGameId: e.target.value }))}
                      className="h-11 w-full rounded-md border border-vrborder-subtle bg-white px-5 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                    >
                      <option value="">请选择游戏</option>
                      {games.map((game: Game) => (
                        <option key={game.id} value={game.id}>{game.title}</option>
                      ))}
                    </select>
                  </div>
                )}
                <CouponRadioRow
                  label="使用门槛"
                  value={form.couponThresholdMode}
                  onChange={(value) => setForm((p) => ({ ...p, couponThresholdMode: value as 'NONE' | 'THRESHOLD' }))}
                  options={[
                    { value: 'NONE', label: '无门槛' },
                    { value: 'THRESHOLD', label: '有门槛' },
                  ]}
                />
                {form.couponThresholdMode === 'THRESHOLD' && (
                  <CampaignRewardEligibilityFields value={form.eligibility} venues={venues} games={games} onChange={(eligibility) => setForm((p) => ({ ...p, eligibility }))} />
                )}
                <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4"><span className="pt-3 text-right text-vr-body-sm text-vrtext-primary">奖励生效时间:</span><div className="grid grid-cols-2 gap-3"><input type="datetime-local" aria-label="奖励生效开始时间" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4" /><input type="datetime-local" aria-label="奖励生效结束时间" value={form.validTo} onChange={(e) => setForm((p) => ({ ...p, validTo: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4" /></div></div>
                <CouponRadioRow
                  label="领取时间"
                  value={form.couponClaimTimeMode}
                  onChange={(value) => setForm((p) => ({ ...p, couponClaimTimeMode: value as 'LIMITED' | 'UNLIMITED' }))}
                  options={[
                    { value: 'LIMITED', label: '限时' },
                    { value: 'UNLIMITED', label: '不限时' },
                  ]}
                  help={<div>限时会映射为营销活动开始时间和结束时间。</div>}
                />
                {form.couponClaimTimeMode === 'LIMITED' && (
                  <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
                    <span />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="datetime-local" value={form.couponStartAt} onChange={(e) => setForm((p) => ({ ...p, couponStartAt: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary" />
                      <input type="datetime-local" value={form.couponEndAt} onChange={(e) => setForm((p) => ({ ...p, couponEndAt: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary" />
                    </div>
                  </div>
                )}
                <CouponRadioRow
                  label="触发场景"
                  value={form.triggerEvent}
                  onChange={(value) => setForm((p) => value === 'ORDER_COMPLETED'
                    ? { ...p, triggerEvent: value }
                    : { ...p, triggerEvent: value, couponThresholdMode: 'NONE', eligibility: emptyEligibility() })}
                  options={[
                    { value: 'USER_REGISTERED', label: '用户注册' },
                    { value: 'ORDER_COMPLETED', label: '订单完成' },
                    { value: 'DORMANT_DETECTED', label: '沉睡唤醒' },
                    { value: 'BIRTHDAY', label: '生日' },
                  ]}
                  help={<div>按现有营销活动触发器发放优惠券。</div>}
                />
                <CouponRadioRow
                  label="优惠券发布数量"
                  value={form.couponQuantityMode}
                  onChange={(value) => setForm((p) => ({ ...p, couponQuantityMode: value as 'LIMITED' | 'UNLIMITED' }))}
                  options={[
                    { value: 'LIMITED', label: '限量' },
                    { value: 'UNLIMITED', label: '不限量' },
                  ]}
                />
                {form.couponQuantityMode === 'LIMITED' && (
                  <CouponInput
                    label="发布数量"
                    type="number"
                    value={form.couponPublishQuantity}
                    onChange={(value) => setForm((p) => ({ ...p, couponPublishQuantity: value }))}
                  />
                )}
                <CouponInput
                  label="用户领取数量"
                  type="number"
                  suffix="张"
                  value={form.couponPerUserLimit}
                  onChange={(value) => setForm((p) => ({ ...p, couponPerUserLimit: value }))}
                />
                <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
                  <span />
                  <p className="-mt-5 text-vr-body-sm text-vrtext-tertiary">现有触发规则按每个用户只执行一次保存，因此每个用户最多 1 张。</p>
                </div>
                <CouponRadioRow
                  label="状态"
                  value={form.couponEnabled ? 'ENABLED' : 'DISABLED'}
                  onChange={(value) => setForm((p) => ({ ...p, couponEnabled: value === 'ENABLED' }))}
                  options={[
                    { value: 'ENABLED', label: '开启' },
                    { value: 'DISABLED', label: '关闭' },
                  ]}
                  help={<div>关闭时会创建草稿活动；开启后按触发场景发放。</div>}
                />
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-vrborder-subtle bg-white px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={createMut.isPending}
                className="h-10 rounded-lg border border-vrborder-subtle px-4 text-vr-body-sm text-vrtext-secondary transition-colors hover:bg-vrbg-elevated disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={createMut.isPending}
                className="h-10 rounded-lg bg-vraccent-primary px-5 text-vr-body-sm font-medium text-white transition-colors hover:bg-vraccent-primary-hover disabled:opacity-50"
              >
                {createMut.isPending ? '创建中...' : '立即创建'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ─── Create Modal ─── */
function CreateCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    type: 'TRIGGER',
    startAt: '',
    endAt: '',
    budget: '',
    rewardType: 'POINTS',
    pointsAmount: '',
    couponName: '',
    couponDiscountRate: '',
    couponValidDays: '',
    maxQuantity: '',
    // 条件触发相关
    triggerEvent: 'USER_REGISTERED',
    triggerRunOnce: true,
    triggerConditionMinAmount: '',
    triggerConditionMaxAmount: '',
    triggerConditionDormantDays: '',
    triggerConditionBirthdayAdvanceDays: '',
    triggerActionType: 'GIFT_POINTS' as 'GIFT_POINTS' | 'GIFT_COUPON' | 'GIFT_EXPERIENCE_COUPON',
    triggerActionPoints: '100',
    triggerActionCouponName: '',
    triggerActionCouponDiscountRate: '1',
    triggerActionCouponValidDays: '0',
    couponUserType: 'NORMAL' as 'NORMAL' | 'PAID',
    couponDeliveryMode: 'CLAIM' as 'CLAIM' | 'SYSTEM',
    couponCategory: 'GENERAL' as 'GENERAL' | 'CATEGORY' | 'PRODUCT',
    couponThresholdMode: 'NONE' as 'NONE' | 'THRESHOLD',
    couponValidityMode: 'DAYS' as 'DAYS' | 'RANGE',
    couponValidStart: '',
    couponValidEnd: '',
    couponClaimTimeMode: 'UNLIMITED' as 'LIMITED' | 'UNLIMITED',
    couponClaimStart: '',
    couponClaimEnd: '',
    couponQuantityMode: 'UNLIMITED' as 'LIMITED' | 'UNLIMITED',
    couponPublishQuantity: '',
    couponPerUserLimit: '1',
    couponEnabled: true,
    triggerMaxQuantity: '9999',
    // 高级字段
    targetTags: [] as string[],
    excludeTags: [] as string[],
    priority: '0',
    channel: '',
    autoPauseOnBudgetExhausted: true,
    autoEndOnExpire: true,
  })

  const createMut = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      onClose()
      setForm({
        name: '',
        type: 'TRIGGER',
        startAt: '',
        endAt: '',
        budget: '',
        rewardType: 'POINTS',
        pointsAmount: '',
        couponName: '',
        couponDiscountRate: '',
        couponValidDays: '',
        maxQuantity: '',
        triggerEvent: 'USER_REGISTERED',
        triggerRunOnce: true,
        triggerConditionMinAmount: '',
        triggerConditionMaxAmount: '',
        triggerConditionDormantDays: '',
        triggerConditionBirthdayAdvanceDays: '',
        triggerActionType: 'GIFT_POINTS',
        triggerActionPoints: '100',
        triggerActionCouponName: '',
        triggerActionCouponDiscountRate: '1',
        triggerActionCouponValidDays: '0',
        couponUserType: 'NORMAL',
        couponDeliveryMode: 'CLAIM',
        couponCategory: 'GENERAL',
        couponThresholdMode: 'NONE',
        couponValidityMode: 'DAYS',
        couponValidStart: '',
        couponValidEnd: '',
        couponClaimTimeMode: 'UNLIMITED',
        couponClaimStart: '',
        couponClaimEnd: '',
        couponQuantityMode: 'UNLIMITED',
        couponPublishQuantity: '',
        couponPerUserLimit: '1',
        couponEnabled: true,
        triggerMaxQuantity: '9999',
        targetTags: [] as string[],
        excludeTags: [] as string[],
        priority: '0',
        channel: '',
        autoPauseOnBudgetExhausted: true,
        autoEndOnExpire: true,
      })
    },
    onError: (error: any) => {
      alert('创建失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const handleSubmit = () => {
    if (!form.name.trim()) {
      alert('请输入活动名称')
      return
    }

    // 条件触发活动校验
    const conditions = buildConditions(form.triggerEvent, {
      minAmount: form.triggerConditionMinAmount,
      maxAmount: form.triggerConditionMaxAmount,
      dormantDays: form.triggerConditionDormantDays,
      birthdayAdvanceDays: form.triggerConditionBirthdayAdvanceDays,
    })

    let actions: any[] = []
    if (form.triggerActionType === 'GIFT_POINTS') {
      if (!form.triggerActionPoints || parseInt(form.triggerActionPoints) <= 0) {
        alert('请输入有效的积分数')
        return
      }
      actions = [{ type: 'GIFT_POINTS', points: parseInt(form.triggerActionPoints) }]
    } else if (form.triggerActionType === 'GIFT_COUPON') {
      if (!form.triggerActionCouponName.trim()) {
        alert('请输入券名称')
        return
      }
      actions = [{
        type: 'GIFT_COUPON',
        name: form.triggerActionCouponName.trim(),
        discountRate: form.triggerActionCouponDiscountRate ? parseInt(form.triggerActionCouponDiscountRate) : undefined,
        validityDays: form.triggerActionCouponValidDays ? parseInt(form.triggerActionCouponValidDays) : undefined,
        couponCategory: form.couponCategory,
        userType: form.couponUserType,
        deliveryMode: form.couponDeliveryMode,
        thresholdMode: form.couponThresholdMode,
        validityMode: form.couponValidityMode,
        validStart: form.couponValidStart || undefined,
        validEnd: form.couponValidEnd || undefined,
        claimTimeMode: form.couponClaimTimeMode,
        claimStart: form.couponClaimStart || undefined,
        claimEnd: form.couponClaimEnd || undefined,
        quantityMode: form.couponQuantityMode,
        publishQuantity: form.couponPublishQuantity ? parseInt(form.couponPublishQuantity) : undefined,
        perUserLimit: form.couponPerUserLimit ? parseInt(form.couponPerUserLimit) : undefined,
        enabled: form.couponEnabled,
      }]
    } else if (form.triggerActionType === 'GIFT_EXPERIENCE_COUPON') {
      if (!form.triggerActionCouponName.trim()) {
        alert('请输入券名称')
        return
      }
      actions = [{
        type: 'GIFT_COUPON',
        name: form.triggerActionCouponName.trim(),
        couponType: 'EXPERIENCE',
        validityDays: form.triggerActionCouponValidDays ? parseInt(form.triggerActionCouponValidDays) : undefined,
      }]
    }

    const payload: any = {
      name: form.name.trim(),
      type: form.type,
      startAt: form.startAt || undefined,
      endAt: form.endAt || undefined,
      budget: form.budget ? Number(form.budget) * 100 : undefined,
      triggerRule: {
        event: form.triggerEvent,
        conditions,
        actions,
        runOnce: form.triggerRunOnce,
        maxQuantity: form.triggerMaxQuantity ? parseInt(form.triggerMaxQuantity) : 999999,
      },
      targetTags: form.targetTags || [],
      excludeTags: form.excludeTags || [],
      priority: form.priority ? parseInt(form.priority) : 0,
      channel: form.channel || undefined,
      autoPauseOnBudgetExhausted: form.autoPauseOnBudgetExhausted,
      autoEndOnExpire: form.autoEndOnExpire,
    }
    createMut.mutate(payload)
  }

  const rewardTypeLabelMap: Record<string, string> = {
    POINTS: '积分',
    DISCOUNT_COUPON: '折扣券',
    EXPERIENCE_COUPON: '体验券',
  }

  const setEvent = (event: string) => {
    setForm((p) => ({
      ...p,
      triggerEvent: event,
      triggerConditionMinAmount: '',
      triggerConditionMaxAmount: '',
      triggerConditionDormantDays: '',
      triggerConditionBirthdayAdvanceDays: '',
    }))
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
            className="bg-vrbg-card rounded-xl border border-vrborder-subtle shadow-xl w-full max-w-[1500px] mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-vrborder-subtle">
              <h3 className="text-vr-body font-semibold text-vrtext-primary">新建活动</h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-vrbg-elevated transition-colors">
                <X className="w-4 h-4 text-vrtext-muted" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 活动名称 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                  活动名称 <span className="text-vrerror">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="请输入活动名称"
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>

              {/* 活动类型 — 固定为条件触发 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">活动类型</label>
                <div className="inline-flex px-3 py-1.5 rounded-lg text-vr-body-sm border bg-vraccent-primary/10 border-vraccent-primary text-vraccent-primary">
                  条件触发
                </div>
              </div>

              {/* 时间范围 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">开始时间</label>
                  <input
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(e) => setForm((p) => ({ ...p, startAt: e.target.value }))}
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                  />
                </div>
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">结束时间</label>
                  <input
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(e) => setForm((p) => ({ ...p, endAt: e.target.value }))}
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                  />
                </div>
              </div>

              {/* 预算 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">预算（元）</label>
                <input
                  type="number"
                  min={0}
                  value={form.budget}
                  onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
                  placeholder="请输入预算金额"
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>

              {/* ────────── 条件触发：触发规则配置 ────────── */}
                <>
                  {/* 触发事件 */}
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      触发事件 <span className="text-vrerror">*</span>
                    </label>
                    <select
                      value={form.triggerEvent}
                      onChange={(e) => setEvent(e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
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
                      checked={form.triggerRunOnce}
                      onChange={(e) => setForm((p) => ({ ...p, triggerRunOnce: e.target.checked }))}
                      className="w-4 h-4 accent-vraccent-primary rounded border-vrborder-subtle"
                    />
                    <label htmlFor="runOnce" className="text-vr-body-sm text-vrtext-primary cursor-pointer select-none">
                      每个用户仅执行一次
                    </label>
                  </div>

                  {/* 触发条件 */}
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">触发条件</label>
                    <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg p-4 space-y-3">
                      {form.triggerEvent === 'USER_REGISTERED' && (
                        <p className="text-vr-body-sm text-vrtext-muted">用户注册时自动触发，无需额外条件</p>
                      )}

                      {form.triggerEvent === 'ORDER_COMPLETED' && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-vr-caption text-vrtext-tertiary mb-1">最小订单金额（分）</label>
                              <input
                                type="number"
                                value={form.triggerConditionMinAmount}
                                onChange={(e) => setForm((p) => ({ ...p, triggerConditionMinAmount: e.target.value }))}
                                placeholder="不限"
                                className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                              />
                            </div>
                            <div>
                              <label className="block text-vr-caption text-vrtext-tertiary mb-1">最大订单金额（分）</label>
                              <input
                                type="number"
                                value={form.triggerConditionMaxAmount}
                                onChange={(e) => setForm((p) => ({ ...p, triggerConditionMaxAmount: e.target.value }))}
                                placeholder="不限"
                                className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                              />
                            </div>
                          </div>
                          <p className="text-vr-caption text-vrtext-muted">留空表示不限制金额范围</p>
                        </>
                      )}

                      {form.triggerEvent === 'DORMANT_DETECTED' && (
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">沉默天数 <span className="text-vrerror">*</span></label>
                          <input
                            type="number"
                            value={form.triggerConditionDormantDays}
                            onChange={(e) => setForm((p) => ({ ...p, triggerConditionDormantDays: e.target.value }))}
                            placeholder="如 30 表示30天未消费"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                          />
                        </div>
                      )}

                      {form.triggerEvent === 'BIRTHDAY' && (
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">提前天数 <span className="text-vrerror">*</span></label>
                          <input
                            type="number"
                            value={form.triggerConditionBirthdayAdvanceDays}
                            onChange={(e) => setForm((p) => ({ ...p, triggerConditionBirthdayAdvanceDays: e.target.value }))}
                            placeholder="如 7 表示生日前7天触发"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 执行动作 */}
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      执行动作 <span className="text-vrerror">*</span>
                    </label>
                    <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg p-4 space-y-3">
                      {/* 动作类型 */}
                      <div className="flex gap-2">
                        {[
                          { key: 'GIFT_POINTS', label: '赠送积分' },
                          { key: 'GIFT_COUPON', label: '赠送优惠券' },
                          { key: 'GIFT_EXPERIENCE_COUPON', label: '赠送体验券' },
                        ].map((t) => (
                          <button
                            key={t.key}
                            onClick={() => setForm((p) => ({ ...p, triggerActionType: t.key as any }))}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-vr-body-sm border transition-colors',
                              form.triggerActionType === t.key
                                ? 'bg-vraccent-primary/10 border-vraccent-primary text-vraccent-primary'
                                : 'bg-vrbg-card border-vrborder-subtle text-vrtext-secondary hover:border-vrborder-hover'
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* 赠送积分参数 */}
                      {form.triggerActionType === 'GIFT_POINTS' && (
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">
                            积分数 <span className="text-vrerror">*</span>
                          </label>
                          <input
                            type="number"
                            value={form.triggerActionPoints}
                            onChange={(e) => setForm((p) => ({ ...p, triggerActionPoints: e.target.value }))}
                            placeholder="如 100"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                          />
                        </div>
                      )}

                      {/* 赠送优惠券参数 */}
                      {form.triggerActionType === 'GIFT_COUPON' && (
                        <div className="space-y-6">
                          <div className="rounded-lg bg-vrbg-card p-5">
                            <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
                              <label className="flex items-center gap-4">
                                <span className="w-24 shrink-0 text-right text-vr-body-sm text-vrtext-primary">优惠券名称:</span>
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={form.triggerActionCouponName}
                                    maxLength={18}
                                    onChange={(e) => setForm((p) => ({ ...p, triggerActionCouponName: e.target.value }))}
                                    placeholder="请输入优惠券名称"
                                    className="h-11 w-[280px] rounded-md border border-vrborder-subtle bg-vrbg-card px-5 pr-14 text-vr-body-sm text-vrtext-primary outline-none placeholder:text-vrtext-muted focus:border-vraccent-primary"
                                  />
                                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-vr-body-sm text-vrtext-muted">
                                    {form.triggerActionCouponName.length}/18
                                  </span>
                                </div>
                              </label>
                              <CouponSelect label="优惠券类型" options={['通用券', '品类券', '商品券']} />
                              <CouponSelect label="是否有效" options={['开启', '关闭']} />
                              <CouponSelect label="发放方式" options={['用户领取', '系统赠送']} />
                              <button
                                type="button"
                                className="h-11 rounded-md bg-vraccent-primary px-6 text-vr-body-sm font-medium text-white transition-colors hover:bg-vraccent-primary-hover"
                              >
                                查询
                              </button>
                            </div>
                          </div>

                          <div className="rounded-lg bg-vrbg-card p-5">
                            <button
                              type="button"
                              className="mb-5 h-10 rounded-md bg-vraccent-primary px-5 text-vr-body-sm font-medium text-white transition-colors hover:bg-vraccent-primary-hover"
                            >
                              添加优惠券
                            </button>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[980px] text-vr-body-sm">
                                <thead>
                                  <tr className="bg-[#dfeaff] text-vrtext-secondary">
                                    {['ID', '优惠券名称', '优惠券类型', '面值', '领取方式', '领取日期', '使用时间', '发布数量', '是否开启', '操作'].map((head) => (
                                      <th key={head} className="px-4 py-3 text-left font-medium">{head}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="border-b border-vrborder-subtle">
                                    <td className="px-4 py-4 text-vrtext-primary">-</td>
                                    <td className="px-4 py-4 text-vrtext-primary">{form.triggerActionCouponName || '新优惠券'}</td>
                                    <td className="px-4 py-4 text-vrtext-primary">
                                      {{ GENERAL: '通用券', CATEGORY: '品类券', PRODUCT: '商品券' }[form.couponCategory]}
                                    </td>
                                    <td className="px-4 py-4 text-vrtext-primary">{form.triggerActionCouponDiscountRate || '0'}</td>
                                    <td className="px-4 py-4 text-vrtext-primary">
                                      {form.couponDeliveryMode === 'CLAIM' ? '用户领取' : '系统赠送'}
                                    </td>
                                    <td className="px-4 py-4 text-vrtext-primary">
                                      {form.couponClaimTimeMode === 'UNLIMITED' ? '不限时' : '限时'}
                                    </td>
                                    <td className="px-4 py-4 text-vrtext-primary">
                                      {form.couponValidityMode === 'DAYS' ? `${form.triggerActionCouponValidDays || 0}天` : '时间段'}
                                    </td>
                                    <td className="px-4 py-4 text-vrtext-primary">
                                      {form.couponQuantityMode === 'UNLIMITED' ? '不限量' : (form.couponPublishQuantity || '0')}
                                    </td>
                                    <td className="px-4 py-4">
                                      <button
                                        type="button"
                                        onClick={() => setForm((p) => ({ ...p, couponEnabled: !p.couponEnabled }))}
                                        className={cn(
                                          'relative h-7 w-12 rounded-full transition-colors',
                                          form.couponEnabled ? 'bg-vraccent-primary' : 'bg-vrborder-subtle'
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            'absolute top-1 h-5 w-5 rounded-full bg-white transition-all',
                                            form.couponEnabled ? 'left-6' : 'left-1'
                                          )}
                                        />
                                      </button>
                                    </td>
                                    <td className="px-4 py-4 text-vraccent-primary">
                                      <span className="cursor-default">领取记录</span>
                                      <span className="mx-2 text-vrborder-subtle">|</span>
                                      <span className="cursor-default">编辑</span>
                                      <span className="mx-2 text-vrborder-subtle">|</span>
                                      <span className="cursor-default">复制</span>
                                      <span className="mx-2 text-vrborder-subtle">|</span>
                                      <span className="cursor-default">删除</span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="rounded-lg bg-vrbg-card px-5 py-7">
                            <div className="mx-auto max-w-3xl space-y-6">
                              <CouponInput
                                label="优惠券名称"
                                value={form.triggerActionCouponName}
                                maxLength={18}
                                placeholder="请输入优惠券名称"
                                onChange={(value) => setForm((p) => ({ ...p, triggerActionCouponName: value }))}
                              />
                              <CouponInput
                                label="优惠券面值"
                                type="number"
                                suffix="元"
                                value={form.triggerActionCouponDiscountRate}
                                onChange={(value) => setForm((p) => ({ ...p, triggerActionCouponDiscountRate: value }))}
                              />
                              <CouponRadioRow
                                label="用户类型"
                                value={form.couponUserType}
                                onChange={(value) => setForm((p) => ({ ...p, couponUserType: value as 'NORMAL' | 'PAID' }))}
                                options={[
                                  { value: 'NORMAL', label: '普通用户' },
                                  { value: 'PAID', label: '付费会员用户' },
                                ]}
                                help={(
                                  <>
                                    <div>普通用户：所有用户都能获取到的优惠券；</div>
                                    <div>付费会员用户：仅付费会员才能领取的优惠券；</div>
                                  </>
                                )}
                              />
                              <CouponRadioRow
                                label="发送方式"
                                value={form.couponDeliveryMode}
                                onChange={(value) => setForm((p) => ({ ...p, couponDeliveryMode: value as 'CLAIM' | 'SYSTEM' }))}
                                options={[
                                  { value: 'CLAIM', label: '用户领取' },
                                  { value: 'SYSTEM', label: '系统赠送' },
                                ]}
                                help={(
                                  <>
                                    <div>用户领取：用户需要手动领取优惠券；</div>
                                    <div>系统赠送：1.后台发放指定用户。 2.添加到商品里面用户购买该商品获得。 3.设置新人礼页面新用户注册赠送优惠券；</div>
                                  </>
                                )}
                              />
                              <CouponRadioRow
                                label="优惠券类型"
                                value={form.couponCategory}
                                onChange={(value) => setForm((p) => ({ ...p, couponCategory: value as 'GENERAL' | 'CATEGORY' | 'PRODUCT' }))}
                                options={[
                                  { value: 'GENERAL', label: '通用券' },
                                  { value: 'CATEGORY', label: '品类券' },
                                  { value: 'PRODUCT', label: '商品券' },
                                ]}
                              />
                              <CouponRadioRow
                                label="使用门槛"
                                value={form.couponThresholdMode}
                                onChange={(value) => setForm((p) => ({ ...p, couponThresholdMode: value as 'NONE' | 'THRESHOLD' }))}
                                options={[
                                  { value: 'NONE', label: '无门槛' },
                                  { value: 'THRESHOLD', label: '有门槛' },
                                ]}
                              />
                              <CouponRadioRow
                                label="有效期"
                                value={form.couponValidityMode}
                                onChange={(value) => setForm((p) => ({ ...p, couponValidityMode: value as 'DAYS' | 'RANGE' }))}
                                options={[
                                  { value: 'DAYS', label: '天数' },
                                  { value: 'RANGE', label: '时间段' },
                                ]}
                              />
                              {form.couponValidityMode === 'DAYS' ? (
                                <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
                                  <span />
                                  <div>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min={0}
                                        value={form.triggerActionCouponValidDays}
                                        onChange={(e) => setForm((p) => ({ ...p, triggerActionCouponValidDays: e.target.value }))}
                                        className="h-11 w-full rounded-md border border-vrborder-subtle bg-vrbg-card px-5 pr-12 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                                      />
                                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-vr-body-sm text-vrtext-secondary">天</span>
                                    </div>
                                    <p className="mt-2 text-vr-body-sm text-vrtext-tertiary">领取后多少天内有效</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
                                  <span />
                                  <div className="grid grid-cols-2 gap-3">
                                    <input type="date" value={form.couponValidStart} onChange={(e) => setForm((p) => ({ ...p, couponValidStart: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-vrbg-card px-4 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary" />
                                    <input type="date" value={form.couponValidEnd} onChange={(e) => setForm((p) => ({ ...p, couponValidEnd: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-vrbg-card px-4 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary" />
                                  </div>
                                </div>
                              )}
                              <CouponRadioRow
                                label="领取时间"
                                value={form.couponClaimTimeMode}
                                onChange={(value) => setForm((p) => ({ ...p, couponClaimTimeMode: value as 'LIMITED' | 'UNLIMITED' }))}
                                options={[
                                  { value: 'LIMITED', label: '限时' },
                                  { value: 'UNLIMITED', label: '不限时' },
                                ]}
                              />
                              <CouponRadioRow
                                label="优惠券发布数量"
                                value={form.couponQuantityMode}
                                onChange={(value) => setForm((p) => ({ ...p, couponQuantityMode: value as 'LIMITED' | 'UNLIMITED' }))}
                                options={[
                                  { value: 'LIMITED', label: '限量' },
                                  { value: 'UNLIMITED', label: '不限量' },
                                ]}
                              />
                              {form.couponQuantityMode === 'LIMITED' && (
                                <CouponInput
                                  label="发布数量"
                                  type="number"
                                  value={form.couponPublishQuantity}
                                  onChange={(value) => setForm((p) => ({ ...p, couponPublishQuantity: value }))}
                                />
                              )}
                              <CouponInput
                                label="用户领取数量"
                                type="number"
                                suffix="张"
                                value={form.couponPerUserLimit}
                                onChange={(value) => setForm((p) => ({ ...p, couponPerUserLimit: value }))}
                              />
                              <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
                                <span />
                                <p className="-mt-4 text-vr-body-sm text-vrtext-tertiary">填写每个用户可以领取多少张</p>
                              </div>
                              <CouponRadioRow
                                label="状态"
                                value={form.couponEnabled ? 'ENABLED' : 'DISABLED'}
                                onChange={(value) => setForm((p) => ({ ...p, couponEnabled: value === 'ENABLED' }))}
                                options={[
                                  { value: 'ENABLED', label: '开启' },
                                  { value: 'DISABLED', label: '关闭' },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 赠送体验券参数 */}
                      {form.triggerActionType === 'GIFT_EXPERIENCE_COUPON' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-vr-caption text-vrtext-tertiary mb-1">
                              券名称 <span className="text-vrerror">*</span>
                            </label>
                            <input
                              type="text"
                              value={form.triggerActionCouponName}
                              onChange={(e) => setForm((p) => ({ ...p, triggerActionCouponName: e.target.value }))}
                              placeholder="请输入券名称"
                              className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-vr-caption text-vrtext-tertiary mb-1">有效期（天）</label>
                            <input
                              type="number"
                              min={1}
                              value={form.triggerActionCouponValidDays}
                              onChange={(e) => setForm((p) => ({ ...p, triggerActionCouponValidDays: e.target.value }))}
                              placeholder="留空表示永久"
                              className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 发放上限 */}
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      发放上限 <span className="text-vrerror">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.triggerMaxQuantity}
                      onChange={(e) => setForm((p) => ({ ...p, triggerMaxQuantity: e.target.value }))}
                      placeholder="总发放数量上限"
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                    />
                  </div>

                  {/* ────────── 高级设置 ────────── */}
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">高级设置</label>
                    <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg p-4 space-y-3">
                      {/* 目标人群 */}
                      <div>
                        <label className="block text-vr-caption text-vrtext-tertiary mb-2">目标人群（可多选）</label>
                        <div className="flex flex-wrap gap-2">
                          {TAG_OPTIONS.map((tag) => {
                            const selected = form.targetTags.includes(tag.key)
                            return (
                              <button
                                key={tag.key}
                                type="button"
                                onClick={() =>
                                  setForm((p) => ({
                                    ...p,
                                    targetTags: selected
                                      ? p.targetTags.filter((k) => k !== tag.key)
                                      : [...p.targetTags, tag.key],
                                  }))
                                }
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all border',
                                  selected
                                    ? 'bg-vraccent-primary/15 border-vraccent-primary/40 text-vraccent-primary'
                                    : 'bg-vrbg-card border-vrborder-subtle text-vrtext-muted hover:border-vrborder-hover hover:text-vrtext-secondary'
                                )}
                              >
                                {tag.label}
                              </button>
                            )
                          })}
                        </div>
                        {form.targetTags.length === 0 && (
                          <p className="text-[10px] text-vrtext-muted mt-1.5">不选 = 全部用户</p>
                        )}
                      </div>
                      {/* 排除人群 */}
                      <div>
                        <label className="block text-vr-caption text-vrtext-tertiary mb-2">排除人群（可多选）</label>
                        <div className="flex flex-wrap gap-2">
                          {TAG_OPTIONS.map((tag) => {
                            const selected = form.excludeTags.includes(tag.key)
                            return (
                              <button
                                key={tag.key}
                                type="button"
                                onClick={() =>
                                  setForm((p) => ({
                                    ...p,
                                    excludeTags: selected
                                      ? p.excludeTags.filter((k) => k !== tag.key)
                                      : [...p.excludeTags, tag.key],
                                  }))
                                }
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all border',
                                  selected
                                    ? 'bg-vrerror/15 border-vrerror/40 text-vrerror'
                                    : 'bg-vrbg-card border-vrborder-subtle text-vrtext-muted hover:border-vrborder-hover hover:text-vrtext-secondary'
                                )}
                              >
                                {tag.label}
                              </button>
                            )
                          })}
                        </div>
                        {form.excludeTags.length === 0 && (
                          <p className="text-[10px] text-vrtext-muted mt-1.5">不选 = 不排除</p>
                        )}
                      </div>
                      {/* 渠道 + 优先级 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">渠道</label>
                          <select
                            value={form.channel}
                            onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                          >
                            <option value="">全部渠道</option>
                            <option value="wechat">微信</option>
                            <option value="app">App</option>
                            <option value="offline">线下</option>
                            <option value="sms">短信</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-vr-caption text-vrtext-tertiary mb-1">优先级</label>
                          <input
                            type="number"
                            value={form.priority}
                            onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                            placeholder="0"
                            className="w-full h-9 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                          />
                        </div>
                      </div>
                      {/* 自动策略 */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            id="autoPause"
                            type="checkbox"
                            checked={form.autoPauseOnBudgetExhausted}
                            onChange={(e) => setForm((p) => ({ ...p, autoPauseOnBudgetExhausted: e.target.checked }))}
                            className="w-4 h-4 accent-vraccent-primary rounded border-vrborder-subtle"
                          />
                          <label htmlFor="autoPause" className="text-vr-body-sm text-vrtext-primary cursor-pointer select-none">预算耗尽自动暂停</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="autoEnd"
                            type="checkbox"
                            checked={form.autoEndOnExpire}
                            onChange={(e) => setForm((p) => ({ ...p, autoEndOnExpire: e.target.checked }))}
                            className="w-4 h-4 accent-vraccent-primary rounded border-vrborder-subtle"
                          />
                          <label htmlFor="autoEnd" className="text-vr-body-sm text-vrtext-primary cursor-pointer select-none">到期自动结束</label>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-subtle">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={createMut.isPending}
                className="px-4 py-2 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
              >
                {createMut.isPending ? '创建中...' : '立即创建'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ─── Campaign Effects Panel ─── */
function CampaignEffectsPanel({ campaignId }: { campaignId: string }) {
  const { data } = useQuery({
    queryKey: ['campaign-effects', campaignId],
    queryFn: () => getCampaignEffects(campaignId, { days: 30 }),
    enabled: !!campaignId,
  })

  const effects = data || {}
  const funnel = effects.funnel || {}

  const metricCards = [
    { label: '总触发', value: funnel.totalTriggered || 0, color: 'text-vrtext-primary' },
    { label: '发放成功', value: funnel.totalSuccess || 0, color: 'text-vrsuccess' },
    { label: '已使用', value: funnel.totalUsed || 0, color: 'text-vraccent-primary' },
    { label: '产生订单', value: funnel.totalConverted || 0, color: 'text-vrwarning' },
  ]

  const formatRate = (v?: number) => v !== undefined ? `${(v * 100).toFixed(0)}%` : '-'

  return (
    <div className="space-y-4">
      {/* 关键指标卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {metricCards.map((card) => (
          <div key={card.label} className="bg-vrbg-elevated rounded-lg p-3 text-center">
            <div className={`text-vr-h3 font-bold ${card.color}`}>{card.value}</div>
            <div className="text-vr-caption text-vrtext-muted mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* 转化漏斗 */}
      <div className="bg-vrbg-elevated rounded-xl p-5 space-y-4">
        <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">转化漏斗</h4>
        <div className="space-y-3">
          {[
            { label: '触发', value: funnel.totalTriggered, rate: 1 },
            { label: '发放成功', value: funnel.totalSuccess, rate: funnel.successRate },
            { label: '已使用', value: funnel.totalUsed, rate: funnel.useRate },
            { label: '产生订单', value: funnel.totalConverted, rate: funnel.conversionRate },
          ].map((step, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-vr-body-sm text-vrtext-primary">{step.label}</span>
                <span className="text-vr-body-sm text-vrtext-secondary">
                  {step.value || 0} {step.rate !== undefined && step.rate !== 1 ? `(${formatRate(step.rate)})` : ''}
                </span>
              </div>
              <div className="h-2 bg-vrbg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-vraccent-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, (step.rate || 0) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GMV 与 ROI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-vrbg-elevated rounded-lg p-4 text-center">
          <div className="text-vr-caption text-vrtext-muted">GMV贡献</div>
          <div className="text-vr-body font-bold text-vrtext-primary mt-1">¥{((effects.gmv || 0) / 100).toFixed(2)}</div>
        </div>
        <div className="bg-vrbg-elevated rounded-lg p-4 text-center">
          <div className="text-vr-caption text-vrtext-muted">总成本</div>
          <div className="text-vr-body font-bold text-vrerror mt-1">¥{((effects.cost || 0) / 100).toFixed(2)}</div>
        </div>
        <div className="bg-vrbg-elevated rounded-lg p-4 text-center">
          <div className="text-vr-caption text-vrtext-muted">ROI</div>
          <div className={`text-vr-body font-bold mt-1 ${(effects.roi || 0) >= 0 ? 'text-vrsuccess' : 'text-vrerror'}`}>
            {effects.roi !== undefined ? `${effects.roi >= 0 ? '+' : ''}${(effects.roi * 100).toFixed(0)}%` : '-'}
          </div>
        </div>
      </div>

      {/* 跳过分层 */}
      {effects.skipReasons && effects.skipReasons.length > 0 && (
        <div className="bg-vrbg-elevated rounded-xl p-5 space-y-3">
          <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">跳过分层</h4>
          <div className="space-y-2">
            {effects.skipReasons.map((s: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between py-1.5 px-3 bg-vrbg-surface rounded-lg">
                <span className="text-vr-body-sm text-vrtext-primary">{s.reason || '未知'}</span>
                <span className="text-vr-body-sm text-vrtext-muted">{s.count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Campaign Track List ─── */
function CampaignTrackList({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1)
  const pageSize = 10
  const { data } = useQuery({
    queryKey: ['campaign-tracks', campaignId, page],
    queryFn: () => getCampaignLogs(campaignId, { page, pageSize }),
    enabled: !!campaignId,
  })

  const tracks = data?.data || []
  const total = data?.meta?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const stepLabel: Record<string, string> = {
    ISSUED: '已发放',
    USED: '已使用',
    ORDER_COMPLETED: '订单完成',
    REORDERED: '已复购',
  }

  return (
    <div className="space-y-4">
      {tracks.length === 0 ? (
        <div className="text-center py-8 text-vr-caption text-vrtext-muted">
          暂无发放记录
        </div>
      ) : (
        <div className="space-y-2">
          {tracks.map((t: any) => (
            <div
              key={t.id}
              className="flex items-center justify-between py-2.5 px-3 bg-vrbg-elevated rounded-lg"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-vr-body-sm text-vrtext-primary font-medium">
                  {t.user?.name || '-'} <span className="text-vr-caption text-vrtext-muted font-normal">{t.user?.phone || ''}</span>
                </span>
                <span className="text-vr-caption text-vrtext-muted">
                  {stepLabel[t.step] || t.step}
                  {t.rewardType && (
                    <span className="ml-2 text-vr-accent-primary">
                      {t.rewardType === 'POINTS' ? '积分' : (t.rewardCouponName || t.rewardType)}
                      {t.rewardType === 'POINTS' && t.rewardValue ? ` ${t.rewardValue}积分` : ''}
                      {t.rewardType !== 'POINTS' && t.rewardValue ? ` ¥${(t.rewardValue / 100).toFixed(2)}` : ''}
                    </span>
                  )}
                </span>
              </div>
              <span className="text-vr-caption text-vrtext-muted">
                {formatDateTime(t.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-7 h-7 flex items-center justify-center rounded border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 text-xs"
          >
            &lt;
          </button>
          <span className="text-vr-caption text-vrtext-muted px-2">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-7 h-7 flex items-center justify-center rounded border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 text-xs"
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Edit Modal ─── */
function EditCampaignModal({
  open,
  onClose,
  campaign,
  onSubmit,
  isPending,
}: {
  open: boolean
  onClose: () => void
  campaign: Campaign
  onSubmit: (id: string, data: any) => void
  isPending: boolean
}) {
  const { data: games = [] } = useQuery({
    queryKey: ['games', 'ACTIVE', 'campaign-coupon-edit-modal'],
    queryFn: () => getGames({ status: 'ACTIVE' }),
    enabled: open,
  })
  const { data: editVenueResponse } = useQuery({
    queryKey: ['venues', 'selectable', 'campaign-coupon-edit-modal'],
    queryFn: () => getVenues({ pageSize: 100 }),
    enabled: open,
  })
  const editVenues: Venue[] = selectableVenuesFromResponse(editVenueResponse)
  const [form, setForm] = useState({
    name: '',
    startAt: '',
    endAt: '',
    budget: '',
    triggerEvent: 'USER_REGISTERED',
    triggerRunOnce: true,
    rewardKind: 'COUPON' as 'COUPON' | 'POINTS' | 'EXPERIENCE',
    pointsAmount: '100',
    couponName: '',
    couponDiscountRate: '80',
    validFrom: '',
    validTo: '',
    couponThresholdMode: 'NONE' as 'NONE' | 'THRESHOLD',
    eligibility: emptyEligibility(),
    experienceGameId: '',
    couponClaimTimeMode: 'UNLIMITED' as 'LIMITED' | 'UNLIMITED',
    couponQuantityMode: 'UNLIMITED' as 'LIMITED' | 'UNLIMITED',
    couponPublishQuantity: '',
    targetTags: [] as string[],
    excludeTags: [] as string[],
    priority: '0',
    channel: '',
    autoPauseOnBudgetExhausted: true,
    autoEndOnExpire: true,
  })

  useEffect(() => {
    if (!open || !campaign) return
    const rule = campaign.triggerRule
    const action = rule?.actions?.[0] || { type: 'GIFT_POINTS', points: 100 }
    const reward = campaign.rewards?.[0]
    const rewardKind =
      reward?.rewardType === 'POINTS' || action.type === 'GIFT_POINTS'
        ? 'POINTS'
        : reward?.rewardType === 'EXPERIENCE_COUPON' || action.type === 'GIFT_EXPERIENCE_COUPON' || action.couponType === 'EXPERIENCE'
          ? 'EXPERIENCE'
          : 'COUPON'
    const eligibility = eligibilityFromReward(reward, action)
    const maxQuantity = reward?.maxQuantity || 999999
    const applicableGames = reward?.applicableGames || action.applicableGames || []
    setForm({
      name: campaign.name || '',
      startAt: campaign.startAt ? new Date(campaign.startAt).toISOString().slice(0, 16) : '',
      endAt: campaign.endAt ? new Date(campaign.endAt).toISOString().slice(0, 16) : '',
      budget: campaign.budget ? String(campaign.budget / 100) : '',
      triggerEvent: rule?.event || 'USER_REGISTERED',
      triggerRunOnce: rule?.runOnce ?? true,
      rewardKind,
      pointsAmount: (reward?.pointsAmount || action.points || 100).toString(),
      couponName: reward?.couponName || action.name || campaign.name || '',
      couponDiscountRate: (reward?.couponDiscountRate || action.discountRate || 80).toString(),
      validFrom: reward?.validFrom ? new Date(reward.validFrom).toISOString().slice(0, 16) : action.validFrom ? new Date(action.validFrom).toISOString().slice(0, 16) : '',
      validTo: reward?.validTo ? new Date(reward.validTo).toISOString().slice(0, 16) : action.validTo ? new Date(action.validTo).toISOString().slice(0, 16) : '',
      couponThresholdMode: eligibility.conditions.length > 0 ? 'THRESHOLD' : 'NONE',
      eligibility,
      experienceGameId: applicableGames[0] || '',
      couponClaimTimeMode: campaign.startAt || campaign.endAt ? 'LIMITED' : 'UNLIMITED',
      couponQuantityMode: maxQuantity >= 999999 ? 'UNLIMITED' : 'LIMITED',
      couponPublishQuantity: maxQuantity >= 999999 ? '' : maxQuantity.toString(),
      targetTags: campaign.targetTags || [],
      excludeTags: campaign.excludeTags || [],
      priority: campaign.priority?.toString() || '0',
      channel: campaign.channel || '',
      autoPauseOnBudgetExhausted: campaign.autoPauseOnBudgetExhausted !== false,
      autoEndOnExpire: campaign.autoEndOnExpire !== false,
    })
  }, [open, campaign?.id])

  const handleSubmit = () => {
    if (!form.name.trim()) {
      alert('请输入活动名称')
      return
    }

    const eligibility = form.couponThresholdMode === 'THRESHOLD' ? eligibilityAction(form.eligibility) : eligibilityAction(emptyEligibility())
    const thresholdError = form.couponThresholdMode === 'THRESHOLD' ? eligibilityError(form.eligibility) : null
    if (thresholdError) {
      alert(thresholdError)
      return
    }
    if (form.couponThresholdMode === 'THRESHOLD' && form.triggerEvent !== 'ORDER_COMPLETED') {
      alert('使用门槛仅适用于订单完成触发场景')
      return
    }

    const pointsAmount = Number(form.pointsAmount)
    const discountRate = Number(form.couponDiscountRate)
    if (form.rewardKind === 'POINTS' && (!Number.isInteger(pointsAmount) || pointsAmount < 1)) {
      alert('请输入有效的积分数量')
      return
    }
    if (form.rewardKind === 'COUPON' && (!Number.isInteger(discountRate) || discountRate < 1 || discountRate > 99)) {
      alert('请输入有效的折扣率（1-99）')
      return
    }
    if (!form.validFrom || !form.validTo || new Date(form.validFrom) >= new Date(form.validTo)) {
      alert('请选择有效的奖励生效和失效时间')
      return
    }
    if (form.rewardKind === 'EXPERIENCE' && !form.experienceGameId) {
      alert('请选择体验券关联的游戏')
      return
    }

    const maxQuantity = form.couponQuantityMode === 'LIMITED' ? Number(form.couponPublishQuantity) : 999999
    if (!Number.isInteger(maxQuantity) || maxQuantity < 1) {
      alert('请输入有效的发布数量')
      return
    }
    const action =
      form.rewardKind === 'POINTS'
        ? { type: 'GIFT_POINTS', points: pointsAmount, validFrom: form.validFrom, validTo: form.validTo, ...eligibility }
        : form.rewardKind === 'EXPERIENCE'
          ? {
              type: 'GIFT_EXPERIENCE_COUPON',
              name: form.couponName.trim() || form.name.trim(),
              validFrom: form.validFrom,
              validTo: form.validTo,
              ...eligibility,
              applicableGames: eligibility.applicableGames.length ? eligibility.applicableGames : [form.experienceGameId],
            }
          : {
              type: 'GIFT_COUPON',
              name: form.couponName.trim() || form.name.trim(),
              discountRate,
              validFrom: form.validFrom,
              validTo: form.validTo,
              ...eligibility,
            }

    onSubmit(campaign.id, {
      name: form.name.trim(),
      startAt: form.couponClaimTimeMode === 'LIMITED' ? form.startAt || undefined : undefined,
      endAt: form.couponClaimTimeMode === 'LIMITED' ? form.endAt || undefined : undefined,
      budget: form.budget ? Number(form.budget) * 100 : undefined,
      triggerRule: {
        event: form.triggerEvent,
        conditions: {},
        actions: [action],
        runOnce: form.triggerRunOnce,
        maxQuantity,
      },
      targetTags: form.targetTags || [],
      excludeTags: form.excludeTags || [],
      priority: form.priority ? parseInt(form.priority) : 0,
      channel: form.channel || undefined,
      autoPauseOnBudgetExhausted: form.autoPauseOnBudgetExhausted,
      autoEndOnExpire: form.autoEndOnExpire,
    })
  }

  const setEvent = (event: string) => {
    setForm((p) => event === 'ORDER_COMPLETED'
      ? { ...p, triggerEvent: event }
      : { ...p, triggerEvent: event, couponThresholdMode: 'NONE', eligibility: emptyEligibility() })
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
            className="bg-vrbg-card rounded-xl border border-vrborder-subtle shadow-xl w-full max-w-[980px] mx-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-vrborder-subtle">
              <h3 className="text-vr-body font-semibold text-vrtext-primary">编辑活动</h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-vrbg-elevated transition-colors">
                <X className="w-4 h-4 text-vrtext-muted" />
              </button>
            </div>
            <div className="px-16 py-8 space-y-7">
              <CouponInput
                label="奖励名称"
                value={form.couponName}
                maxLength={18}
                placeholder="请输入奖励名称"
                onChange={(value) => setForm((p) => ({ ...p, name: value, couponName: value }))}
              />
              <CouponRadioRow
                label="用户类型"
                value={form.targetTags.includes('VIP') ? 'PAID' : form.excludeTags.includes('VIP') ? 'NORMAL' : 'ALL'}
                onChange={(value) => setForm((p) => ({ ...p, ...userScopeTags(value as 'ALL' | 'NORMAL' | 'PAID') }))}
                options={[
                  { value: 'ALL', label: '所有用户' },
                  { value: 'NORMAL', label: '普通用户' },
                  { value: 'PAID', label: '付费会员用户' },
                ]}
                help={(
                  <>
                    <div>所有用户：不限制用户等级；</div>
                    <div>普通用户：排除 VIP 用户；</div>
                    <div>付费会员用户：按现有用户标签限制到 VIP 用户。</div>
                  </>
                )}
              />
              <CouponRadioRow
                label="奖励类型"
                value={form.rewardKind}
                onChange={(value) => setForm((p) => ({ ...p, rewardKind: value as 'COUPON' | 'POINTS' | 'EXPERIENCE' }))}
                options={[
                  { value: 'COUPON', label: '优惠券' },
                  { value: 'POINTS', label: '积分' },
                  { value: 'EXPERIENCE', label: '体验券' },
                ]}
              />
              {form.rewardKind === 'COUPON' && (
                <CouponInput
                  label="折扣率"
                  type="number"
                  suffix="%"
                  value={form.couponDiscountRate}
                  onChange={(value) => setForm((p) => ({ ...p, couponDiscountRate: value }))}
                />
              )}
              {form.rewardKind === 'POINTS' && (
                <CouponInput
                  label="积分数量"
                  type="number"
                  value={form.pointsAmount}
                  onChange={(value) => setForm((p) => ({ ...p, pointsAmount: value }))}
                />
              )}
              {form.rewardKind === 'EXPERIENCE' && (
                <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 text-vr-body-sm">
                  <span className="text-right text-vrtext-primary">关联游戏:</span>
                  <select
                    value={form.experienceGameId}
                    onChange={(e) => setForm((p) => ({ ...p, experienceGameId: e.target.value }))}
                    className="h-11 w-full rounded-md border border-vrborder-subtle bg-white px-5 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                  >
                    <option value="">请选择游戏</option>
                    {games.map((game: Game) => (
                      <option key={game.id} value={game.id}>{game.title}</option>
                    ))}
                  </select>
                </div>
              )}
              <CouponRadioRow
                label="使用门槛"
                value={form.couponThresholdMode}
                onChange={(value) => setForm((p) => ({ ...p, couponThresholdMode: value as 'NONE' | 'THRESHOLD' }))}
                options={[
                  { value: 'NONE', label: '无门槛' },
                  { value: 'THRESHOLD', label: '有门槛' },
                ]}
              />
              {form.couponThresholdMode === 'THRESHOLD' && (
                <CampaignRewardEligibilityFields value={form.eligibility} venues={editVenues} games={games} onChange={(eligibility) => setForm((p) => ({ ...p, eligibility }))} />
              )}
              <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4"><span className="pt-3 text-right text-vr-body-sm text-vrtext-primary">奖励生效时间:</span><div className="grid grid-cols-2 gap-3"><input type="datetime-local" aria-label="奖励生效开始时间" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4" /><input type="datetime-local" aria-label="奖励生效结束时间" value={form.validTo} onChange={(e) => setForm((p) => ({ ...p, validTo: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4" /></div></div>
              <CouponRadioRow
                label="领取时间"
                value={form.couponClaimTimeMode}
                onChange={(value) => setForm((p) => ({ ...p, couponClaimTimeMode: value as 'LIMITED' | 'UNLIMITED' }))}
                options={[
                  { value: 'LIMITED', label: '限时' },
                  { value: 'UNLIMITED', label: '不限时' },
                ]}
              />
              {form.couponClaimTimeMode === 'LIMITED' && (
                <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
                  <span />
                  <div className="grid grid-cols-2 gap-4">
                    <input type="datetime-local" value={form.startAt} onChange={(e) => setForm((p) => ({ ...p, startAt: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary" />
                    <input type="datetime-local" value={form.endAt} onChange={(e) => setForm((p) => ({ ...p, endAt: e.target.value }))} className="h-11 rounded-md border border-vrborder-subtle bg-white px-4 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary" />
                  </div>
                </div>
              )}
              <CouponRadioRow
                label="触发场景"
                value={form.triggerEvent}
                onChange={setEvent}
                options={[
                  { value: 'USER_REGISTERED', label: '用户注册' },
                  { value: 'ORDER_COMPLETED', label: '订单完成' },
                  { value: 'DORMANT_DETECTED', label: '沉睡唤醒' },
                  { value: 'BIRTHDAY', label: '生日' },
                ]}
              />
              <CouponRadioRow
                label="发布数量"
                value={form.couponQuantityMode}
                onChange={(value) => setForm((p) => ({ ...p, couponQuantityMode: value as 'LIMITED' | 'UNLIMITED' }))}
                options={[
                  { value: 'LIMITED', label: '限量' },
                  { value: 'UNLIMITED', label: '不限量' },
                ]}
              />
              {form.couponQuantityMode === 'LIMITED' && (
                <CouponInput
                  label="发布数量"
                  type="number"
                  value={form.couponPublishQuantity}
                  onChange={(value) => setForm((p) => ({ ...p, couponPublishQuantity: value }))}
                />
              )}

            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-subtle">
              <button onClick={onClose} className="px-4 py-2 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors">取消</button>
              <button onClick={handleSubmit} disabled={isPending} className="px-4 py-2 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50">{isPending ? '保存中...' : '保存'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ─── Campaign Detail Sheet ─── */
function CampaignDetailSheet({
  campaign,
  open,
  onOpenChange,
  onPause,
  onActivate,
  onEnd,
  onEdit,
  pausePending,
  activatePending,
  endPending,
}: {
  campaign: Campaign | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onPause: (id: string) => void
  onActivate: (id: string) => void
  onEnd: (id: string) => void
  onEdit: (campaign: Campaign) => void
  pausePending: boolean
  activatePending: boolean
  endPending: boolean
}) {
  if (!campaign) return null

  const statusLower = campaign.status as CampaignStatus
  const cfg = statusConfig[statusLower]

  const reward = campaign.rewards?.[0]
  const [activeTab, setActiveTab] = useState<'info' | 'effects' | 'tracks'>('info')
  useEffect(() => {
    if (open) setActiveTab('info')
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px] gap-0">
        <SheetHeader className="p-6 border-b border-vrborder-subtle">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">活动详情</SheetTitle>
              <SheetDescription className="text-vr-caption text-vrtext-tertiary mt-1">
                活动ID: {campaign.id}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status */}
          <div className="flex items-center justify-center py-2">
            <span className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-vr-body-sm font-medium', cfg?.bg, cfg?.text)}>
              {cfg?.icon}
              {cfg?.label}
            </span>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 bg-vrbg-elevated rounded-lg p-1">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 h-8 rounded-md text-vr-caption font-medium transition-colors ${
                activeTab === 'info'
                  ? 'bg-vraccent-primary text-white'
                  : 'text-vrtext-secondary hover:text-vrtext-primary'
              }`}
            >
              基本信息
            </button>
            <button
              onClick={() => setActiveTab('effects')}
              className={`flex-1 h-8 rounded-md text-vr-caption font-medium transition-colors ${
                activeTab === 'effects'
                  ? 'bg-vraccent-primary text-white'
                  : 'text-vrtext-secondary hover:text-vrtext-primary'
              }`}
            >
              效果概览
            </button>
            <button
              onClick={() => setActiveTab('tracks')}
              className={`flex-1 h-8 rounded-md text-vr-caption font-medium transition-colors ${
                activeTab === 'tracks'
                  ? 'bg-vraccent-primary text-white'
                  : 'text-vrtext-secondary hover:text-vrtext-primary'
              }`}
            >
              发放记录
            </button>
          </div>

          {activeTab === 'info' && (
            <>
              {/* Info Card */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="bg-vrbg-elevated rounded-xl p-5 space-y-4"
              >
                <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">基本信息</h4>
                <div className="space-y-3">
                  {[
                    { label: '活动名称', value: campaign.name },
                    { label: '活动类型', value: typeLabelMap[campaign.type] || campaign.type },
                    { label: '开始时间', value: formatDateTime(campaign.startAt) },
                    { label: '结束时间', value: formatDateTime(campaign.endAt) },
                    { label: '预算', value: campaign.budget ? `¥${(campaign.budget / 100).toFixed(2)}` : '-' },
                    { label: '已消耗', value: `¥${(campaign.spent / 100).toFixed(2)}` },
                    { label: '创建人', value: campaign.createdBy },
                    { label: '创建时间', value: formatDateTime(campaign.createdAt) },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-vr-caption text-vrtext-tertiary">{item.label}</span>
                      <span className="text-vr-body-sm text-vrtext-primary">{item.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* 高级配置 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="bg-vrbg-elevated rounded-xl p-5 space-y-4"
              >
                <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">高级配置</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-vr-caption text-vrtext-tertiary">目标人群</span>
                    <span className="text-vr-body-sm text-vrtext-primary">
                      {campaign.targetTags?.length
                        ? campaign.targetTags.map((k) => TAG_OPTIONS.find((t) => t.key === k)?.label || k).join('、')
                        : '全部用户'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-vr-caption text-vrtext-tertiary">排除人群</span>
                    <span className="text-vr-body-sm text-vrtext-primary">
                      {campaign.excludeTags?.length
                        ? campaign.excludeTags.map((k) => TAG_OPTIONS.find((t) => t.key === k)?.label || k).join('、')
                        : '无'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-vr-caption text-vrtext-tertiary">渠道</span>
                    <span className="text-vr-body-sm text-vrtext-primary">{campaign.channel || '全部渠道'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-vr-caption text-vrtext-tertiary">优先级</span>
                    <span className="text-vr-body-sm text-vrtext-primary">{campaign.priority ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-vr-caption text-vrtext-tertiary">预算耗尽自动暂停</span>
                    <span className={cn('text-vr-body-sm', campaign.autoPauseOnBudgetExhausted ? 'text-vrsuccess' : 'text-vrtext-muted')}>
                      {campaign.autoPauseOnBudgetExhausted ? '已启用' : '已禁用'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-vr-caption text-vrtext-tertiary">到期自动结束</span>
                    <span className={cn('text-vr-body-sm', campaign.autoEndOnExpire ? 'text-vrsuccess' : 'text-vrtext-muted')}>
                      {campaign.autoEndOnExpire ? '已启用' : '已禁用'}
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* 权益配置 / 触发规则配置 */}
              {campaign.type === 'CONDITIONAL' && campaign.triggerRule ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="bg-vrbg-elevated rounded-xl p-5 space-y-4"
                >
                  <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">触发规则</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-vr-caption text-vrtext-tertiary">触发事件</span>
                      <span className="text-vr-body-sm text-vrtext-primary">{eventLabelMap[campaign.triggerRule.event] || campaign.triggerRule.event}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-vr-caption text-vrtext-tertiary">执行次数</span>
                      <span className="text-vr-body-sm text-vrtext-primary">{campaign.triggerRule.runOnce ? '每个用户仅一次' : '每次触发'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-vr-caption text-vrtext-tertiary">规则状态</span>
                      <span className={cn('text-vr-body-sm', campaign.triggerRule.enabled ? 'text-vrsuccess' : 'text-vrtext-muted')}>
                        {campaign.triggerRule.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    {/* 触发条件详情 */}
                    {campaign.triggerRule.conditions && Object.keys(campaign.triggerRule.conditions).length > 0 && (
                      <div className="pt-1">
                        <span className="text-vr-caption text-vrtext-tertiary">触发条件</span>
                        <div className="mt-1 text-vr-body-sm text-vrtext-primary">
                          {campaign.triggerRule.event === 'ORDER_COMPLETED' && (
                            <span>
                              订单金额
                              {campaign.triggerRule.conditions.minAmount ? ` ≥ ${campaign.triggerRule.conditions.minAmount}分` : ''}
                              {campaign.triggerRule.conditions.minAmount && campaign.triggerRule.conditions.maxAmount ? ' 且 ' : ''}
                              {campaign.triggerRule.conditions.maxAmount ? ` ≤ ${campaign.triggerRule.conditions.maxAmount}分` : ''}
                              {!campaign.triggerRule.conditions.minAmount && !campaign.triggerRule.conditions.maxAmount ? ' 无限制' : ''}
                            </span>
                          )}
                          {campaign.triggerRule.event === 'DORMANT_DETECTED' && (
                            <span>沉默 {campaign.triggerRule.conditions.dormantDays || '-'} 天</span>
                          )}
                          {campaign.triggerRule.event === 'BIRTHDAY' && (
                            <span>提前 {campaign.triggerRule.conditions.birthdayAdvanceDays || '-'} 天</span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* 执行动作详情 */}
                    {campaign.triggerRule.actions && campaign.triggerRule.actions.length > 0 && (
                      <div className="pt-1">
                        <span className="text-vr-caption text-vrtext-tertiary">执行动作</span>
                        <div className="mt-1 text-vr-body-sm text-vrtext-primary">
                          {campaign.triggerRule.actions[0].type === 'GIFT_POINTS' && (
                            <span>赠送 {campaign.triggerRule.actions[0].points || '-'} 积分</span>
                          )}
                          {campaign.triggerRule.actions[0].type === 'GIFT_COUPON' && (
                            <span>赠送「{campaign.triggerRule.actions[0].name || '优惠券'}」</span>
                          )}
                        </div>
                      </div>
                    )}
                    {reward && (
                      <>
                        <div className="border-t border-vrborder-subtle pt-3 mt-3" />
                        <div className="flex items-center justify-between">
                          <span className="text-vr-caption text-vrtext-tertiary">发放上限</span>
                          <span className="text-vr-body-sm text-vrtext-primary">{reward.maxQuantity}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-vr-caption text-vrtext-tertiary">已发放</span>
                          <span className="text-vr-body-sm text-vrtext-primary">{reward.issuedCount}</span>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : reward ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="bg-vrbg-elevated rounded-xl p-5 space-y-4"
                >
                  <h4 className="text-vr-body-sm text-vrtext-secondary font-medium">权益配置</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-vr-caption text-vrtext-tertiary">权益类型</span>
                      <span className="text-vr-body-sm text-vrtext-primary">{rewardTypeLabelMap[reward.rewardType] || reward.rewardType}</span>
                    </div>
                    {reward.rewardType === 'POINTS' && (
                      <div className="flex items-center justify-between">
                        <span className="text-vr-caption text-vrtext-tertiary">积分数</span>
                        <span className="text-vr-body-sm text-vrtext-primary">{reward.pointsAmount}</span>
                      </div>
                    )}
                    {reward.rewardType !== 'POINTS' && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-vr-caption text-vrtext-tertiary">券名称</span>
                          <span className="text-vr-body-sm text-vrtext-primary">{reward.couponName || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-vr-caption text-vrtext-tertiary">折扣率</span>
                          <span className="text-vr-body-sm text-vrtext-primary">
                            {reward.couponDiscountRate ? `${(reward.couponDiscountRate / 10).toFixed(reward.couponDiscountRate % 10 === 0 ? 0 : 1)}折` : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-vr-caption text-vrtext-tertiary">有效期</span>
                          <span className="text-vr-body-sm text-vrtext-primary">{reward.couponValidDays ? `${reward.couponValidDays}天` : '永久'}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-vr-caption text-vrtext-tertiary">发放上限</span>
                      <span className="text-vr-body-sm text-vrtext-primary">{reward.maxQuantity}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-vr-caption text-vrtext-tertiary">已发放</span>
                      <span className="text-vr-body-sm text-vrtext-primary">{reward.issuedCount}</span>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </>
          )}

          {activeTab === 'effects' && (
            <CampaignEffectsPanel campaignId={campaign.id} />
          )}

          {activeTab === 'tracks' && (
            <CampaignTrackList campaignId={campaign.id} />
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-6 border-t border-vrborder-subtle flex gap-3">
          {statusLower === 'RUNNING' && (
            <>
              <button
                onClick={() => onPause(campaign.id)}
                disabled={pausePending}
                className="flex-1 h-10 rounded-lg border border-vrwarning text-vrwarning text-vr-body-sm font-medium hover:bg-vrwarning/10 transition-colors disabled:opacity-50"
              >
                {pausePending ? '处理中...' : '暂停活动'}
              </button>
              <button
                onClick={() => onEnd(campaign.id)}
                disabled={endPending}
                className="flex-1 h-10 rounded-lg border border-vrtext-muted text-vrtext-muted text-vr-body-sm font-medium hover:bg-vrtext-muted/10 transition-colors disabled:opacity-50"
              >
                {endPending ? '处理中...' : '结束活动'}
              </button>
            </>
          )}
          {statusLower === 'PAUSED' && (
            <>
              <button
                onClick={() => onEdit(campaign)}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors"
              >
                编辑活动
              </button>
              <button
                onClick={() => onActivate(campaign.id)}
                disabled={activatePending}
                className="flex-1 h-10 rounded-lg bg-vrsuccess text-white text-vr-body-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50"
              >
                {activatePending ? '处理中...' : '激活活动'}
              </button>
              <button
                onClick={() => onEnd(campaign.id)}
                disabled={endPending}
                className="flex-1 h-10 rounded-lg border border-vrtext-muted text-vrtext-muted text-vr-body-sm font-medium hover:bg-vrtext-muted/10 transition-colors disabled:opacity-50"
              >
                {endPending ? '处理中...' : '结束活动'}
              </button>
            </>
          )}
          {statusLower === 'DRAFT' && (
            <button
              onClick={() => onActivate(campaign.id)}
              disabled={activatePending}
              className="w-full h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
            >
              {activatePending ? '处理中...' : '激活活动'}
            </button>
          )}
          {statusLower === 'ENDED' && (
            <button className="w-full h-10 rounded-lg bg-vrbg-elevated text-vrtext-muted text-vr-body-sm font-medium cursor-default">
              活动已结束
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

const rewardTypeLabelMap: Record<string, string> = {
  POINTS: '积分',
  DISCOUNT_COUPON: '折扣券',
  EXPERIENCE_COUPON: '体验券',
}

/* ─── Batch Reward Modal ─── */
const GIFT_REASON_OPTIONS = [
  { value: '会员回馈', label: '会员回馈' },
  { value: '活动补偿', label: '活动补偿' },
  { value: '生日福利', label: '生日福利' },
  { value: '新用户奖励', label: '新用户奖励' },
  { value: '邀请奖励', label: '邀请奖励' },
  { value: '客服补偿', label: '客服补偿' },
  { value: '节日活动', label: '节日活动' },
  { value: '其他', label: '其他' },
]

function BatchRewardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [rewardType, setRewardType] = useState<'POINTS' | 'COUPON'>('POINTS')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [pointsAmount, setPointsAmount] = useState('')
  const [pointsReason, setPointsReason] = useState('')
  const [pointsRemark, setPointsRemark] = useState('')
  const [couponType, setCouponType] = useState<'EXPERIENCE_FREE' | 'DISCOUNT'>('EXPERIENCE_FREE')
  const [couponName, setCouponName] = useState('')
  const [couponValidDays, setCouponValidDays] = useState('')
  const [couponDiscountRate, setCouponDiscountRate] = useState('')
  const [couponReason, setCouponReason] = useState('')
  const [couponRemark, setCouponRemark] = useState('')
  const [result, setResult] = useState<{ success: number; notFound: string[] } | null>(null)

  const { data: usersData } = useQuery({
    queryKey: ['all-users-batch-reward'],
    queryFn: () => getUsers({ pageSize: 9999 }),
    enabled: open,
  })

  const batchGiftPointsMut = useMutation({
    mutationFn: ({ userIds, points, reason, remark }: { userIds: string[]; points: number; reason: string; remark?: string }) =>
      batchGiftPoints(userIds, points, reason, remark),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const batchGiftCouponMut = useMutation({
    mutationFn: ({ userIds, data }: { userIds: string[]; data: Parameters<typeof batchGiftCoupon>[1] }) =>
      batchGiftCoupon(userIds, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const handleSubmit = async () => {
    const userIds = selectedUserIds
    if (userIds.length === 0) {
      alert('请至少选择一个用户')
      return
    }

    try {
      if (rewardType === 'POINTS') {
        const points = parseInt(pointsAmount)
        if (!points || points <= 0) {
          alert('请输入有效的积分数')
          return
        }
        if (!pointsReason.trim()) {
          alert('请输入赠送原因')
          return
        }
        await batchGiftPointsMut.mutateAsync({ userIds, points, reason: pointsReason.trim(), remark: pointsRemark || undefined })
        alert(`成功发放 ${points} 积分给 ${userIds.length} 人`)
        reset()
        onClose()
      } else {
        if (!couponName.trim()) {
          alert('请输入券名称')
          return
        }
        const validDays = parseInt(couponValidDays)
        if (!validDays || validDays <= 0) {
          alert('请输入有效的有效天数')
          return
        }
        if (couponType === 'DISCOUNT') {
          const rate = parseInt(couponDiscountRate)
          if (!rate || rate <= 0 || rate >= 100) {
            alert('请输入有效的折扣率（1-99）')
            return
          }
        }
        if (!couponReason.trim()) {
          alert('请输入赠送原因')
          return
        }
        await batchGiftCouponMut.mutateAsync({
          userIds,
          data: {
            name: couponName.trim(),
            type: couponType,
            validDays,
            discountRate: couponType === 'DISCOUNT' ? parseInt(couponDiscountRate) : undefined,
            giftReason: couponReason || undefined,
            giftRemark: couponRemark || undefined,
          },
        })
        alert(`成功发放优惠券给 ${userIds.length} 人`)
        reset()
        onClose()
      }
    } catch (error: any) {
      alert('发放失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    }
  }

  const isPending = batchGiftPointsMut.isPending || batchGiftCouponMut.isPending

  const reset = () => {
    setSelectedUserIds([])
    setPointsAmount('')
    setPointsReason('')
    setPointsRemark('')
    setCouponName('')
    setCouponValidDays('')
    setCouponDiscountRate('')
    setCouponReason('')
    setCouponRemark('')
    setResult(null)
    setRewardType('POINTS')
    setCouponType('EXPERIENCE_FREE')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { reset(); onClose() }}
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
              <h3 className="text-vr-body font-semibold text-vrtext-primary">批量发放奖励</h3>
              <button
                onClick={() => { reset(); onClose() }}
                className="p-1 rounded-lg hover:bg-vrbg-elevated transition-colors"
              >
                <X className="w-4 h-4 text-vrtext-muted" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 用户选择 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-vr-caption text-vrtext-secondary">
                    选择用户 <span className="text-vrerror">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = (usersData?.data || []).map((u: User) => u.id)
                        setSelectedUserIds(allIds)
                      }}
                      className="text-[11px] text-vraccent-primary hover:underline"
                    >
                      全选
                    </button>
                    <span className="text-vrborder-subtle">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedUserIds([])}
                      className="text-[11px] text-vrtext-muted hover:text-vrtext-secondary hover:underline"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg overflow-hidden">
                  {/* 表头 */}
                  <div className="flex items-center gap-3 px-3 py-2 bg-vrbg-elevated border-b border-vrborder-subtle">
                    <input
                      type="checkbox"
                      checked={
                        (usersData?.data || []).length > 0 &&
                        (usersData?.data || []).every((u: User) => selectedUserIds.includes(u.id))
                      }
                      onChange={(e) => {
                        const allIds = (usersData?.data || []).map((u: User) => u.id)
                        setSelectedUserIds(e.target.checked ? allIds : [])
                      }}
                      className="w-4 h-4 rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary"
                    />
                    <span className="text-xs text-vrtext-muted flex-1">用户名称</span>
                    <span className="text-xs text-vrtext-muted w-28 text-right">手机号</span>
                  </div>

                  {/* 用户列表 */}
                  <div className="max-h-56 overflow-y-auto">
                    {(usersData?.data || []).length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-vrtext-muted">暂无用户数据</div>
                    ) : (
                      (usersData?.data || []).map((user: User) => (
                        <label
                          key={user.id}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b border-vrborder-subtle/50 last:border-b-0',
                            selectedUserIds.includes(user.id)
                              ? 'bg-vraccent-primary/5'
                              : 'hover:bg-vrbg-elevated/50'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(user.id)}
                            onChange={() => {
                              setSelectedUserIds((prev) =>
                                prev.includes(user.id)
                                  ? prev.filter((id) => id !== user.id)
                                  : [...prev, user.id]
                              )
                            }}
                            className="w-4 h-4 rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary shrink-0"
                          />
                          <span className="text-sm text-vrtext-primary flex-1 truncate">{user.name || '未命名'}</span>
                          <span className="text-sm text-vrtext-secondary w-28 text-right font-mono">{user.phone || '-'}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <p className="text-vr-caption text-vrtext-muted mt-1.5">
                  已选择 {selectedUserIds.length} 人
                </p>
              </div>

              {/* 奖励类型 */}
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1.5">奖励类型</label>
                <div className="flex gap-2">
                  {[
                    { key: 'POINTS', label: '积分' },
                    { key: 'COUPON', label: '优惠券' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => { setRewardType(t.key as any); setResult(null) }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-vr-body-sm border transition-colors',
                        rewardType === t.key
                          ? 'bg-vraccent-primary/10 border-vraccent-primary text-vraccent-primary'
                          : 'bg-vrbg-card border-vrborder-subtle text-vrtext-secondary hover:border-vrborder-hover'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 积分参数 */}
              {rewardType === 'POINTS' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      积分数量 <span className="text-vrerror">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pointsAmount}
                      onChange={(e) => setPointsAmount(e.target.value)}
                      placeholder="如 100"
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      赠送原因 <span className="text-vrerror">*</span>
                    </label>
                    <select
                      value={pointsReason}
                      onChange={(e) => setPointsReason(e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary appearance-none cursor-pointer"
                    >
                      <option value="">请选择赠送原因</option>
                      {GIFT_REASON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">备注</label>
                    <input
                      type="text"
                      value={pointsRemark}
                      onChange={(e) => setPointsRemark(e.target.value)}
                      placeholder="可选"
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                    />
                  </div>
                </div>
              )}

              {/* 优惠券参数 */}
              {rewardType === 'COUPON' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      券类型 <span className="text-vrerror">*</span>
                    </label>
                    <select
                      value={couponType}
                      onChange={(e) => setCouponType(e.target.value as any)}
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                    >
                      <option value="EXPERIENCE_FREE">体验券</option>
                      <option value="DISCOUNT">折扣券</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      券名称 <span className="text-vrerror">*</span>
                    </label>
                    <input
                      type="text"
                      value={couponName}
                      onChange={(e) => setCouponName(e.target.value)}
                      placeholder="请输入券名称"
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                        有效天数 <span className="text-vrerror">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={couponValidDays}
                        onChange={(e) => setCouponValidDays(e.target.value)}
                        placeholder="如 30"
                        className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                      />
                    </div>
                    {couponType === 'DISCOUNT' && (
                      <div>
                        <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                          折扣率 <span className="text-vrerror">*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={couponDiscountRate}
                          onChange={(e) => setCouponDiscountRate(e.target.value)}
                          placeholder="如80表示8折"
                          className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">
                      赠送原因 <span className="text-vrerror">*</span>
                    </label>
                    <select
                      value={couponReason}
                      onChange={(e) => setCouponReason(e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary appearance-none cursor-pointer"
                    >
                      <option value="">请选择赠送原因</option>
                      {GIFT_REASON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">备注</label>
                    <input
                      type="text"
                      value={couponRemark}
                      onChange={(e) => setCouponRemark(e.target.value)}
                      placeholder="可选"
                      className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                    />
                  </div>
                </div>
              )}

              {/* 结果摘要 */}
              {result && (
                <div className="bg-vrbg-elevated rounded-lg p-4 space-y-2">
                  <p className="text-vr-body-sm text-vrtext-primary font-medium">
                    成功发放给 <span className="text-vrsuccess">{result.success}</span> 人
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-subtle">
              <button
                onClick={() => { reset(); onClose() }}
                className="px-4 py-2 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="px-4 py-2 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
              >
                {isPending ? '发放中...' : '确认发放'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ─── Main Page ─── */
export default function Campaigns() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<CampaignStatus | 'ALL'>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [batchRewardOpen, setBatchRewardOpen] = useState(false)
  const [recordsCampaign, setRecordsCampaign] = useState<Campaign | null>(null)
  const [recordsOpen, setRecordsOpen] = useState(false)

  const tabs: { key: CampaignStatus | 'ALL'; label: string }[] = [
    { key: 'ALL', label: '全部' },
    { key: 'RUNNING', label: '进行中' },
    { key: 'PAUSED', label: '已暂停' },
    { key: 'ENDED', label: '已结束' },
  ]

  const { data: campaignData, isFetching } = useQuery({
    queryKey: ['campaigns', activeTab, currentPage, pageSize],
    queryFn: () =>
      getCampaigns({
        status: activeTab === 'ALL' ? undefined : activeTab,
        page: currentPage,
        pageSize,
      }),
    staleTime: 1000 * 30,
    placeholderData: (previousData: any) => previousData,
  })

  const total = campaignData?.meta?.total || 0
  const totalPages = campaignData?.meta?.totalPages || 1
  const safePage = Math.min(currentPage, totalPages)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages)
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] })
  }

  const pauseMutation = useMutation({
    mutationFn: pauseCampaign,
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
    },
    onError: (error: any) => {
      alert('暂停失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const activateMutation = useMutation({
    mutationFn: activateCampaign,
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
    },
    onError: (error: any) => {
      alert('激活失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const endMutation = useMutation({
    mutationFn: endCampaign,
    onSuccess: () => {
      invalidateAll()
      setDrawerOpen(false)
    },
    onError: (error: any) => {
      alert('结束失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      invalidateAll()
      alert('活动已删除')
    },
    onError: (error: any) => {
      alert('删除失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateCampaign(id, data),
    onSuccess: () => {
      invalidateAll()
      setEditModalOpen(false)
      setEditingCampaign(null)
      setDrawerOpen(false)
      alert('活动更新成功')
    },
    onError: (error: any) => {
      alert('更新失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const cloneMutation = useMutation({
    mutationFn: cloneCampaign,
    onSuccess: () => {
      invalidateAll()
      alert('活动复制成功')
    },
    onError: (error: any) => {
      alert('复制失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
    },
  })

  const campaigns: Campaign[] = campaignData?.data || []

  const tabCounts = useMemo(() => {
    const backendCounts = campaignData?.meta?.statusCounts as Record<string, number> | undefined
    if (backendCounts) {
      const all = Object.values(backendCounts).reduce((a, b) => a + b, 0)
      return { ALL: all, ...backendCounts }
    }
    const counts: Record<string, number> = { ALL: total }
    for (const c of campaigns) {
      counts[c.status] = (counts[c.status] || 0) + 1
    }
    return counts
  }, [campaignData?.meta?.statusCounts, campaigns, total])

  const handleOpenDetail = (campaign: Campaign) => {
    setRecordsCampaign(campaign)
    setRecordsOpen(true)
  }

  const issuedCount = (r?: CampaignReward[]) => r?.reduce((sum, x) => sum + (x.issuedCount || 0), 0) || 0
  const maxCount = (r?: CampaignReward[]) => r?.reduce((sum, x) => sum + (x.maxQuantity || 0), 0) || 0
  const firstReward = (campaign: Campaign) => campaign.rewards?.[0]
  const rewardTypeLabel = (reward?: CampaignReward) => {
    if (!reward) return '-'
    if (reward.rewardType === 'POINTS') return '积分'
    if (reward.rewardType === 'EXPERIENCE_COUPON') return '体验券'
    return '优惠券'
  }
  const rewardValueLabel = (reward?: CampaignReward) => {
    if (!reward) return '-'
    if (reward.rewardType === 'POINTS') return `${reward.pointsAmount || 0} 积分`
    if (reward.rewardType === 'EXPERIENCE_COUPON') return '免费体验'
    return reward.couponDiscountRate ? `${reward.couponDiscountRate}%` : '-'
  }
  const rewardDurationLabel = (reward?: CampaignReward) => {
    if (!reward || reward.rewardType === 'POINTS') return '-'
    return reward.couponValidDays ? `${reward.couponValidDays}天` : '不限'
  }
  const rewardNameLabel = (campaign: Campaign) => firstReward(campaign)?.couponName || campaign.name
  const rewardIssueDateLabel = (campaign: Campaign) => {
    if (!campaign.startAt && !campaign.endAt) return '不限时'
    return `${formatDate(campaign.startAt)} - ${formatDate(campaign.endAt)}`
  }
  const rewardQuantityLabel = (reward?: CampaignReward) => {
    if (!reward || reward.maxQuantity >= 999999) return '不限量'
    return `${reward.maxQuantity}张`
  }

  return (
    <Layout breadcrumb={['营销活动']}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">营销活动</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">创建和管理营销活动、发放权益</p>
          </motion.div>

          <div className="flex items-center gap-3">
            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              onClick={() => setBatchRewardOpen(true)}
              className="inline-flex items-center gap-2 h-9 px-4 border border-vraccent-primary text-vraccent-primary rounded-lg text-vr-body-sm hover:bg-vraccent-primary/10 transition-colors"
            >
              <Gift className="w-4 h-4" />
              批量发放奖励
            </motion.button>
            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 h-9 px-4 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建活动
            </motion.button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center justify-between border-b border-vrborder-subtle">
          <div className="flex gap-6">
            {tabs.map((tab, idx) => (
              <motion.button
                key={tab.key}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.06 }}
                onClick={() => { setActiveTab(tab.key); setCurrentPage(1) }}
                className={cn(
                  'relative py-3 text-vr-body-sm font-medium transition-colors',
                  activeTab === tab.key ? 'text-vraccent-primary' : 'text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {tabCounts[tab.key] !== undefined && tabCounts[tab.key] > 0 && (
                    <span
                      className={cn(
                        'min-w-[18px] h-[18px] px-1 rounded-full text-[11px] leading-none font-semibold flex items-center justify-center',
                        activeTab === tab.key
                          ? 'bg-vraccent-primary/15 text-vraccent-primary'
                          : 'bg-vrbg-elevated text-vrtext-muted'
                      )}
                    >
                      {tabCounts[tab.key]}
                    </span>
                  )}
                </span>
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="campaign-active-tab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-vraccent-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            ))}
          </div>
          <span className="text-vr-caption text-vrtext-tertiary">{total} 条记录</span>
        </div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="min-w-[1480px] w-full">
              <thead>
                <tr className="bg-[#dfeaff]">
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[90px]">ID</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[220px]">优惠券名称</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">优惠券类型</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">面值</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">领取方式</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[180px]">领取日期</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">使用时间</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">发布数量</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">是否开启</th>
                  <th className="text-center px-6 py-3 text-vr-caption text-vrtext-secondary font-medium w-[260px]">操作</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="wait">
                  {campaigns.map((campaign, idx) => (
                    <motion.tr
                      key={campaign.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.06 }}
                      className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{campaign.id.slice(0, 8)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary font-medium">{rewardNameLabel(campaign)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{rewardTypeLabel(firstReward(campaign))}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{rewardValueLabel(firstReward(campaign))}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">系统赠送</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{rewardIssueDateLabel(campaign)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{rewardDurationLabel(firstReward(campaign))}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary">{rewardQuantityLabel(firstReward(campaign))}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (campaign.status === 'RUNNING') pauseMutation.mutate(campaign.id)
                            else activateMutation.mutate(campaign.id)
                          }}
                          disabled={pauseMutation.isPending || activateMutation.isPending || campaign.status === 'ENDED'}
                          className={cn(
                            'relative h-7 w-12 rounded-full transition-colors disabled:opacity-50',
                            campaign.status === 'RUNNING' ? 'bg-vraccent-primary' : 'bg-vrborder-subtle'
                          )}
                        >
                          <span className={cn(
                            'absolute top-1 h-5 w-5 rounded-full bg-white transition-all',
                            campaign.status === 'RUNNING' ? 'left-6' : 'left-1'
                          )} />
                        </button>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex items-center justify-center gap-3 text-vr-body-sm whitespace-nowrap">
                          <button
                            onClick={() => handleOpenDetail(campaign)}
                            className="min-w-[56px] text-vraccent-primary hover:underline transition-all"
                          >
                            领取记录
                          </button>
                          <span className="text-vrborder-strong/80">|</span>
                          <button
                            onClick={() => {
                              setEditingCampaign(campaign)
                              setEditModalOpen(true)
                            }}
                            className="min-w-[32px] text-vraccent-primary hover:underline transition-all"
                          >
                            编辑
                          </button>
                          <span className="text-vrborder-strong/80">|</span>
                          <button
                            onClick={() => cloneMutation.mutate(campaign.id)}
                            disabled={cloneMutation.isPending}
                            className="min-w-[32px] text-vraccent-primary hover:underline transition-all disabled:opacity-50"
                          >
                            {cloneMutation.isPending ? '复制中...' : '复制'}
                          </button>
                          <span className="text-vrborder-strong/80">|</span>
                          <button
                            onClick={() => {
                              if (window.confirm('确定要删除该活动吗？删除后将从列表中隐藏，但数据记录会保留。')) {
                                deleteMutation.mutate(campaign.id)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="min-w-[32px] text-vraccent-primary hover:underline transition-all disabled:opacity-50"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {campaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Megaphone className="w-12 h-12 text-vrtext-muted mb-3" />
              <p className="text-vr-body text-vrtext-secondary">暂无营销活动</p>
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-vrborder-subtle">
              <div className="flex items-center gap-2">
                <span className="text-vr-caption text-vrtext-tertiary">每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="h-7 px-2 bg-vrbg-surface border border-vrborder-subtle rounded text-vr-caption text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span className="text-vr-caption text-vrtext-tertiary">条</span>
                <span className="text-vr-caption text-vrtext-tertiary ml-2">共 {total} 条</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      'w-8 h-8 flex items-center justify-center rounded-lg text-vr-body-sm font-medium transition-colors',
                      page === safePage
                        ? 'bg-vraccent-primary text-white'
                        : 'border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated'
                    )}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Batch Reward Modal */}
      <BatchRewardModal open={batchRewardOpen} onClose={() => setBatchRewardOpen(false)} />

      <AddCouponModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={invalidateAll}
      />

      <CampaignRewardRecordsModal
        campaign={recordsCampaign}
        open={recordsOpen}
        onOpenChange={(open) => {
          setRecordsOpen(open)
          if (!open) setRecordsCampaign(null)
        }}
        onViewAll={(campaignId) => {
          setRecordsOpen(false)
          navigate(`/campaign-reward-records?campaignId=${encodeURIComponent(campaignId)}`)
        }}
      />

      {/* Detail Sheet */}
      <CampaignDetailSheet
        campaign={selectedCampaign}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onPause={(id) => pauseMutation.mutate(id)}
        onActivate={(id) => activateMutation.mutate(id)}
        onEnd={(id) => endMutation.mutate(id)}
        onEdit={(c) => { setEditingCampaign(c); setEditModalOpen(true) }}
        pausePending={pauseMutation.isPending}
        activatePending={activateMutation.isPending}
        endPending={endMutation.isPending}
      />
      {editingCampaign && (
        <EditCampaignModal
          open={editModalOpen}
          onClose={() => { setEditModalOpen(false); setEditingCampaign(null) }}
          campaign={editingCampaign}
          onSubmit={(id, data) => updateMutation.mutate({ id, data })}
          isPending={updateMutation.isPending}
        />
      )}
    </Layout>
  )
}
