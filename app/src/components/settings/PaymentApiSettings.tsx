import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CreditCard, Link, Check, Save, RotateCcw, TestTube } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { bulkSaveSettings } from '@/api/settings'
import { getFinanceAuditConfig, updateFinanceAuditConfig } from '@/api/finance'

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number]

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

const defaultPaymentFeeRates = {
  WECHAT: 0.6,
  ALIPAY: 0.6,
  CASH: 0,
  BALANCE: 0,
  BALANCE_POINTS: 0,
  CARD: 0.6,
}

const defaultPlatformFeeRates = {
  MEITUAN: 6,
  DOUYIN: 5,
  DIANPING: 6,
}

const defaultSettlementCycles = {
  WECHAT: 'T+1',
  ALIPAY: 'T+1',
  CASH: '实时',
  BALANCE: '实时',
  BALANCE_POINTS: '实时',
  CARD: 'T+1',
  MEITUAN: 'T+3',
  DOUYIN: 'T+3',
  DIANPING: 'T+7',
}

const paymentFeeRateLabels: Record<string, string> = {
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  CASH: '现金支付',
  BALANCE: '储值余额',
  BALANCE_POINTS: '积分抵扣',
  CARD: '银行卡',
}

const platformFeeRateLabels: Record<string, string> = {
  MEITUAN: '美团',
  DOUYIN: '抖音',
  DIANPING: '大众点评',
}

const settlementCycleLabels: Record<string, string> = {
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  CASH: '现金支付',
  BALANCE: '储值余额',
  BALANCE_POINTS: '积分抵扣',
  CARD: '银行卡',
  MEITUAN: '美团',
  DOUYIN: '抖音',
  DIANPING: '大众点评',
}

