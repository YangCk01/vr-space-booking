import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings as SettingsIcon,
  Calendar,
  CreditCard,
  Bell,
  Shield,
  FileText,
  Link,
  Check,
  Save,
  Plus,
  RotateCcw,
  TestTube,
  ChevronRight,
  Search,
  CalendarDays,
  ChevronLeft,
  Activity,
  User,
  Users,
  Home,
  Package,
  Bookmark,
  Trash2,
  Gift,
  LayoutDashboard,
  Building2,
  Gamepad2,
  ClipboardList,
  BarChart3,
  Wallet,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import { getSettings, bulkSaveSettings } from '@/api/settings'
import { uploadFile } from '@/api/upload'
import { getLogs, getLogTypes } from '@/api/logs'
import type { OperationLog } from '@/api/logs'
import { getImageUrl } from '@/lib/imageUrl'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SettingCategory {
  key: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const categories: SettingCategory[] = [
  { key: 'basic', icon: SettingsIcon, title: '基本设置', desc: '系统基本信息设置' },
  { key: 'booking', icon: Calendar, title: '预约设置', desc: '预约规则与时段设置' },
  { key: 'payment', icon: CreditCard, title: '支付与接口', desc: '支付方式与第三方接口配置' },
  { key: 'notification', icon: Bell, title: '通知设置', desc: '短信/微信通知设置' },
  { key: 'permission', icon: Shield, title: '权限管理', desc: '角色权限分配管理' },
  { key: 'log', icon: FileText, title: '日志管理', desc: '系统操作日志查看' },
]

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number]

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/* ---- Basic Settings ---- */
function BasicSettings({ settings }: { settings?: Record<string, any> }) {
  const s = settings || {}
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    venueName: s.venue_name?.value ?? 'VR大空间体验馆',
    address: s.venue_address?.value ?? '北京市朝阳区xxx',
    phone: s.venue_phone?.value ?? '400-888-0000',
    hours: s.venue_hours?.value ?? '09:00-22:00',
    description: s.venue_description?.value ?? 'VR大空间体验馆提供沉浸式虚拟现实体验，支持多人联机互动。',
    logo: s.logo?.value ?? '',
    serviceQr: s.service_qr?.value ?? '',
    announcement: s.announcement?.value ?? '',
    maxVenues: String(s.max_venues?.value ?? 10),
  })
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: bulkSaveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSave = () => {
    mutation.mutate([
      { key: 'venue_name', value: form.venueName, category: 'basic' },
      { key: 'venue_address', value: form.address, category: 'basic' },
      { key: 'venue_phone', value: form.phone, category: 'basic' },
      { key: 'venue_hours', value: form.hours, category: 'basic' },
      { key: 'venue_description', value: form.description, category: 'basic' },
      { key: 'logo', value: form.logo, category: 'basic' },
      { key: 'service_qr', value: form.serviceQr, category: 'basic' },
      { key: 'announcement', value: form.announcement, category: 'basic' },
      { key: 'max_venues', value: Number(form.maxVenues), category: 'basic' },
    ])
  }

  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const uploadImage = async (file: File, type: 'logo' | 'serviceQr') => {
    const setLoading = type === 'logo' ? setUploadingLogo : setUploadingQr
    setLoading(true)
    try {
      const result = await uploadFile('logos', file)
      update(type, result.url)
    } catch (err) {
      alert('上传失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-vr-h2 text-vrtext-primary mb-6">基本设置</h2>
      <motion.div className="space-y-5 max-w-xl" variants={staggerContainer} initial="initial" animate="animate">
        {[
          { label: '场馆名称', key: 'venueName', type: 'text' },
          { label: '场馆地址', key: 'address', type: 'text' },
          { label: '联系电话', key: 'phone', type: 'text' },
          { label: '营业时间', key: 'hours', type: 'text' },
          { label: '门店数量上限', key: 'maxVenues', type: 'number' },
        ].map((f) => (
          <motion.div key={f.key} {...fadeInUp}>
            <label className="block text-vr-caption text-vrtext-secondary mb-1">{f.label}</label>
            <input
              type={f.type}
              value={form[f.key as keyof typeof form]}
              onChange={(e) => update(f.key, e.target.value)}
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            />
          </motion.div>
        ))}
        <motion.div {...fadeInUp}>
          <label className="block text-vr-caption text-vrtext-secondary mb-1">场馆简介</label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
          />
        </motion.div>
        <motion.div {...fadeInUp}>
          <label className="block text-vr-caption text-vrtext-secondary mb-1">首页公告</label>
          <textarea
            rows={2}
            value={form.announcement}
            onChange={(e) => update('announcement', e.target.value)}
            placeholder="显示在管理后台首页顶部的滚动公告..."
            className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
          />
        </motion.div>
        <motion.div {...fadeInUp}>
          <label className="block text-vr-caption text-vrtext-secondary mb-1">系统 Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-vrbg-surface border border-vrborder-subtle rounded-lg flex items-center justify-center overflow-hidden">
              <img src={form.logo ? getImageUrl(form.logo) : '/logo.svg'} alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <label className="px-4 py-2 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors cursor-pointer relative">
              {uploadingLogo ? '上传中...' : '上传新Logo'}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingLogo}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadImage(file, 'logo')
                }}
              />
            </label>
          </div>
        </motion.div>
        <motion.div {...fadeInUp}>
          <label className="block text-vr-caption text-vrtext-secondary mb-1">客服微信二维码</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-vrbg-surface border border-vrborder-subtle rounded-lg flex items-center justify-center overflow-hidden">
              {form.serviceQr ? (
                <img src={getImageUrl(form.serviceQr)} alt="QR" className="w-14 h-14 object-contain" />
              ) : (
                <span className="text-vr-caption text-vrtext-muted">无</span>
              )}
            </div>
            <label className="px-4 py-2 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors cursor-pointer relative">
              {uploadingQr ? '上传中...' : '上传二维码'}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingQr}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadImage(file, 'serviceQr')
                }}
              />
            </label>
          </div>
        </motion.div>
        <motion.div {...fadeInUp} className="pt-4">
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
    </div>
  )
}

