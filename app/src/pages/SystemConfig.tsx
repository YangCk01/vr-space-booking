import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Save,
  Check,
  RotateCcw,
  Settings2,
  UserCog,
  Coins,
  AlertTriangle,
  Layers,
  Clock,
  User,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getSystemConfigs, updateSystemConfig } from '@/api/systemConfig'
import type { SystemConfig } from '@/api/systemConfig'

const configMetaMap: Record<string, { label: string; desc: string; category: string }> = {
  member_level_thresholds: { label: '等级消费阈值', desc: '各会员等级所需的累计消费金额（分），用逗号分隔', category: 'member' },
  member_discount_rates: { label: '等级折扣率', desc: '各会员等级对应的订单折扣率（%），用逗号分隔', category: 'member' },
  member_level_names: { label: '等级名称', desc: '各会员等级的显示名称，JSON数组格式', category: 'member' },
  points_earn_ratio: { label: '积分获取比例', desc: '消费1元可获得的积分数', category: 'points' },
  points_deduct_ratio: { label: '积分抵扣比例', desc: '多少积分可抵扣1元', category: 'points' },
  points_gift_daily_limit: { label: '单日积分赠送上限', desc: '单个用户每日最多可被赠送的积分数（分）', category: 'points' },
  coupon_gift_daily_limit: { label: '单日券赠送上限', desc: '单个用户每日最多可被赠送的券张数', category: 'points' },
  dormant_days: { label: '沉睡天数阈值', desc: '超过此天数无消费即标记为沉睡用户', category: 'member' },
  recon_alert_enabled: { label: '对账告警开关', desc: '是否启用对账异常自动推送通知', category: 'recon' },
  recon_alert_amount_threshold: { label: '对账告警金额阈值', desc: '差异金额超过此值（分）即触发告警', category: 'recon' },
}

const categoryMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  member: { label: '会员规则', icon: UserCog },
  points: { label: '积分规则', icon: Coins },
  recon: { label: '对账告警', icon: AlertTriangle },
  other: { label: '其他', icon: Layers },
}

function formatDateTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ConfigGroup({
  category,
  configs,
  values,
  onChange,
}: {
  category: string
  configs: SystemConfig[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  const meta = categoryMeta[category] || categoryMeta.other
  const Icon = meta.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-vrborder-subtle bg-vrbg-elevated/50">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-vraccent-primary" />
          <h2 className="text-vr-h4 text-vrtext-primary font-semibold">{meta.label}</h2>
        </div>
      </div>
      <div className="p-5 space-y-5">
        {configs.map((cfg) => {
          const meta = configMetaMap[cfg.key] || { label: cfg.key, desc: '', category: 'other' }
          return (
          <div key={cfg.key} className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6">
            <div className="sm:w-[200px] shrink-0">
              <label className="text-vr-body-sm text-vrtext-primary font-medium">{meta.label}</label>
              {meta.desc && (
                <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{meta.desc}</p>
              )}
            </div>
            <div className="flex-1">
              {cfg.type === 'boolean' ? (
                <Switch
                  checked={values[cfg.key] === 'true'}
                  onCheckedChange={(v) => onChange(cfg.key, String(v))}
                />
              ) : cfg.type === 'number' ? (
                <input
                  type="number"
                  value={values[cfg.key] ?? cfg.value}
                  onChange={(e) => onChange(cfg.key, e.target.value)}
                  className="w-full sm:w-[240px] h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                />
              ) : (
                <input
                  type="text"
                  value={values[cfg.key] ?? cfg.value}
                  onChange={(e) => onChange(cfg.key, e.target.value)}
                  className="w-full sm:w-[320px] h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                />
              )}
            </div>
            {(cfg.updatedByName || cfg.updatedAt) && (
              <div className="sm:w-[180px] shrink-0 text-right">
                <div className="flex items-center justify-end gap-1 text-vr-caption text-vrtext-tertiary">
                  <User className="w-3 h-3" />
                  {cfg.updatedByName || cfg.updatedBy || '-'}
                </div>
                <div className="flex items-center justify-end gap-1 text-vr-caption text-vrtext-muted mt-0.5">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(cfg.updatedAt)}
                </div>
              </div>
            )}
          </div>
        )})}
      </div>
    </motion.div>
  )
}

export default function SystemConfig() {
  const queryClient = useQueryClient()
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({})

  const { data: configs, isLoading } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: () => getSystemConfigs(),
  })

  const mutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      return updateSystemConfig(key, value)
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['systemConfigs'] })
      setSavedMap((prev) => ({ ...prev, [vars.key]: true }))
      setTimeout(() => {
        setSavedMap((prev) => ({ ...prev, [vars.key]: false }))
      }, 2000)
    },
    onError: (err: any) => {
      alert('保存失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
    },
  })

  const handleChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = (key: string) => {
    const value = editedValues[key]
    if (value === undefined) return
    mutation.mutate({ key, value })
  }

  const grouped = (configs || []).reduce<Record<string, SystemConfig[]>>((acc, cfg) => {
    const meta = configMetaMap[cfg.key]
    const cat = meta?.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(cfg)
    return acc
  }, {})

  // Sort categories by defined order
  const categoryOrder = ['member', 'points', 'recon', 'other']
  const sortedCategories = categoryOrder.filter((c) => grouped[c]?.length > 0)

  return (
    <Layout breadcrumb={['设置', '业务规则']}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-vrtext-primary">业务规则配置</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">会员、积分、对账等核心业务规则管理</p>
          </div>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-vrtext-muted" />
            <span className="text-vr-caption text-vrtext-muted">修改后立即生效</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RotateCcw className="w-5 h-5 animate-spin text-vrtext-muted" />
            <span className="text-vr-body text-vrtext-muted ml-2">加载中...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedCategories.map((category) => (
              <ConfigGroup
                key={category}
                category={category}
                configs={grouped[category]}
                values={editedValues}
                onChange={handleChange}
              />
            ))}

            {/* Global Save Bar */}
            {Object.keys(editedValues).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="sticky bottom-4 bg-vrbg-card border border-vrborder-subtle rounded-xl p-4 flex items-center justify-between shadow-lg"
              >
                <span className="text-vr-body-sm text-vrtext-secondary">
                  已修改 <span className="text-vraccent-primary font-medium">{Object.keys(editedValues).length}</span> 项配置
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditedValues({})}
                    className="h-10 px-5 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      Object.entries(editedValues).forEach(([key, value]) => {
                        mutation.mutate({ key, value })
                      })
                      setEditedValues({})
                    }}
                    disabled={mutation.isPending}
                    className={cn(
                      'inline-flex items-center gap-2 h-10 px-5 rounded-lg text-vr-body-sm font-medium transition-all',
                      mutation.isPending
                        ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
                        : 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover'
                    )}
                  >
                    {mutation.isPending ? (
                      <><RotateCcw className="w-4 h-4 animate-spin" />保存中...</>
                    ) : (
                      <><Save className="w-4 h-4" />保存全部</>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Per-item save feedback */}
            {Object.entries(savedMap).some(([, v]) => v) && (
              <div className="fixed bottom-6 right-6 z-50">
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="bg-vrsuccess/90 text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span className="text-vr-body-sm font-medium">配置已保存并生效</span>
                </motion.div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </Layout>
  )
}
