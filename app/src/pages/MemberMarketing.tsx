import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crown,
  Coins,
  Plus,
  Trash2,
  Check,
  Save,
  RotateCcw,
  Gift,
  Ticket,
  Package,
  Tag,
  Edit2,
  X,
  ImageIcon,
  ShoppingBag,
  Truck,
  CheckCircle,
  RotateCcw as ReturnIcon,
  MapPin,
  Store,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { getSettings, bulkSaveSettings } from '@/api/settings'
import {
  getPointsProducts,
  createPointsProduct,
  updatePointsProduct,
  deletePointsProduct,
  getAllPointsOrders,
  shipPointsOrder,
  completePointsOrder,
  approvePointsReturn,
} from '@/api/points'
import type { PointsProduct, PointsOrder } from '@/api/points'
import { uploadFile } from '@/api/upload'
import { getImageUrl } from '@/lib/imageUrl'
import { getSystemConfigs, updateSystemConfig } from '@/api/systemConfig'

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number]

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

type TabKey = 'tiers' | 'points' | 'mall' | 'orders'

const tabs = [
  { key: 'tiers' as TabKey, label: '等级与权益', icon: Crown },
  { key: 'points' as TabKey, label: '积分规则', icon: Coins },
  { key: 'mall' as TabKey, label: '积分商城管理', icon: Gift },
  { key: 'orders' as TabKey, label: '商城订单', icon: ShoppingBag },
]

function configValue<T>(configs: Array<{ key: string; value: any }> | undefined, key: string, fallback: T): T {
  const item = configs?.find((c) => c.key === key)
  if (!item) return fallback
  return item.value as T
}

function yuanToFen(value: number) {
  return Math.round((Number(value) || 0) * 100)
}

function fenToYuan(value: number) {
  return Math.round((Number(value) || 0)) / 100
}

const productTypeMap: Record<string, { label: string; icon: typeof Ticket; color: string }> = {
  EXPERIENCE_TICKET: { label: '体验券', icon: Ticket, color: 'text-vraccent-primary bg-vraccent-primary/10' },
  PHYSICAL_GOOD: { label: '小商品', icon: Package, color: 'text-vrwarning bg-vrwarning/10' },
  COUPON: { label: '优惠券', icon: Tag, color: 'text-vrsuccess bg-vrsuccess/10' },
}

const productStatusMap: Record<string, { label: string; className: string }> = {
  ON_SALE: { label: '上架中', className: 'text-emerald-400 bg-emerald-500/10' },
  OFF_SALE: { label: '已下架', className: 'text-vrtext-muted bg-vrtext-muted/10' },
  SOLD_OUT: { label: '已售罄', className: 'text-vrerror bg-vrerror/10' },
}

const orderStatusMap: Record<string, { label: string; className: string }> = {
  PENDING: { label: '待发货', className: 'text-amber-400 bg-amber-500/10' },
  SHIPPED: { label: '已发货', className: 'text-blue-400 bg-blue-500/10' },
  COMPLETED: { label: '已完成', className: 'text-emerald-400 bg-emerald-500/10' },
  RETURNED: { label: '退货中', className: 'text-orange-400 bg-orange-500/10' },
  CANCELLED: { label: '已取消', className: 'text-gray-400 bg-gray-500/10' },
}

