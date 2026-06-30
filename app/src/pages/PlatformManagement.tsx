import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Save,
  Settings2,
  Ticket,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { getThirdPartyPlatformOverview, type ThirdPartyPlatformOverview } from '@/api/coupons'
import { getSystemConfigs, updateSystemConfig } from '@/api/systemConfig'
import { cn } from '@/lib/utils'

type PlatformSource = 'MEITUAN' | 'DOUYIN' | 'DIANPING'

interface PlatformConfig {
  enabled: boolean
  autoVerify: boolean
  settlementCycle: 'T+0' | 'T+1' | 'T+7' | 'MONTHLY'
  serviceRate: number
  merchantId: string
  contact: string
}

const CONFIG_KEY = 'third_party_platform_config'

const sourceLabelMap: Record<PlatformSource, string> = {
  MEITUAN: '美团',
  DOUYIN: '抖音',
  DIANPING: '大众点评',
}

const defaultConfigs: Record<PlatformSource, PlatformConfig> = {
  MEITUAN: {
    enabled: true,
    autoVerify: true,
    settlementCycle: 'T+1',
    serviceRate: 6,
    merchantId: 'MT-local-demo',
    contact: '未接入真实平台',
  },
  DOUYIN: {
    enabled: true,
    autoVerify: true,
    settlementCycle: 'T+1',
    serviceRate: 5,
    merchantId: 'DY-local-demo',
    contact: '未接入真实平台',
  },
  DIANPING: {
    enabled: true,
    autoVerify: false,
    settlementCycle: 'T+7',
    serviceRate: 6,
    merchantId: 'DP-local-demo',
    contact: '未接入真实平台',
  },
}

