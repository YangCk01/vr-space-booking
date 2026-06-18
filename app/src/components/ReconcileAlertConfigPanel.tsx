import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSystemConfigs, updateSystemConfig } from '@/api/systemConfig'

function readSystemConfig<T>(configs: Array<{ key: string; value: any }> | undefined, key: string, fallback: T): T {
  const item = configs?.find((c) => c.key === key)
  return item ? item.value as T : fallback
}

export default function ReconcileAlertConfigPanel({ canWriteSettings = false }: { canWriteSettings?: boolean }) {
  const queryClient = useQueryClient()
  const { data: configs } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: () => getSystemConfigs(),
  })
  const [form, setForm] = useState({
    enabled: true,
    amountThreshold: 100,
    relativeRate: 1,
  })

  useEffect(() => {
    if (!configs) return
    const enabled = readSystemConfig<boolean>(configs, 'recon_alert_enabled', true)
    const amount = readSystemConfig<number>(
      configs,
      'recon_alert_amount_threshold',
      readSystemConfig<number>(configs, 'RECON_ALERT_ABSOLUTE_AMOUNT', 10000)
    )
    const rate = readSystemConfig<number>(configs, 'RECON_ALERT_RELATIVE_RATE', 0.01)
    setForm({
      enabled,
      amountThreshold: Math.round(amount / 100),
      relativeRate: Number((rate * 100).toFixed(2)),
    })
  }, [configs])

  const mutation = useMutation({
    mutationFn: async () => {
      const amountFen = Math.max(0, Math.round((Number(form.amountThreshold) || 0) * 100))
      const relative = Math.max(0, (Number(form.relativeRate) || 0) / 100)
      await Promise.all([
        updateSystemConfig('recon_alert_enabled', form.enabled),
        updateSystemConfig('recon_alert_amount_threshold', amountFen),
        updateSystemConfig('RECON_ALERT_ABSOLUTE_AMOUNT', amountFen),
        updateSystemConfig('RECON_ALERT_RELATIVE_RATE', relative),
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemConfigs'] })
      toast.success('对账告警配置已保存')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || '保存对账配置失败')
    },
  })

  return (
    <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-vr-body font-semibold text-vrtext-primary">对账告警配置</h3>
          <p className="text-vr-caption text-vrtext-tertiary mt-1">
            用于每日自动对账。超过金额或比例阈值时，系统会向管理员推送异常通知。
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-vr-body-sm text-vrtext-secondary">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
            disabled={!canWriteSettings}
            className="h-4 w-4 accent-blue-500"
          />
          启用告警
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <div>
          <label className="block text-vr-caption text-vrtext-secondary mb-1">金额阈值（元）</label>
          <input
            type="number"
            min={0}
            value={form.amountThreshold}
            onChange={(e) => setForm((p) => ({ ...p, amountThreshold: Number(e.target.value) }))}
            disabled={!canWriteSettings}
            className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary disabled:opacity-60"
          />
        </div>
        <div>
          <label className="block text-vr-caption text-vrtext-secondary mb-1">比例阈值（%）</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={form.relativeRate}
            onChange={(e) => setForm((p) => ({ ...p, relativeRate: Number(e.target.value) }))}
            disabled={!canWriteSettings}
            className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary disabled:opacity-60"
          />
        </div>
        {canWriteSettings && (
          <div className="flex items-end">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="h-9 px-4 rounded-lg bg-vraccent-primary text-white text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? '保存中...' : '保存对账配置'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