export function PaymentApiSettings({ settings }: { settings?: Record<string, any> }) {
  const s = settings || {}
  const queryClient = useQueryClient()

  const { data: auditConfig } = useQuery({
    queryKey: ['finance-audit-config'],
    queryFn: getFinanceAuditConfig,
  })

  const mergeConfig = <T extends Record<string, any>>(defaults: T, configValue?: Partial<T> | Record<string, any>): T =>
    ({ ...defaults, ...(configValue || {}) }) as T

  const [methods, setMethods] = useState([
    { name: '微信支付', key: 'payment_wechat', enabled: s.payment_wechat?.value ?? true },
    { name: '支付宝', key: 'payment_alipay', enabled: s.payment_alipay?.value ?? true },
    { name: '现金支付', key: 'payment_cash', enabled: s.payment_cash?.value ?? true },
  ])

  const [taxRate, setTaxRate] = useState(6)
  const [paymentFeeRates, setPaymentFeeRates] = useState(defaultPaymentFeeRates)
  const [platformFeeRates, setPlatformFeeRates] = useState(defaultPlatformFeeRates)
  const [settlementCycles, setSettlementCycles] = useState(defaultSettlementCycles)

  const [refund, setRefund] = useState({
    enabled: true,
    fullHours: s.payment_full_refund_hours?.value ?? 24,
    partialPercent: s.payment_partial_refund_rate?.value ?? 50,
  })

  const [apis, setApis] = useState([
    { name: '微信支付API', status: s.wechat_mchid?.value ? 'configured' : 'unconfigured', testing: false },
    { name: '支付宝API', status: s.alipay_appid?.value ? 'configured' : 'unconfigured', testing: false },
    { name: '短信服务（阿里云）', status: s.sms_access_key?.value ? 'configured' : 'unconfigured', testing: false },
    { name: '微信小程序', status: s.wxmini_appid?.value ? 'configured' : 'unconfigured', testing: false },
  ])

  const [form, setForm] = useState({
    wechatMchid: s.wechat_mchid?.value ?? '',
    wechatApiKey: s.wechat_api_key?.value ?? '',
    alipayAppid: s.alipay_appid?.value ?? '',
    alipayPrivateKey: s.alipay_private_key?.value ?? '',
    smsAccessKey: s.sms_access_key?.value ?? '',
    smsSecret: s.sms_secret?.value ?? '',
    wxminiAppid: s.wxmini_appid?.value ?? '',
  })

  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settings) return
    const s = settings
    setMethods([
      { name: '微信支付', key: 'payment_wechat', enabled: s.payment_wechat?.value ?? true },
      { name: '支付宝', key: 'payment_alipay', enabled: s.payment_alipay?.value ?? true },
      { name: '现金支付', key: 'payment_cash', enabled: s.payment_cash?.value ?? true },
    ])
    setRefund({
      enabled: true,
      fullHours: s.payment_full_refund_hours?.value ?? 24,
      partialPercent: s.payment_partial_refund_rate?.value ?? 50,
    })
    setApis([
      { name: '微信支付API', status: s.wechat_mchid?.value ? 'configured' : 'unconfigured', testing: false },
      { name: '支付宝API', status: s.alipay_appid?.value ? 'configured' : 'unconfigured', testing: false },
      { name: '短信服务（阿里云）', status: s.sms_access_key?.value ? 'configured' : 'unconfigured', testing: false },
      { name: '微信小程序', status: s.wxmini_appid?.value ? 'configured' : 'unconfigured', testing: false },
    ])
    setForm({
      wechatMchid: s.wechat_mchid?.value ?? '',
      wechatApiKey: s.wechat_api_key?.value ?? '',
      alipayAppid: s.alipay_appid?.value ?? '',
      alipayPrivateKey: s.alipay_private_key?.value ?? '',
      smsAccessKey: s.sms_access_key?.value ?? '',
      smsSecret: s.sms_secret?.value ?? '',
      wxminiAppid: s.wxmini_appid?.value ?? '',
    })
  }, [settings])

  useEffect(() => {
    if (!auditConfig) return
    setTaxRate(auditConfig.taxRate ?? 6)
    setPaymentFeeRates(mergeConfig(defaultPaymentFeeRates, auditConfig.paymentFeeRates))
    setPlatformFeeRates(mergeConfig(defaultPlatformFeeRates, auditConfig.platformFeeRates))
    setSettlementCycles(mergeConfig(defaultSettlementCycles, auditConfig.settlementCycles))
  }, [auditConfig])

  const mutation = useMutation({
    mutationFn: bulkSaveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const auditMutation = useMutation({
    mutationFn: updateFinanceAuditConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-audit-config'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const toggleMethod = (idx: number) => {
    setMethods((p) => p.map((m, i) => (i === idx ? { ...m, enabled: !m.enabled } : m)))
  }

  const testApi = (idx: number) => {
    setApis((p) => p.map((a, i) => (i === idx ? { ...a, testing: true } : a)))
    setTimeout(() => {
      setApis((p) => p.map((a, i) => (i === idx ? { ...a, testing: false, status: a.status === 'unconfigured' ? 'unconfigured' : 'configured' } : a)))
    }, 1500)
  }

  const handleSave = async () => {
    await mutation.mutateAsync([
      { key: 'payment_wechat', value: methods[0].enabled, category: 'payment' },
      { key: 'payment_alipay', value: methods[1].enabled, category: 'payment' },
      { key: 'payment_cash', value: methods[2].enabled, category: 'payment' },
      { key: 'payment_full_refund_hours', value: refund.fullHours, category: 'payment' },
      { key: 'payment_partial_refund_rate', value: refund.partialPercent, category: 'payment' },
      { key: 'wechat_mchid', value: form.wechatMchid, category: 'payment' },
      { key: 'wechat_api_key', value: form.wechatApiKey, category: 'payment' },
      { key: 'alipay_appid', value: form.alipayAppid, category: 'payment' },
      { key: 'alipay_private_key', value: form.alipayPrivateKey, category: 'payment' },
      { key: 'sms_access_key', value: form.smsAccessKey, category: 'payment' },
      { key: 'sms_secret', value: form.smsSecret, category: 'payment' },
      { key: 'wxmini_appid', value: form.wxminiAppid, category: 'payment' },
    ])
    await auditMutation.mutateAsync({
      taxRate,
      paymentFeeRates,
      platformFeeRates,
      settlementCycles,
    })
  }

  const apiFields = [
    { label: '微信支付商户号', key: 'wechatMchid', type: 'text' },
    { label: '微信支付 API Key', key: 'wechatApiKey', type: 'password' },
    { label: '支付宝 AppID', key: 'alipayAppid', type: 'text' },
    { label: '支付宝私钥', key: 'alipayPrivateKey', type: 'password' },
    { label: '短信服务 AccessKey', key: 'smsAccessKey', type: 'text' },
    { label: '短信服务 Secret', key: 'smsSecret', type: 'password' },
    { label: '微信小程序 AppID', key: 'wxminiAppid', type: 'text' },
  ] as const

  return (
    <div className="space-y-6">
      <h2 className="text-vr-h2 text-vrtext-primary">支付与接口</h2>

      {/* 支付方式 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-vrbg-elevated rounded-xl p-5">
        <h4 className="text-vr-h4 text-vrtext-primary mb-4">支付方式</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {methods.map((m, i) => (
            <div key={m.name} className="flex items-center justify-between p-3 bg-vrbg-surface rounded-lg border border-vrborder-subtle">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-vrtext-secondary" />
                <div>
                  <p className="text-vr-body-sm text-vrtext-primary">{m.name}</p>
                  <p className="text-vr-caption text-vrtext-tertiary">{m.enabled ? '已启用' : '已停用'}</p>
                </div>
              </div>
              <Switch checked={m.enabled} onCheckedChange={() => toggleMethod(i)} />
            </div>
          ))}
        </div>
      </motion.div>

      {/* 默认税率 + 支付通道费率 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-vrbg-elevated rounded-xl p-5">
          <h4 className="text-vr-h4 text-vrtext-primary mb-4">默认税率 (%)</h4>
          <div className="flex items-center justify-between p-3 bg-vrbg-surface rounded-lg border border-vrborder-subtle">
            <span className="text-vr-body-sm text-vrtext-primary">增值税默认税率</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
              className="w-24 h-9 px-2 text-right bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
            />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-vrbg-elevated rounded-xl p-5">
          <h4 className="text-vr-h4 text-vrtext-primary mb-4">支付通道费率 (%)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Object.entries(paymentFeeRates).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-vrbg-surface rounded-lg border border-vrborder-subtle">
                <span className="text-vr-body-sm text-vrtext-primary">{paymentFeeRateLabels[key] || key}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={value}
                  onChange={(e) => setPaymentFeeRates((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
                  className="w-20 h-9 px-2 text-right bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* 平台服务费 + 结算周期 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-vrbg-elevated rounded-xl p-5">
          <h4 className="text-vr-h4 text-vrtext-primary mb-4">平台服务费 (%)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Object.entries(platformFeeRates).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-vrbg-surface rounded-lg border border-vrborder-subtle">
                <span className="text-vr-body-sm text-vrtext-primary">{platformFeeRateLabels[key] || key}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={value}
                  onChange={(e) => setPlatformFeeRates((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
                  className="w-20 h-9 px-2 text-right bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-vrbg-elevated rounded-xl p-5">
          <h4 className="text-vr-h4 text-vrtext-primary mb-4">结算周期</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Object.entries(settlementCycles).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-vrbg-surface rounded-lg border border-vrborder-subtle">
                <span className="text-vr-body-sm text-vrtext-primary">{settlementCycleLabels[key] || key}</span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setSettlementCycles((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-24 h-9 px-2 text-right bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* 退款规则 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-vrbg-elevated rounded-xl p-5">
        <h4 className="text-vr-h4 text-vrtext-primary mb-4">退款规则</h4>
        <div className="flex items-center justify-between mb-4">
          <span className="text-vr-body-sm text-vrtext-primary">是否支持退款</span>
          <Switch checked={refund.enabled} onCheckedChange={(v) => setRefund((p) => ({ ...p, enabled: v }))} />
        </div>
        {refund.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">开场前X小时可全额退款</label>
              <input
                type="number"
                value={refund.fullHours}
                onChange={(e) => setRefund((p) => ({ ...p, fullHours: Number(e.target.value) }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
              />
            </div>
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">开场前X小时内退款比例(%)</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={refund.partialPercent}
                  onChange={(e) => setRefund((p) => ({ ...p, partialPercent: Number(e.target.value) }))}
                  className="flex-1 accent-[#3B82F6]"
                />
                <span className="text-vr-body-sm text-vrtext-primary w-12 text-right">{refund.partialPercent}%</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* 第三方接口状态 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-vrbg-elevated rounded-xl p-5">
        <h4 className="text-vr-h4 text-vrtext-primary mb-4">第三方接口状态</h4>
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {apis.map((a, i) => (
            <motion.div key={a.name} {...fadeInUp} className="flex items-center justify-between p-3 bg-vrbg-surface rounded-lg border border-vrborder-subtle">
              <div className="flex items-center gap-3">
                <Link className="w-5 h-5 text-vrtext-secondary" />
                <div>
                  <p className="text-vr-body-sm text-vrtext-primary">{a.name}</p>
                  <p className={cn('text-vr-caption', a.status === 'configured' ? 'text-vrsuccess' : 'text-vrtext-muted')}>
                    {a.status === 'configured' ? '已配置' : '未配置'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-md text-vr-caption text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors">
                  {a.status === 'configured' ? '编辑' : '配置'}
                </button>
                {a.status === 'configured' && (
                  <button
                    onClick={() => testApi(i)}
                    disabled={a.testing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-vr-caption text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors disabled:opacity-50"
                  >
                    {a.testing ? <RotateCcw className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                    {a.testing ? '测试中' : '测试'}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* 接口密钥配置 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-vrbg-elevated rounded-xl p-5">
        <h4 className="text-vr-h4 text-vrtext-primary mb-4">接口密钥配置</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {apiFields.map((f) => (
            <motion.div key={f.key} {...fadeInUp}>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">{f.label}</label>
              <input
                type={f.type}
                value={form[f.key as keyof typeof form]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* 保存按钮 */}
      <motion.div {...fadeInUp} className="pt-2">
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
  )
}
