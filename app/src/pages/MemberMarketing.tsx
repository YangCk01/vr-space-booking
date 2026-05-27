import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Crown,
  Coins,
  Plus,
  Trash2,
  Check,
  Save,
  RotateCcw,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { getSettings, bulkSaveSettings } from '@/api/settings'

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number]

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

export default function MemberMarketing() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
  })

  const s = settings || {}
  const initialized = useRef(false)

  const defaultTiers = [
    { amount: 500, bonus: 0, level: 'NORMAL' },
    { amount: 1000, bonus: 100, level: 'MEMBER' },
    { amount: 2000, bonus: 300, level: 'VIP' },
    { amount: 5000, bonus: 1000, level: 'VIP+' },
  ]
  const defaultLevels = [
    { key: 'NORMAL', name: '普通会员', discount: 100, threshold: 0 },
    { key: 'MEMBER', name: '银卡会员', discount: 95, threshold: 1000 },
    { key: 'VIP', name: '金卡会员', discount: 90, threshold: 2000 },
    { key: 'VIP+', name: '钻石会员', discount: 85, threshold: 5000 },
  ]
  const defaultPoints = { earnRate: 1, deductRate: 100 }

  const [tiers, setTiers] = useState<{ amount: number; bonus: number; level: string }[]>(defaultTiers)
  const [levels, setLevels] = useState<{ key: string; name: string; discount: number; threshold: number }[]>(defaultLevels)
  const [points, setPoints] = useState(defaultPoints)

  // 首次加载 settings 后同步 state，避免 useState 初始值只生效一次
  useEffect(() => {
    if (settings && !initialized.current) {
      initialized.current = true
      setTiers(settings.recharge_tiers?.value ?? defaultTiers)
      setLevels(settings.member_levels?.value ?? defaultLevels)
      setPoints({
        earnRate: settings.points_earn_rate?.value ?? 1,
        deductRate: settings.points_deduct_rate?.value ?? 100,
      })
    }
  }, [settings])

  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: bulkSaveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const updateLevel = (idx: number, k: keyof typeof levels[0], v: unknown) =>
    setLevels((p) => p.map((l, i) => (i === idx ? { ...l, [k]: v } : l)))

  const updateTierByLevel = (levelKey: string, k: 'amount' | 'bonus', v: number) => {
    setTiers((prev) => {
      const idx = prev.findIndex((t) => t.level === levelKey)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], [k]: v }
        return next
      }
      return [...prev, { amount: k === 'amount' ? v : 0, bonus: k === 'bonus' ? v : 0, level: levelKey }]
    })
  }

  const addLevelAndTier = () => {
    const newKey = `LEVEL_${Date.now()}`
    setLevels((prev) => [...prev, { key: newKey, name: '新等级', discount: 100, threshold: 0 }])
    setTiers((prev) => [...prev, { amount: 0, bonus: 0, level: newKey }])
  }

  const removeLevelAndTier = (idx: number) => {
    const levelKey = levels[idx].key
    setLevels((prev) => prev.filter((_, i) => i !== idx))
    setTiers((prev) => prev.filter((t) => t.level !== levelKey))
  }

  const handleSave = () => {
    mutation.mutate([
      { key: 'recharge_tiers', value: tiers, category: 'member' },
      { key: 'member_levels', value: levels, category: 'member' },
      { key: 'points_earn_rate', value: points.earnRate, category: 'member' },
      { key: 'points_deduct_rate', value: points.deductRate, category: 'member' },
    ])
  }

  return (
    <Layout>
      <div className="p-6 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-vr-h1 text-vrtext-primary font-semibold">会员营销</h1>
          <p className="text-vr-body text-vrtext-tertiary mt-1">
            配置会员等级、充值档位和积分规则
          </p>
        </div>

        {/* 会员等级配置 */}
        <motion.div variants={staggerContainer} initial="initial" animate="animate">
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-vraccent-primary" />
            <h4 className="text-vr-h4 text-vrtext-primary">充值档位</h4>
          </div>
          <div className="space-y-3 max-w-3xl">
            {levels.map((l, i) => {
              const tier = tiers.find((t) => t.level === l.key) || { amount: 0, bonus: 0, level: l.key }
              return (
                <motion.div key={l.key} {...fadeInUp} className="grid grid-cols-5 gap-3 p-3 bg-vrbg-elevated rounded-lg items-end">
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
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">充值金额（元）</label>
                    <input
                      type="number"
                      value={tier.amount}
                      onChange={(e) => updateTierByLevel(l.key, 'amount', Number(e.target.value))}
                      className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">赠送金额（元）</label>
                    <input
                      type="number"
                      value={tier.bonus}
                      onChange={(e) => updateTierByLevel(l.key, 'bonus', Number(e.target.value))}
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
                  <button
                    onClick={() => removeLevelAndTier(i)}
                    className="p-2 rounded-lg text-vrtext-muted hover:text-vrerror hover:bg-vrerror/10 transition-colors self-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              )
            })}
            <button
              onClick={addLevelAndTier}
              className="flex items-center gap-2 px-4 py-2 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
            >
              <Plus className="w-4 h-4" />新增档位
            </button>
          </div>
        </motion.div>

        {/* 积分规则 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8 max-w-xl">
          <div className="flex items-center gap-2 mb-4">
            <Coins className="w-5 h-5 text-vraccent-primary" />
            <h4 className="text-vr-h4 text-vrtext-primary">积分规则</h4>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">消费积分比例（每消费1元得X积分）</label>
              <input
                type="number"
                step={0.1}
                value={points.earnRate}
                onChange={(e) => setPoints((p) => ({ ...p, earnRate: Number(e.target.value) }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
              />
            </div>
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">积分抵扣比例（X积分抵扣1元）</label>
              <input
                type="number"
                value={points.deductRate}
                onChange={(e) => setPoints((p) => ({ ...p, deductRate: Number(e.target.value) }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
              />
            </div>
          </div>
        </motion.div>

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
      </div>
    </Layout>
  )
}