/* ---- Booking Settings ---- */
function BookingSettings({ settings }: { settings?: Record<string, any> }) {
  const s = settings || {}
  const queryClient = useQueryClient()
  const [values, setValues] = useState({
    interval: String(s.booking_interval?.value ?? 30),
    minDuration: s.booking_min_duration?.value ?? 30,
    maxDuration: s.booking_max_duration?.value ?? 240,
    advanceDays: s.booking_advance_days?.value ?? 7,
    cancelHours: s.booking_cancel_hours?.value ?? 2,
    refundRate: s.booking_refund_rate?.value ?? 50,
    allowOvertime: s.booking_allow_overtime?.value ?? false,
    overtimeMinutes: s.booking_overtime_minutes?.value ?? 10,
  })
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: bulkSaveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const update = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }))

  const handleSave = () => {
    mutation.mutate([
      { key: 'booking_advance_days', value: values.advanceDays, category: 'booking' },
      { key: 'booking_interval', value: Number(values.interval), category: 'booking' },
      { key: 'booking_min_duration', value: values.minDuration, category: 'booking' },
      { key: 'booking_max_duration', value: values.maxDuration, category: 'booking' },
      { key: 'booking_cancel_hours', value: values.cancelHours, category: 'booking' },
      { key: 'booking_refund_rate', value: values.refundRate, category: 'booking' },
      { key: 'booking_allow_overtime', value: values.allowOvertime, category: 'booking' },
      { key: 'booking_overtime_minutes', value: values.overtimeMinutes, category: 'booking' },
    ])
  }

  return (
    <div>
      <h2 className="text-vr-h2 text-vrtext-primary mb-6">预约设置</h2>
      <motion.div className="space-y-5 max-w-xl" variants={staggerContainer} initial="initial" animate="animate">
        {[
          { label: '预约时段间隔', key: 'interval', type: 'select', options: ['15', '30', '60'], desc: '每个预约时段的时长间隔' },
          { label: '最短预约时长（分钟）', key: 'minDuration', type: 'number', desc: '单次预约的最短时长' },
          { label: '最长预约时长（分钟）', key: 'maxDuration', type: 'number', desc: '单次预约的最长时长' },
          { label: '可提前预约天数', key: 'advanceDays', type: 'number', desc: '用户可提前多少天预约' },
          { label: '取消预约时限（小时）', key: 'cancelHours', type: 'number', desc: '开场前多少小时可取消预约' },
          { label: '退款比例(%)', key: 'refundRate', type: 'number', desc: '开场前X小时内退款比例' },
        ].map((f) => (
          <motion.div key={f.key} {...fadeInUp}>
            <label className="block text-vr-caption text-vrtext-secondary mb-1">{f.label}</label>
            {f.type === 'select' ? (
              <select
                value={values[f.key as keyof typeof values] as string}
                onChange={(e) => update(f.key, e.target.value)}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                {f.options?.map((o) => <option key={o} value={o}>{o}分钟</option>)}
              </select>
            ) : (
              <input
                type="number"
                value={values[f.key as keyof typeof values] as number}
                onChange={(e) => update(f.key, Number(e.target.value))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            )}
            <p className="mt-1 text-vr-caption text-vrtext-tertiary">{f.desc}</p>
          </motion.div>
        ))}
        <motion.div {...fadeInUp} className="flex items-center justify-between py-2">
          <div>
            <label className="block text-vr-body-sm text-vrtext-primary">是否允许超时</label>
            <p className="text-vr-caption text-vrtext-tertiary">超时后自动结束预约</p>
          </div>
          <Switch checked={values.allowOvertime} onCheckedChange={(v) => update('allowOvertime', v)} />
        </motion.div>
        {values.allowOvertime && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.3, ease }}>
            <label className="block text-vr-caption text-vrtext-secondary mb-1">超时宽限时间（分钟）</label>
            <input
              type="number"
              value={values.overtimeMinutes}
              onChange={(e) => update('overtimeMinutes', Number(e.target.value))}
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            />
          </motion.div>
        )}
        <motion.div {...fadeInUp} className="pt-4">
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
    </div>
  )
}