/* ─── Recharge Tiers Section ─── */
function RechargeTiersSection() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
  })
  const { data: systemConfigs } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: () => getSystemConfigs(),
  })

  const initialized = useRef(false)

  const defaultTiers = [
    { amount: 500, bonus: 0, level: 'NORMAL' },
    { amount: 1000, bonus: 100, level: 'MEMBER' },
    { amount: 2000, bonus: 300, level: 'VIP' },
    { amount: 5000, bonus: 1000, level: 'VIP+' },
  ]
  const defaultLevels = [
    { key: 'NORMAL', name: '普通会员', discount: 100, threshold: 0, freeRescheduleQuota: 0 },
    { key: 'MEMBER', name: '银卡会员', discount: 95, threshold: 100, freeRescheduleQuota: 1 },
    { key: 'VIP', name: '金卡会员', discount: 90, threshold: 500, freeRescheduleQuota: 2 },
    { key: 'VIP+', name: '钻石会员', discount: 85, threshold: 1000, freeRescheduleQuota: 4 },
  ]

  const [tiers, setTiers] = useState<{ amount: number; bonus: number; level: string }[]>(defaultTiers)
  const [levels, setLevels] = useState<{ key: string; name: string; discount: number; threshold: number; freeRescheduleQuota: number }[]>(defaultLevels)

  useEffect(() => {
    if (settings && systemConfigs && !initialized.current) {
      initialized.current = true
      setTiers(settings.recharge_tiers?.value ?? defaultTiers)
      const storedLevels = settings.member_levels?.value ?? defaultLevels
      const names = configValue<string[]>(systemConfigs, 'member_level_names', ['普通会员', '银卡会员', '金卡会员', '钻石会员'])
      const thresholds = configValue<number[]>(systemConfigs, 'member_level_thresholds', [0, 10000, 50000, 100000])
      const discounts = configValue<number[]>(systemConfigs, 'member_discount_rates', [100, 95, 90, 85])
      const quotas = configValue<number[]>(systemConfigs, 'member_free_reschedule_quotas', [0, 1, 2, 4])
      setLevels(storedLevels.map((level: any, idx: number) => ({
        ...level,
        key: level.key === 'VIP+' ? 'VIP_PLUS' : level.key,
        name: names[idx] ?? level.name,
        discount: Number(discounts[idx] ?? level.discount ?? 100),
        threshold: fenToYuan(Number(thresholds[idx] ?? yuanToFen(level.threshold || 0))),
        freeRescheduleQuota: Number(quotas[idx] ?? 0),
      })))
    }
  }, [settings, systemConfigs])

  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const normalizedLevels = levels.map((l) => ({ ...l, key: l.key === 'VIP_PLUS' ? 'VIP+' : l.key }))
      await Promise.all([
        updateSystemConfig('member_level_names', levels.map((l) => l.name)),
        updateSystemConfig('member_level_thresholds', levels.map((l) => yuanToFen(l.threshold))),
        updateSystemConfig('member_discount_rates', levels.map((l) => Number(l.discount) || 100)),
        updateSystemConfig('member_free_reschedule_quotas', levels.map((l) => Number(l.freeRescheduleQuota) || 0)),
        bulkSaveSettings([
          { key: 'recharge_tiers', value: tiers, category: 'member' },
          { key: 'member_levels', value: normalizedLevels, category: 'member' },
        ]),
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['systemConfigs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const updateLevel = (idx: number, k: keyof typeof levels[0], v: unknown) =>
    setLevels((p) => p.map((l, i) => (i === idx ? { ...l, [k]: v } : l)))

  const updateTierByLevel = (levelKey: string, k: 'amount' | 'bonus', v: number) => {
    setTiers((prev) => {
      const compatibleKey = levelKey === 'VIP_PLUS' ? 'VIP+' : levelKey
      const idx = prev.findIndex((t) => t.level === levelKey || t.level === compatibleKey)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], [k]: v }
        return next
      }
      return [...prev, { amount: k === 'amount' ? v : 0, bonus: k === 'bonus' ? v : 0, level: levelKey }]
    })
  }

  const handleSave = () => {
    mutation.mutate()
  }

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate">
      <div className="mb-4 max-w-5xl rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-vr-h4 text-vrtext-primary font-semibold">会员等级与权益规则</h2>
            <p className="text-vr-caption text-vrtext-tertiary mt-1">
              控制会员升级门槛、订单折扣和每月免费改签次数，保存后会影响新订单和会员权益展示。
            </p>
          </div>
        </div>
        <div className="space-y-3">
        {levels.map((l, i) => {
          const compatibleKey = l.key === 'VIP_PLUS' ? 'VIP+' : l.key
          const tier = tiers.find((t) => t.level === l.key || t.level === compatibleKey) || { amount: 0, bonus: 0, level: l.key }
          return (
            <motion.div key={l.key} {...fadeInUp} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 bg-vrbg-elevated rounded-lg items-end">
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1">等级名称</label>
                <input
                  type="text"
                  value={l.name}
                  onChange={(e) => updateLevel(i, 'name', e.target.value)}
                  className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1">累计消费（元）</label>
                <input
                  type="number"
                  min={0}
                  value={l.threshold}
                  onChange={(e) => updateLevel(i, 'threshold', Number(e.target.value))}
                  className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1">折扣(%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={l.discount}
                  onChange={(e) => updateLevel(i, 'discount', Number(e.target.value))}
                  className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1">免费改签/月</label>
                <input
                  type="number"
                  min={0}
                  value={l.freeRescheduleQuota}
                  onChange={(e) => updateLevel(i, 'freeRescheduleQuota', Number(e.target.value))}
                  className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1">充值档位（元）</label>
                <input
                  type="number"
                  value={tier.amount}
                  onChange={(e) => updateTierByLevel(l.key, 'amount', Number(e.target.value))}
                  className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-1">充值赠送（元）</label>
                <input
                  type="number"
                  value={tier.bonus}
                  onChange={(e) => updateTierByLevel(l.key, 'bonus', Number(e.target.value))}
                  className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
            </motion.div>
          )
        })}
        </div>
      </div>

      <motion.div {...fadeInUp} className="pt-6 max-w-xl">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-vr-body-sm font-medium transition-all duration-200',
            saved
              ? 'bg-vrsuccess/20 text-vrsuccess'
              : mutation.isPending
                ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
                : 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover'
          )}
        >
          {mutation.isPending ? (
            <><RotateCcw className="w-4 h-4 animate-spin" />保存中...</>
          ) : saved ? (
            <><Check className="w-4 h-4" />已保存</>
          ) : (
            <><Save className="w-4 h-4" />保存设置</>
          )}
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ─── Points Rules Section ─── */
function PointsRulesSection() {
  const queryClient = useQueryClient()
  const { data: systemConfigs } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: () => getSystemConfigs(),
  })

  const [points, setPoints] = useState({
    earnRate: 1,
    deductRate: 100,
    pointsGiftDailyLimit: 10000,
    couponGiftDailyLimit: 10,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (systemConfigs) {
      const earnRatio = configValue<number>(systemConfigs, 'points_earn_ratio', 100)
      setPoints({
        earnRate: earnRatio > 0 ? 100 / earnRatio : 1,
        deductRate: configValue<number>(systemConfigs, 'points_deduct_ratio', 100),
        pointsGiftDailyLimit: configValue<number>(systemConfigs, 'points_gift_daily_limit', 10000),
        couponGiftDailyLimit: configValue<number>(systemConfigs, 'coupon_gift_daily_limit', 10),
      })
    }
  }, [systemConfigs])

  const mutation = useMutation({
    mutationFn: async () => {
      const earnRate = Number(points.earnRate) || 1
      await Promise.all([
        updateSystemConfig('points_earn_ratio', Math.max(1, Math.round(100 / earnRate))),
        updateSystemConfig('points_deduct_ratio', Math.max(1, Math.round(Number(points.deductRate) || 100))),
        updateSystemConfig('points_gift_daily_limit', Math.max(0, Math.round(Number(points.pointsGiftDailyLimit) || 0))),
        updateSystemConfig('coupon_gift_daily_limit', Math.max(0, Math.round(Number(points.couponGiftDailyLimit) || 0))),
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemConfigs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSave = () => {
    mutation.mutate()
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="max-w-4xl">
      <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-4 mb-4">
        <h2 className="text-vr-h4 text-vrtext-primary font-semibold">积分与赠送风控</h2>
        <p className="text-vr-caption text-vrtext-tertiary mt-1">
          控制消费得分、积分抵扣和人工赠送上限。赠送上限用于防止误操作或异常批量发放。
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
          <label className="block text-vr-caption text-vrtext-secondary mb-1">消费积分比例（每消费1元得X积分）</label>
          <input
            type="number"
            step={0.1}
            value={points.earnRate}
            onChange={(e) => setPoints((p) => ({ ...p, earnRate: Number(e.target.value) }))}
            className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
          />
          <p className="text-vr-caption text-vrtext-tertiary mt-2">例如填 1，表示消费 ¥1 赠送 1 积分。</p>
        </div>
        <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
          <label className="block text-vr-caption text-vrtext-secondary mb-1">积分抵扣比例（X积分抵扣1元）</label>
          <input
            type="number"
            value={points.deductRate}
            onChange={(e) => setPoints((p) => ({ ...p, deductRate: Number(e.target.value) }))}
            className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
          />
          <p className="text-vr-caption text-vrtext-tertiary mt-2">例如填 100，表示 100 积分可抵扣 ¥1。</p>
        </div>
        <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
          <label className="block text-vr-caption text-vrtext-secondary mb-1">单日积分赠送上限</label>
          <input
            type="number"
            min={0}
            value={points.pointsGiftDailyLimit}
            onChange={(e) => setPoints((p) => ({ ...p, pointsGiftDailyLimit: Number(e.target.value) }))}
            className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
          />
          <p className="text-vr-caption text-vrtext-tertiary mt-2">超过上限时，人工赠送积分会被系统拦截。</p>
        </div>
        <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
          <label className="block text-vr-caption text-vrtext-secondary mb-1">单日优惠券赠送上限</label>
          <input
            type="number"
            min={0}
            value={points.couponGiftDailyLimit}
            onChange={(e) => setPoints((p) => ({ ...p, couponGiftDailyLimit: Number(e.target.value) }))}
            className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
          />
          <p className="text-vr-caption text-vrtext-tertiary mt-2">用于会员营销和手动发券场景，避免单日异常发放。</p>
        </div>
      </div>

      <motion.div {...fadeInUp} className="pt-6">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-vr-body-sm font-medium transition-all duration-200',
            saved
              ? 'bg-vrsuccess/20 text-vrsuccess'
              : mutation.isPending
                ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
                : 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover'
          )}
        >
          {mutation.isPending ? (
            <><RotateCcw className="w-4 h-4 animate-spin" />保存中...</>
          ) : saved ? (
            <><Check className="w-4 h-4" />已保存</>
          ) : (
            <><Save className="w-4 h-4" />保存设置</>
          )}
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ─── Points Mall Admin Section ─── */
function PointsMallAdminSection() {
  const queryClient = useQueryClient()
  const { data: products, isLoading } = useQuery({
    queryKey: ['points-products', 'admin'],
    queryFn: () => getPointsProducts(),
  })

  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<PointsProduct | null>(null)
  const [uploading, setUploading] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
    image: '',
    type: 'EXPERIENCE_TICKET' as PointsProduct['type'],
    pointsCost: 100,
    discountRate: undefined as number | undefined,
    validityDays: undefined as number | undefined,
    stock: -1,
    sortOrder: 0,
  })

  const openCreate = () => {
    setEditingProduct(null)
    setForm({
      name: '',
      description: '',
      image: '',
      type: 'EXPERIENCE_TICKET',
      pointsCost: 100,
      discountRate: undefined,
      validityDays: undefined,
      stock: -1,
      sortOrder: 0,
    })
    setShowModal(true)
  }

  const openEdit = (p: PointsProduct) => {
    setEditingProduct(p)
    setForm({
      name: p.name,
      description: p.description || '',
      image: p.image || '',
      type: p.type,
      pointsCost: p.pointsCost,
      discountRate: p.discountRate || undefined,
      validityDays: p.validityDays || undefined,
      stock: p.stock,
      sortOrder: p.sortOrder,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingProduct(null)
  }

  const createMut = useMutation({
    mutationFn: createPointsProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-products'] })
      closeModal()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updatePointsProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-products'] })
      closeModal()
    },
  })

  const deleteMut = useMutation({
    mutationFn: deletePointsProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-products'] })
    },
  })

  const handleSubmit = () => {
    if (!form.name || !form.pointsCost) return
    const payload: any = {
      ...form,
      pointsCost: Number(form.pointsCost),
      stock: Number(form.stock),
      sortOrder: Number(form.sortOrder),
    }
    if (form.type !== 'COUPON') {
      delete payload.discountRate
    } else if (form.discountRate) {
      payload.discountRate = Number(form.discountRate)
    }
    if (editingProduct) {
      payload.validityDays = form.validityDays !== undefined ? Number(form.validityDays) : null
    } else if (form.validityDays !== undefined) {
      payload.validityDays = Number(form.validityDays)
    }
    if (editingProduct) {
      updateMut.mutate({ id: editingProduct.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadFile('products', file)
      setForm((p) => ({ ...p, image: res.url }))
    } catch (err: any) {
      alert('图片上传失败: ' + (err?.response?.data?.message || err.message))
    } finally {
      setUploading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-vr-body-sm text-vrtext-tertiary">
          共 {products?.length || 0} 个商品
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" />新增商品
        </button>
      </div>

      {/* Product List */}
      {isLoading ? (
        <div className="text-center py-12 text-vrtext-muted">加载中...</div>
      ) : !products || products.length === 0 ? (
        <div className="text-center py-12 text-vrtext-muted bg-vrbg-elevated rounded-xl border border-vrborder-subtle">
          <Gift className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无积分商品，点击右上角添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const typeInfo = productTypeMap[p.type] || productTypeMap.EXPERIENCE_TICKET
            const statusInfo = productStatusMap[p.status] || productStatusMap.OFF_SALE
            const TypeIcon = typeInfo.icon
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 bg-vrbg-elevated rounded-xl border border-vrborder-subtle"
              >
                <div className="w-14 h-14 rounded-lg bg-vrbg-surface flex items-center justify-center shrink-0 overflow-hidden">
                  {p.image ? (
                    <img src={getImageUrl(p.image)} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <TypeIcon className="w-6 h-6 text-vrtext-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-vr-body-sm font-medium text-vrtext-primary">{p.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', typeInfo.color)}>
                      {typeInfo.label}
                    </span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', statusInfo.className)}>
                      {statusInfo.label}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-vr-caption text-vrtext-muted mt-0.5 truncate">{p.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-1 text-vr-caption text-vrtext-secondary">
                    <span className="flex items-center gap-1">
                      <Coins className="w-3 h-3 text-amber-500" />
                      {p.pointsCost} 积分
                    </span>
                    {p.type === 'COUPON' && p.discountRate && (
                      <span className="text-vrsuccess">
                        {(p.discountRate / 10).toFixed(p.discountRate % 10 === 0 ? 0 : 1)}折
                      </span>
                    )}
                    {p.type === 'COUPON' && !p.discountRate && (
                      <span className="text-vrwarning">未设置折扣率</span>
                    )}
                    <span>
                      {p.stock === -1 ? '库存充足' : p.stock === 0 ? '已售罄' : `剩余 ${p.stock}`}
                    </span>
                    <span>
                      {p.validityDays ? `有效期${p.validityDays}天` : '永久有效'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="p-2 rounded-lg text-vrtext-secondary hover:text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('确定删除该商品吗？')) deleteMut.mutate(p.id)
                    }}
                    className="p-2 rounded-lg text-vrtext-secondary hover:text-vrerror hover:bg-vrerror/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
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
                  {editingProduct ? '编辑商品' : '新增商品'}
                </h3>
                <button onClick={closeModal} className="p-1 rounded-lg hover:bg-vrbg-elevated transition-colors">
                  <X className="w-4 h-4 text-vrtext-muted" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Image upload */}
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">商品图片</label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg bg-vrbg-surface border border-vrborder-subtle flex items-center justify-center overflow-hidden">
                      {form.image ? (
                        <img src={getImageUrl(form.image)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-vrtext-muted" />
                      )}
                    </div>
                    <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-vrbg-elevated border border-vrborder-subtle text-vr-caption text-vrtext-secondary hover:border-vrborder-hover transition-colors">
                      {uploading ? '上传中...' : '上传图片'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    {form.image && (
                      <button
                        onClick={() => setForm((p) => ({ ...p, image: '' }))}
                        className="text-vrerror text-vr-caption hover:underline"
                      >
                        清除
                      </button>
                    )}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">商品名称 <span className="text-vrerror">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="请输入商品名称"
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">商品类型 <span className="text-vrerror">*</span></label>
                  <div className="flex gap-2">
                    {([
                      { key: 'EXPERIENCE_TICKET', label: '体验券' },
                      { key: 'COUPON', label: '优惠券' },
                      { key: 'PHYSICAL_GOOD', label: '小商品' },
                    ] as const).map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setForm((p) => ({ ...p, type: t.key }))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-vr-body-sm border transition-colors',
                          form.type === t.key
                            ? 'bg-vraccent-primary/10 border-vraccent-primary text-vraccent-primary'
                            : 'bg-vrbg-surface border-vrborder-subtle text-vrtext-secondary hover:border-vrborder-hover'
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Points Cost */}
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">所需积分 <span className="text-vrerror">*</span></label>
                  <input
                    type="number"
                    min={1}
                    value={form.pointsCost}
                    onChange={(e) => setForm((p) => ({ ...p, pointsCost: Number(e.target.value) }))}
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                  />
                </div>

                {/* Discount Rate — only for COUPON */}
                {form.type === 'COUPON' && (
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">折扣率 <span className="text-vrerror">*</span></label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={form.discountRate || ''}
                        onChange={(e) => setForm((p) => ({ ...p, discountRate: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="如 80 表示8折"
                        className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                      />
                      <span className="text-vr-caption text-vrtext-muted whitespace-nowrap">
                        {(form.discountRate ? (form.discountRate / 10).toFixed(form.discountRate % 10 === 0 ? 0 : 1) : '-')}折
                      </span>
                    </div>
                    <p className="text-vr-caption text-vrtext-muted mt-1">填写 1-99 的整数，如 80 表示8折</p>
                  </div>
                )}

                {/* Validity Days — for EXPERIENCE_TICKET and COUPON */}
                {form.type !== 'PHYSICAL_GOOD' && (
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1.5">有效期（天）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={form.validityDays || ''}
                        onChange={(e) => setForm((p) => ({ ...p, validityDays: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="留空表示永久有效"
                        className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                      />
                      <span className="text-vr-caption text-vrtext-muted whitespace-nowrap">
                        {form.validityDays ? `${form.validityDays}天` : '永久'}
                      </span>
                    </div>
                    <p className="text-vr-caption text-vrtext-muted mt-1">留空表示兑换后永久有效</p>
                  </div>
                )}

                {/* Stock */}
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">库存数量（-1 表示不限）</label>
                  <input
                    type="number"
                    min={-1}
                    value={form.stock}
                    onChange={(e) => setForm((p) => ({ ...p, stock: Number(e.target.value) }))}
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">商品描述</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="请输入商品描述"
                    rows={3}
                    className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary resize-none"
                  />
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1.5">排序权重（数字越小越靠前）</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))}
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-subtle">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={createMut.isPending || updateMut.isPending || !form.name}
                  className="px-4 py-2 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
                >
                  {createMut.isPending || updateMut.isPending ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Points Orders Admin Section ─── */
function PointsOrdersAdminSection() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [shipModalId, setShipModalId] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['points-orders-all', statusFilter],
    queryFn: () => getAllPointsOrders({ status: statusFilter || undefined }),
  })

  const orders = data?.list || []

  const shipMut = useMutation({
    mutationFn: ({ id, tracking }: { id: string; tracking?: string }) => shipPointsOrder(id, tracking),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-orders-all'] })
      setShipModalId(null)
      setTrackingNumber('')
    },
  })

  const completeMut = useMutation({
    mutationFn: completePointsOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-orders-all'] })
    },
  })

  const returnMut = useMutation({
    mutationFn: approvePointsReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-orders-all'] })
    },
  })

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
        >
          <option value="">全部状态</option>
          <option value="PENDING">待发货</option>
          <option value="SHIPPED">已发货</option>
          <option value="COMPLETED">已完成</option>
          <option value="RETURNED">退货中</option>
          <option value="CANCELLED">已取消</option>
        </select>
        <p className="text-vr-body-sm text-vrtext-tertiary">共 {data?.total || 0} 笔订单</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-vrtext-muted">加载中...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-vrtext-muted bg-vrbg-elevated rounded-xl border border-vrborder-subtle">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无商城订单</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: PointsOrder) => {
            const statusInfo = orderStatusMap[order.status] || orderStatusMap.PENDING
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-vrbg-elevated rounded-xl border border-vrborder-subtle p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-vr-body-sm font-medium text-vrtext-primary">{order.orderNo}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', statusInfo.className)}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <span className="text-vr-caption text-vrtext-muted">
                    {new Date(order.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-vrbg-surface flex items-center justify-center shrink-0">
                    {order.product?.image ? (
                      <img src={getImageUrl(order.product.image)} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <Package className="w-5 h-5 text-vrtext-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-vrtext-primary">{order.productName}</p>
                    <p className="text-xs text-amber-500 mt-0.5">{order.pointsCost} 积分</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-vrtext-muted">
                      <span className="flex items-center gap-1">
                        {order.deliveryType === 'PICKUP' ? <Store className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                        {order.deliveryType === 'PICKUP' ? '线下领取' : '邮寄'}
                      </span>
                      {order.recipientName && (
                        <span>{order.recipientName} {order.recipientPhone}</span>
                      )}
                    </div>
                    {order.address && (
                      <p className="text-xs text-vrtext-muted mt-0.5">{order.address}</p>
                    )}
                    {order.trackingNumber && (
                      <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
                        <Truck className="w-3 h-3" />物流：{order.trackingNumber}
                      </p>
                    )}
                    {order.returnReason && (
                      <p className="text-xs text-orange-400 mt-0.5">退货原因：{order.returnReason}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-vrborder-subtle">
                  <div className="text-xs text-vrtext-muted">
                    用户：{order.user?.name || '-'} {order.user?.phone || ''}
                  </div>
                  <div className="flex items-center gap-2">
                    {order.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => setShipModalId(order.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20 transition-colors"
                        >
                          <Truck className="w-3 h-3" />发货
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('确定完成该订单吗？')) completeMut.mutate(order.id)
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs hover:bg-emerald-500/20 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" />完成
                        </button>
                      </>
                    )}
                    {order.status === 'SHIPPED' && (
                      <button
                        onClick={() => {
                          if (confirm('确定完成该订单吗？')) completeMut.mutate(order.id)
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs hover:bg-emerald-500/20 transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" />完成
                      </button>
                    )}
                    {order.status === 'RETURNED' && (
                      <button
                        onClick={() => {
                          if (confirm('确定同意退货并退回积分吗？')) returnMut.mutate(order.id)
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-xs hover:bg-orange-500/20 transition-colors"
                      >
                        <ReturnIcon className="w-3 h-3" />同意退货
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Ship Modal */}
      <AnimatePresence>
        {shipModalId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { setShipModalId(null); setTrackingNumber('') }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-vrbg-card rounded-xl border border-vrborder-subtle shadow-xl w-full max-w-md mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-vr-body font-semibold text-vrtext-primary mb-4">填写物流信息</h3>
              <input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="物流单号（可选）"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary mb-4"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setShipModalId(null); setTrackingNumber('') }}
                  className="px-4 py-2 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => shipMut.mutate({ id: shipModalId, tracking: trackingNumber || undefined })}
                  disabled={shipMut.isPending}
                  className="px-4 py-2 bg-vraccent-primary text-white rounded-lg text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
                >
                  {shipMut.isPending ? '保存中...' : '确认发货'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function MemberMarketing() {
  const [activeTab, setActiveTab] = useState<TabKey>('tiers')

  return (
    <Layout>
      <div className="p-6 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-vr-h1 text-vrtext-primary font-semibold">会员营销</h1>
          <p className="text-vr-body text-vrtext-tertiary mt-1">
            配置会员等级权益、积分规则、赠送风控和积分商城
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-vrbg-surface rounded-lg p-1 w-fit mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-md text-vr-body-sm transition-colors',
                  isActive
                    ? 'bg-vraccent-primary text-white'
                    : 'text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'tiers' && (
            <motion.div
              key="tiers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <RechargeTiersSection />
            </motion.div>
          )}
          {activeTab === 'points' && (
            <motion.div
              key="points"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PointsRulesSection />
            </motion.div>
          )}
          {activeTab === 'mall' && (
            <motion.div
              key="mall"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PointsMallAdminSection />
            </motion.div>
          )}
          {activeTab === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PointsOrdersAdminSection />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  )
}