function formatYuan(value?: number) {
  return `¥${((value || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone = 'blue',
}: {
  label: string
  value: string | number
  hint: string
  icon: ReactNode
  tone?: 'blue' | 'green' | 'amber' | 'red'
}) {
  const toneClass = {
    blue: 'bg-vraccent-primary/10 text-vraccent-primary',
    green: 'bg-vrsuccess/10 text-vrsuccess',
    amber: 'bg-vrwarning/10 text-vrwarning',
    red: 'bg-vrerror/10 text-vrerror',
  }[tone]

  return (
    <div className="rounded-3xl border border-vrborder-subtle bg-vrbg-card p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-4">
        <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center', toneClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-vr-caption text-vrtext-muted">{label}</p>
          <p className="mt-1 text-vr-h2 text-vrtext-primary font-bold">{value}</p>
          <p className="mt-1 text-vr-caption text-vrtext-tertiary">{hint}</p>
        </div>
      </div>
    </div>
  )
}

export default function PlatformManagement() {
  const queryClient = useQueryClient()
  const [configs, setConfigs] = useState<Record<PlatformSource, PlatformConfig>>(defaultConfigs)
  const [saved, setSaved] = useState(false)

  const { data, isFetching, refetch } = useQuery<ThirdPartyPlatformOverview>({
    queryKey: ['third-party-platform-overview'],
    queryFn: getThirdPartyPlatformOverview,
    staleTime: 30 * 1000,
  })

  const { data: systemConfigs, isLoading: isLoadingConfigs } = useQuery({
    queryKey: ['system-configs'],
    queryFn: getSystemConfigs,
    staleTime: 0,
  })

  useEffect(() => {
    if (!systemConfigs) return
    const found = systemConfigs.find((c) => c.key === CONFIG_KEY)
    const stored = found?.value
    if (stored && typeof stored === 'object') {
      const merged: Record<PlatformSource, PlatformConfig> = { ...defaultConfigs }
      for (const source of Object.keys(defaultConfigs) as PlatformSource[]) {
        const patch = stored[source]
        if (patch && typeof patch === 'object') {
          merged[source] = { ...merged[source], ...patch }
        }
      }
      setConfigs(merged)
    }
  }, [systemConfigs])

  const saveMutation = useMutation({
    mutationFn: () => updateSystemConfig(CONFIG_KEY, configs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-configs'] })
      setSaved(true)
      toast.success('平台配置已保存')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '保存失败，请重试')
    },
  })

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 1800)
    return () => window.clearTimeout(timer)
  }, [saved])

  const platformRows = useMemo(() => {
    const rows = data?.platforms || []
    return (Object.keys(defaultConfigs) as PlatformSource[]).map((source) => {
      const stat = rows.find((item) => item.source === source)
      return {
        source,
        label: sourceLabelMap[source],
        stat,
        config: configs[source],
      }
    })
  }, [configs, data?.platforms])

  const updateConfig = (source: PlatformSource, patch: Partial<PlatformConfig>) => {
    setConfigs((prev) => ({
      ...prev,
      [source]: { ...prev[source], ...patch },
    }))
  }

  const saveConfigs = () => {
    saveMutation.mutate()
  }

  return (
    <Layout breadcrumb={['会员与营销', '平台管理']}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">平台管理</h1>
            <p className="mt-1 text-vr-body-sm text-vrtext-tertiary">
              管理美团、抖音、大众点评券码兑换、核销和结算配置
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-vrborder-subtle bg-vrbg-card text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-hover transition-colors"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              刷新数据
            </button>
            <button
              type="button"
              onClick={saveConfigs}
              disabled={saveMutation.isPending || isLoadingConfigs}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-vraccent-primary text-white font-medium hover:bg-vraccent-primary/90 transition-colors shadow-[0_10px_24px_rgba(59,130,246,0.24)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? '保存中…' : saved ? '已保存' : '保存配置'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="已绑定券码"
            value={data?.summary.total || 0}
            hint="C端兑换并进入本地券库"
            icon={<Ticket className="h-5 w-5" />}
          />
          <SummaryCard
            label="可用券码"
            value={data?.summary.unused || 0}
            hint="可被线上支付或B端收款抵扣"
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="green"
          />
          <SummaryCard
            label="已用券码"
            value={data?.summary.used || 0}
            hint="已被订单锁定或完成抵扣"
            icon={<Clock className="h-5 w-5" />}
            tone="amber"
          />
          <SummaryCard
            label="累计抵扣"
            value={formatYuan(data?.summary.usedDiscountAmount)}
            hint="平台券实际抵扣金额"
            icon={<Building2 className="h-5 w-5" />}
            tone="blue"
          />
        </div>

        <div className="rounded-3xl border border-vrborder-subtle bg-vrbg-card overflow-hidden shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between border-b border-vrborder-subtle px-5 py-4">
            <div>
              <h2 className="text-vr-h3 text-vrtext-primary font-semibold">平台接入配置</h2>
              <p className="mt-1 text-vr-caption text-vrtext-muted">
                当前先跑通本地券码流程，真实平台接口接入后沿用这些开关和结算信息。
              </p>
            </div>
            <Settings2 className="h-5 w-5 text-vrtext-muted" />
          </div>
          <div className="divide-y divide-vrborder-subtle">
            {platformRows.map(({ source, label, stat, config }) => (
              <div key={source} className="grid gap-4 px-5 py-4 xl:grid-cols-[180px_1fr_280px]">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => updateConfig(source, { enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <span className="h-6 w-11 rounded-full bg-vrbg-elevated ring-1 ring-vrborder-subtle transition peer-checked:bg-vraccent-primary" />
                    <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                  </label>
                  <div>
                    <p className="text-vr-body font-semibold text-vrtext-primary">{label}</p>
                    <p className="text-vr-caption text-vrtext-muted">
                      {config.enabled ? '已启用' : '已停用'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-vrbg-elevated px-4 py-3">
                    <p className="text-vr-caption text-vrtext-muted">券码总数</p>
                    <p className="mt-1 text-vr-body font-semibold text-vrtext-primary">{stat?.total || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-vrbg-elevated px-4 py-3">
                    <p className="text-vr-caption text-vrtext-muted">可用/已用</p>
                    <p className="mt-1 text-vr-body font-semibold text-vrtext-primary">
                      {stat?.unused || 0} / {stat?.used || 0}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-vrbg-elevated px-4 py-3">
                    <p className="text-vr-caption text-vrtext-muted">绑定用户</p>
                    <p className="mt-1 text-vr-body font-semibold text-vrtext-primary">{stat?.userCount || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-vrbg-elevated px-4 py-3">
                    <p className="text-vr-caption text-vrtext-muted">已抵扣</p>
                    <p className="mt-1 text-vr-body font-semibold text-vrtext-primary">
                      {formatYuan(stat?.usedDiscountAmount)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <input
                    value={config.merchantId}
                    onChange={(e) => updateConfig(source, { merchantId: e.target.value })}
                    className="soft-input h-9 px-3 text-vr-body-sm"
                    placeholder="平台商户号"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={config.settlementCycle}
                      onChange={(e) => updateConfig(source, { settlementCycle: e.target.value as PlatformConfig['settlementCycle'] })}
                      className="soft-input h-9 px-3 text-vr-body-sm"
                    >
                      <option value="T+0">T+0</option>
                      <option value="T+1">T+1</option>
                      <option value="T+7">T+7</option>
                      <option value="MONTHLY">月结</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.serviceRate}
                      onChange={(e) => updateConfig(source, { serviceRate: Number(e.target.value) })}
                      className="soft-input h-9 px-3 text-vr-body-sm"
                      placeholder="费率%"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-xl bg-vrbg-elevated px-3 py-2 text-vr-caption text-vrtext-secondary">
                    自动验券核销
                    <input
                      type="checkbox"
                      checked={config.autoVerify}
                      onChange={(e) => updateConfig(source, { autoVerify: e.target.checked })}
                      className="h-4 w-4 accent-vraccent-primary"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-vrborder-subtle bg-vrbg-card overflow-hidden shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div className="border-b border-vrborder-subtle px-5 py-4">
              <h2 className="text-vr-h3 text-vrtext-primary font-semibold">最近券码</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-vr-body-sm">
                <thead className="bg-vrbg-elevated text-vrtext-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">平台</th>
                    <th className="px-5 py-3 font-medium">券名</th>
                    <th className="px-5 py-3 font-medium">用户</th>
                    <th className="px-5 py-3 font-medium">抵扣</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vrborder-subtle">
                  {(data?.recentCoupons || []).map((coupon) => (
                    <tr key={coupon.id} className="hover:bg-vrbg-hover">
                      <td className="px-5 py-3 text-vrtext-primary">{sourceLabelMap[coupon.source]}</td>
                      <td className="px-5 py-3">
                        <p className="text-vrtext-primary">{coupon.name}</p>
                        <p className="mt-0.5 text-vr-caption text-vrtext-muted font-mono">{coupon.code}</p>
                      </td>
                      <td className="px-5 py-3 text-vrtext-secondary">
                        {coupon.user?.name || coupon.user?.phone || '-'}
                      </td>
                      <td className="px-5 py-3 text-vrtext-primary">{formatYuan(coupon.discountAmount)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-1 text-vr-caption font-medium',
                            coupon.status === 'UNUSED' && 'bg-vraccent-primary/10 text-vraccent-primary',
                            coupon.status === 'USED' && 'bg-vrsuccess/10 text-vrsuccess',
                            coupon.status === 'EXPIRED' && 'bg-vrtext-muted/10 text-vrtext-muted',
                          )}
                        >
                          {coupon.status === 'UNUSED' ? '可用' : coupon.status === 'USED' ? '已使用' : '已过期'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(data?.recentCoupons || []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-vrtext-muted">
                        暂无平台券码记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-vrborder-subtle bg-vrbg-card p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-vrwarning" />
              <h2 className="text-vr-h3 text-vrtext-primary font-semibold">使用限制</h2>
            </div>
            <div className="mt-4 space-y-3 text-vr-body-sm text-vrtext-secondary">
              <p>1. 一个订单只能使用一张优惠券，系统券和平台券不能叠加。</p>
              <p>2. 平台券在订单创建或支付时立即锁定，防止同一券码被重复使用。</p>
              <p>3. 未付款订单取消或超时后，平台券自动恢复为可用。</p>
              <p>4. 已付款、已核销、退款中的订单不允许再补用平台券。</p>
              <p>5. 真实平台未接入前，以本地券码状态作为唯一核销依据。</p>
            </div>
          </div>
        </div>
      </motion.div>
    </Layout>
  )
}