/* ---- Payment & API Settings (merged) ---- */
function PaymentApiSettings({ settings }: { settings?: Record<string, any> }) {
  const s = settings || {}
  const queryClient = useQueryClient()

  const [methods, setMethods] = useState([
    { name: '微信支付', key: 'payment_wechat', enabled: s.payment_wechat?.value ?? true, rate: s.payment_wechat_rate?.value ?? 0.6 },
    { name: '支付宝', key: 'payment_alipay', enabled: s.payment_alipay?.value ?? true, rate: s.payment_alipay_rate?.value ?? 0.6 },
    { name: '现金支付', key: 'payment_cash', enabled: s.payment_cash?.value ?? true, rate: 0 },
  ])

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

  const mutation = useMutation({
    mutationFn: bulkSaveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
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

  const handleSave = () => {
    mutation.mutate([
      { key: 'payment_wechat', value: methods[0].enabled, category: 'payment' },
      { key: 'payment_alipay', value: methods[1].enabled, category: 'payment' },
      { key: 'payment_cash', value: methods[2].enabled, category: 'payment' },
      { key: 'payment_wechat_rate', value: methods[0].rate, category: 'payment' },
      { key: 'payment_alipay_rate', value: methods[1].rate, category: 'payment' },
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
  }

  return (
    <div>
      <h2 className="text-vr-h2 text-vrtext-primary mb-6">支付与接口</h2>

      {/* Payment Methods */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3 max-w-xl">
        {methods.map((m, i) => (
          <motion.div key={m.name} {...fadeInUp} className="flex items-center justify-between p-4 bg-vrbg-elevated rounded-lg">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-vrtext-secondary" />
              <div>
                <p className="text-vr-body-sm text-vrtext-primary">{m.name}</p>
                {m.enabled && m.rate > 0 && <p className="text-vr-caption text-vrtext-tertiary">费率 {m.rate}%</p>}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {m.enabled && m.rate > 0 && (
                <input
                  type="number"
                  step={0.1}
                  value={m.rate}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setMethods((p) => p.map((x, j) => (j === i ? { ...x, rate: v } : x)))
                  }}
                  className="w-16 h-8 px-2 bg-vrbg-surface border border-vrborder-subtle rounded text-vr-caption text-vrtext-primary text-center focus:outline-none focus:border-vraccent-primary"
                />
              )}
              <Switch checked={m.enabled} onCheckedChange={() => toggleMethod(i)} />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Refund Rules */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8">
        <h4 className="text-vr-h4 text-vrtext-primary mb-4">退款规则</h4>
        <div className="space-y-4 max-w-xl">
          <div className="flex items-center justify-between">
            <span className="text-vr-body-sm text-vrtext-primary">是否支持退款</span>
            <Switch checked={refund.enabled} onCheckedChange={(v) => setRefund((p) => ({ ...p, enabled: v }))} />
          </div>
          {refund.enabled && (
            <>
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
            </>
          )}
        </div>
      </motion.div>

      {/* API Config */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-8">
        <h4 className="text-vr-h4 text-vrtext-primary mb-4">第三方接口状态</h4>
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3 max-w-xl">
          {apis.map((a, i) => (
            <motion.div key={a.name} {...fadeInUp} className="flex items-center justify-between p-4 bg-vrbg-elevated rounded-lg">
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

      {/* API Keys Form */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-8 max-w-xl space-y-5">
        <h4 className="text-vr-h4 text-vrtext-primary mb-2">接口密钥配置</h4>
        {[
          { label: '微信支付商户号', key: 'wechatMchid', type: 'text' },
          { label: '微信支付 API Key', key: 'wechatApiKey', type: 'password' },
          { label: '支付宝 AppID', key: 'alipayAppid', type: 'text' },
          { label: '支付宝私钥', key: 'alipayPrivateKey', type: 'password' },
          { label: '短信服务 AccessKey', key: 'smsAccessKey', type: 'text' },
          { label: '短信服务 Secret', key: 'smsSecret', type: 'password' },
          { label: '微信小程序 AppID', key: 'wxminiAppid', type: 'text' },
        ].map((f) => (
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
      </motion.div>
    </div>
  )
}

/* ---- Notification Settings ---- */
function NotificationSettings({ settings }: { settings?: Record<string, any> }) {
  const s = settings || {}
  const queryClient = useQueryClient()
  const [scenes, setScenes] = useState([
    { label: '预约成功通知', key: 'scene_booking_success', checked: s.scene_booking_success?.value ?? true },
    { label: '预约提醒（开场前）', key: 'scene_booking_remind', checked: s.scene_booking_remind?.value ?? true },
    { label: '预约取消通知', key: 'scene_booking_cancel', checked: s.scene_booking_cancel?.value ?? true },
    { label: '支付成功通知', key: 'scene_pay_success', checked: s.scene_pay_success?.value ?? true },
    { label: '营销推送（可选）', key: 'scene_marketing', checked: s.scene_marketing?.value ?? false },
  ])
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: bulkSaveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSave = () => {
    mutation.mutate([
      { key: 'scene_booking_success', value: scenes[0].checked, category: 'notification' },
      { key: 'scene_booking_remind', value: scenes[1].checked, category: 'notification' },
      { key: 'scene_booking_cancel', value: scenes[2].checked, category: 'notification' },
      { key: 'scene_pay_success', value: scenes[3].checked, category: 'notification' },
      { key: 'scene_marketing', value: scenes[4].checked, category: 'notification' },
    ])
  }

  return (
    <div>
      <h2 className="text-vr-h2 text-vrtext-primary mb-6">通知设置</h2>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h4 className="text-vr-h4 text-vrtext-primary mb-4">通知场景</h4>
        <p className="text-vr-caption text-vrtext-tertiary mb-4">
          勾选后，对应场景会在用户端（C端）产生消息通知
        </p>
        <div className="space-y-2">
          {scenes.map((s, i) => (
            <label key={s.key} className="flex items-center gap-3 py-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={s.checked}
                onChange={() => setScenes((p) => p.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
                className="w-4 h-4 rounded border-vrborder-hover bg-vrbg-surface text-vraccent-primary accent-[#3B82F6]"
              />
              <span className="text-vr-body-sm text-vrtext-primary group-hover:text-vrtext-secondary transition-colors">
                {s.label}
              </span>
            </label>
          ))}
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
  )
}


/* ---- Permission Settings ---- */
function PermissionSettings({ settings }: { settings?: Record<string, any> }) {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const roles = [
    { key: 'ADMIN', label: '管理员', color: 'text-vraccent-primary' },
    { key: 'OPERATOR', label: '运营', color: 'text-vrsuccess' },
    { key: 'FINANCE', label: '财务', color: 'text-vrwarning' },
    { key: 'MANAGER', label: '店长', color: 'text-vrpurple' },
  ]

  const items = [
    { key: 'home', label: '首页概览', icon: LayoutDashboard },
    { key: 'venues', label: '场地管理', icon: Building2 },
    { key: 'games', label: '内容管理', icon: Gamepad2 },
    { key: 'booking', label: '预约排场', icon: CalendarDays },
    { key: 'orders', label: '订单管理', icon: ClipboardList },
    { key: 'users', label: '会员管理', icon: Users },
    { key: 'analytics', label: '数据统计', icon: BarChart3 },
    { key: 'finance', label: '财务管理', icon: Wallet },
    { key: 'accounts', label: '账号管理', icon: Shield },
    { key: 'member-marketing', label: '会员营销', icon: Gift },
    { key: 'settings', label: '系统设置', icon: SettingsIcon },
  ]

  const defaultPerms: Record<string, string[]> = {
    ADMIN:    ['home','venues','games','booking','orders','users','analytics','finance','accounts','member-marketing','settings'],
    OPERATOR: ['home','venues','booking','orders','users','member-marketing'],
    FINANCE:  ['home','orders','analytics','finance'],
    MANAGER:  ['home','venues','booking','orders'],
  }

  const savedPerms = (settings?.role_permissions?.value as Record<string, string[]>) || {}

  const [perms, setPerms] = useState<Record<string, string[]>>(defaultPerms)

  useEffect(() => {
    setPerms({ ...defaultPerms, ...savedPerms })
  }, [JSON.stringify(savedPerms)])

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000)
      return () => clearTimeout(t)
    }
  }, [saved])

  const mutation = useMutation({
    mutationFn: () =>
      bulkSaveSettings([{ key: 'role_permissions', value: perms, category: 'permission' }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
    },
    onError: (err: any) => {
      alert('保存失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
    },
  })

  const togglePermission = (role: string, itemKey: string) => {
    setPerms((prev) => {
      const current = prev[role] || []
      const next = current.includes(itemKey)
        ? current.filter((k) => k !== itemKey)
        : [...current, itemKey]
      return { ...prev, [role]: next }
    })
  }

  const allChecked = (role: string) => items.every((i) => perms[role]?.includes(i.key))
  const toggleAll = (role: string) => {
    setPerms((prev) => ({
      ...prev,
      [role]: allChecked(role) ? [] : items.map((i) => i.key),
    }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-vr-h2 text-vrtext-primary">权限管理</h2>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className={cn(
            'flex items-center gap-2 h-10 px-5 rounded-lg text-vr-body-sm font-medium transition-all duration-200',
            mutation.isPending
              ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
              : saved
                ? 'bg-vrsuccess text-white hover:bg-vrsuccess/90'
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
      </div>

      <p className="text-vr-caption text-vrtext-tertiary mb-4">
        勾选各角色可访问的功能模块，保存后即时生效。超级管理员默认拥有全部权限。
      </p>

      <div className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-vrborder-subtle bg-vrbg-elevated">
                <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-48">
                  功能模块
                </th>
                {roles.map((r) => (
                  <th key={r.key} className="text-center px-4 py-3 text-vr-caption font-medium min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className={r.color}>{r.label}</span>
                      <label className="flex items-center gap-1 text-vr-caption text-vrtext-tertiary cursor-pointer hover:text-vrtext-secondary transition-colors">
                        <input
                          type="checkbox"
                          checked={allChecked(r.key)}
                          onChange={() => toggleAll(r.key)}
                          className="w-3 h-3 rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary bg-vrbg-elevated cursor-pointer"
                        />
                        全选
                      </label>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const Icon = item.icon
                return (
                  <tr
                    key={item.key}
                    className="border-b border-vrborder-subtle/50 hover:bg-vrbg-elevated/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-vrtext-tertiary" />
                        <span className="text-vr-body-sm text-vrtext-primary">{item.label}</span>
                      </div>
                    </td>
                    {roles.map((role) => (
                      <td key={role.key} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={perms[role.key]?.includes(item.key) || false}
                          onChange={() => togglePermission(role.key, item.key)}
                          className="w-4 h-4 rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary focus:ring-offset-0 bg-vrbg-elevated cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─── Log helpers ─── */
const typeIconMap: Record<string, React.ReactNode> = {
  '新增场地': <Home className="w-3.5 h-3.5" />,
  '编辑场地': <Home className="w-3.5 h-3.5" />,
  '删除场地': <Home className="w-3.5 h-3.5" />,
  '新增预约': <Bookmark className="w-3.5 h-3.5" />,
  '编辑预约': <Bookmark className="w-3.5 h-3.5" />,
  '取消预约': <Bookmark className="w-3.5 h-3.5" />,
  '创建订单': <CreditCard className="w-3.5 h-3.5" />,
  '修改订单状态': <CreditCard className="w-3.5 h-3.5" />,
  '订单支付': <CreditCard className="w-3.5 h-3.5" />,
  '取消订单': <CreditCard className="w-3.5 h-3.5" />,
  '订单退款': <CreditCard className="w-3.5 h-3.5" />,
  '编辑用户': <Users className="w-3.5 h-3.5" />,
  '删除用户': <Users className="w-3.5 h-3.5" />,
  '新增设备': <Package className="w-3.5 h-3.5" />,
  '编辑设备': <Package className="w-3.5 h-3.5" />,
  '删除设备': <Package className="w-3.5 h-3.5" />,
  '设备维护': <Package className="w-3.5 h-3.5" />,
  '更新设置': <SettingsIcon className="w-3.5 h-3.5" />,
  '批量更新设置': <SettingsIcon className="w-3.5 h-3.5" />,
}

const typeColorMap: Record<string, { bg: string; text: string }> = {
  '新增场地': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '编辑场地': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '删除场地': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '新增预约': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '编辑预约': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '取消预约': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '创建订单': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '修改订单状态': { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
  '订单支付': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '取消订单': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '订单退款': { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
  '编辑用户': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '删除用户': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '新增设备': { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  '编辑设备': { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
  '删除设备': { bg: 'bg-vrerror/15', text: 'text-vrerror' },
  '设备维护': { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
  '更新设置': { bg: 'bg-vrpurple/15', text: 'text-vrpurple' },
  '批量更新设置': { bg: 'bg-vrpurple/15', text: 'text-vrpurple' },
}

function TypeBadge({ type }: { type: string }) {
  const colors = typeColorMap[type] || { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-tertiary' }
  const icon = typeIconMap[type] || <Activity className="w-3.5 h-3.5" />
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-vr-caption font-medium', colors.bg, colors.text)}>
      {icon}
      {type}
    </span>
  )
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ---- Log Settings ---- */
function LogSettings() {
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 15

  const { data: typeData } = useQuery({
    queryKey: ['logTypes'],
    queryFn: () => getLogTypes(),
  })
  const typeStats = typeData || []

  const { data: logData, isLoading } = useQuery({
    queryKey: ['logs', selectedType, search, page],
    queryFn: () => getLogs({
      type: selectedType === 'all' ? undefined : selectedType,
      operator: search || undefined,
      page,
      pageSize,
    }),
  })

  const logs: OperationLog[] = logData?.data || []
  const total = logData?.meta?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const typeOptions = useMemo(() => {
    const opts = [{ key: 'all', label: '全部', count: total }]
    typeStats.forEach((t: { type: string; count: number }) => {
      opts.push({ key: t.type, label: t.type, count: t.count })
    })
    return opts
  }, [typeStats, total])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-vr-h2 text-vrtext-primary font-semibold">日志管理</h2>
          <p className="text-vr-body text-vrtext-tertiary mt-1">
            记录系统中所有关键操作，便于审计和追溯
          </p>
        </div>
        <div className="text-vr-body-sm text-vrtext-tertiary">
          共 <span className="text-vrtext-primary font-medium">{total}</span> 条记录
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {typeStats.slice(0, 4).map((t: { type: string; count: number }) => (
          <div
            key={t.type}
            className="bg-vrbg-card border border-vrborder-DEFAULT rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <TypeBadge type={t.type} />
            </div>
            <div className="text-vr-h3 text-vrtext-primary font-semibold">{t.count}</div>
            <div className="text-vr-caption text-vrtext-tertiary">次操作</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1">
          {typeOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setSelectedType(opt.key); setPage(1) }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-vr-body-sm font-medium whitespace-nowrap transition-colors',
                selectedType === opt.key
                  ? 'bg-vr-blue text-white'
                  : 'bg-vrbg-card border border-vrborder-DEFAULT text-vrtext-secondary hover:text-vrtext-primary'
              )}
            >
              {opt.label}
              <span className={cn(
                'text-xs',
                selectedType === opt.key ? 'text-white/70' : 'text-vrtext-tertiary'
              )}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-tertiary" />
          <input
            type="text"
            placeholder="搜索操作人..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full sm:w-64 h-10 pl-9 pr-4 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-vrbg-card border border-vrborder-DEFAULT rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-vrborder-DEFAULT">
                <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作类型</th>
                <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作内容</th>
                <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作人</th>
                <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">IP地址</th>
                <th className="text-left px-5 py-3 text-vr-caption text-vrtext-tertiary font-medium">操作时间</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-vrtext-tertiary">
                    <div className="flex items-center justify-center gap-2">
                      <Activity className="w-4 h-4 animate-spin" />
                      加载中...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <FileText className="w-10 h-10 text-vrtext-muted mx-auto mb-3" />
                    <p className="text-vr-body text-vrtext-tertiary">暂无操作日志</p>
                    <p className="text-vr-caption text-vrtext-muted mt-1">进行增删改操作后会自动记录</p>
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-b border-vrborder-DEFAULT last:border-b-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <TypeBadge type={log.type} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-vr-body-sm text-vrtext-secondary max-w-xs truncate block" title={log.content}>
                        {log.content}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-vr-blue/15 flex items-center justify-center">
                          <User className="w-3 h-3 text-vr-blue" />
                        </div>
                        <span className="text-vr-body-sm text-vrtext-primary">{log.operator}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-vr-caption text-vrtext-tertiary font-mono">{log.ip || '-'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-vr-caption text-vrtext-tertiary">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatDateTime(log.createdAt)}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-vrborder-DEFAULT">
            <div className="text-vr-caption text-vrtext-tertiary">
              第 {page} / {totalPages} 页，共 {total} 条
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-vrborder-DEFAULT text-vr-body-sm text-vrtext-secondary hover:text-vrtext-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                上一页
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-vrborder-DEFAULT text-vr-body-sm text-vrtext-secondary hover:text-vrtext-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


/* ------------------------------------------------------------------ */
/*  Settings panel router                                              */
/* ------------------------------------------------------------------ */
function SettingsPanel({ activeKey, settings }: { activeKey: string; settings?: Record<string, any> }) {
  switch (activeKey) {
    case 'basic': return <BasicSettings settings={settings} />
    case 'booking': return <BookingSettings settings={settings} />
    case 'payment': return <PaymentApiSettings settings={settings} />
    case 'notification': return <NotificationSettings settings={settings} />
    case 'permission': return <PermissionSettings settings={settings} />
    case 'log': return <LogSettings />
    default: return <BasicSettings settings={settings} />
  }
}

/* ------------------------------------------------------------------ */
/*  Main Settings Page                                                 */
/* ------------------------------------------------------------------ */
export default function Settings() {
  const [active, setActive] = useState('basic')
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
  })

  return (
    <Layout breadcrumb={['系统设置']}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease }}
        className="mb-6"
      >
        <h1 className="text-vr-h1 text-vrtext-primary">系统设置</h1>
        <p className="text-vr-body-sm text-vrtext-tertiary mt-1">系统全局配置管理</p>
      </motion.div>

      {/* Desktop: side menu + panel / Mobile: grid cards */}
      <div className="hidden md:block">
        <div className="flex bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden min-h-[600px]">
          {/* Left menu */}
          <nav className="w-[200px] shrink-0 border-r border-vrborder-subtle py-2">
            {categories.map((cat, i) => {
              const Icon = cat.icon
              const isActive = active === cat.key
              return (
                <motion.button
                  key={cat.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25, ease }}
                  onClick={() => setActive(cat.key)}
                  className={cn(
                    'relative w-full flex items-center gap-3 h-11 px-4 mx-2 rounded-lg transition-all duration-150 text-left',
                    isActive
                      ? 'bg-vrbg-active text-vraccent-primary'
                      : 'text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary'
                  )}
                  style={{ width: 'calc(100% - 16px)' }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="settings-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-vraccent-primary rounded-r-full"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="text-vr-body-sm font-medium">{cat.title}</span>
                </motion.button>
              )
            })}
          </nav>

          {/* Right panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3, ease }}
              >
                <SettingsPanel activeKey={active} settings={settings} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile: grid of cards */}
      <div className="md:hidden">
        {!mobileDetailOpen ? (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 gap-3"
          >
            {categories.map((cat) => {
              const Icon = cat.icon
              return (
                <motion.button
                  key={cat.key}
                  variants={fadeInUp}
                  onClick={() => {
                    setActive(cat.key)
                    setMobileDetailOpen(true)
                  }}
                  className="flex flex-col items-center gap-2 p-4 bg-vrbg-card border border-vrborder-subtle rounded-xl hover:border-vrborder-hover hover:shadow-vr-md transition-all active:scale-[0.97]"
                >
                  <div className="w-10 h-10 rounded-lg bg-vrbg-elevated flex items-center justify-center">
                    <Icon className="w-5 h-5 text-vraccent-primary" />
                  </div>
                  <span className="text-vr-body-sm text-vrtext-primary font-medium">{cat.title}</span>
                  <span className="text-vr-caption text-vrtext-tertiary">{cat.desc}</span>
                </motion.button>
              )
            })}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <button
              onClick={() => setMobileDetailOpen(false)}
              className="flex items-center gap-2 mb-4 text-vr-body-sm text-vrtext-secondary hover:text-vrtext-primary transition-colors"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              返回
            </button>
            <div className="bg-vrbg-card rounded-xl border border-vrborder-subtle p-5">
              <SettingsPanel activeKey={active} settings={settings} />
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  )
}
