import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Check, Image, MonitorCog, RotateCcw, Save, Settings2, Upload, Video } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { bulkSaveSettings } from "@/api/settings"
import { uploadFile } from "@/api/upload"
import { getImageUrl } from "@/lib/imageUrl"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type RawSettings = Record<string, { value?: any } | any>

type LoginFeatureIcon = "calendar" | "wallet" | "shield" | "activity" | "sparkle"

interface LoginFeatureCard {
  title: string
  desc: string
  icon: LoginFeatureIcon
  enabled: boolean
}

interface AdminPageForm {
  venueName: string
  address: string
  phone: string
  hours: string
  description: string
  website: string
  logo: string
  serviceQr: string
  bHomeNoticeEnabled: boolean
  bHomeNoticeTitle: string
  bHomeNoticeContent: string
  bHomeNoticeLevel: "info" | "success" | "warning"
  bHomeStatsTitle: string
  bHomeMetricNote: string
  bHomeScheduleTitle: string
  bHomeOrdersTitle: string
  bLoginTitle: string
  bLoginSubtitle: string
  bLoginFormTitle: string
  bLoginFormDesc: string
  bLoginHeroTitle: string
  bLoginHeroDesc: string
  bLoginBackgroundImage: string
  bLoginBackgroundVideo: string
  bLoginBackgroundOverlay: number
  bLoginShowDemoAccount: boolean
  bLoginDemoAccountText: string
  bLoginSupportText: string
  bLoginSecurityText: string
  bLoginFooterText: string
  bLoginFeatureCards: LoginFeatureCard[]
}

function readSetting<T>(settings: RawSettings | undefined, key: string, fallback: T): T {
  const raw = settings?.[key]
  const value = raw && typeof raw === "object" && "value" in raw ? raw.value : raw
  return (value ?? fallback) as T
}

const defaultLoginFeatureCards: LoginFeatureCard[] = [
  { title: "预约排场", desc: "按场次、门店与状态快速处理订单", icon: "calendar", enabled: true },
  { title: "会员财务", desc: "余额、积分、退款与对账统一管理", icon: "wallet", enabled: true },
  { title: "审计留痕", desc: "关键操作记录可追溯", icon: "shield", enabled: true },
]

function normalizeLoginFeatureCards(value: unknown): LoginFeatureCard[] {
  if (!Array.isArray(value) || value.length === 0) return defaultLoginFeatureCards
  return value.slice(0, 3).map((item: any, index) => ({
    title: String(item?.title ?? defaultLoginFeatureCards[index]?.title ?? ""),
    desc: String(item?.desc ?? defaultLoginFeatureCards[index]?.desc ?? ""),
    icon: (["calendar", "wallet", "shield", "activity", "sparkle"].includes(item?.icon)
      ? item.icon
      : defaultLoginFeatureCards[index]?.icon ?? "activity") as LoginFeatureIcon,
    enabled: item?.enabled !== false,
  }))
}

function buildInitialForm(settings?: RawSettings): AdminPageForm {
  return {
    venueName: readSetting(settings, "venue_name", "VR大空间体验馆"),
    address: readSetting(settings, "venue_address", "北京市朝阳区xxx"),
    phone: readSetting(settings, "venue_phone", "400-888-0000"),
    hours: readSetting(settings, "venue_hours", "09:00-22:00"),
    description: readSetting(settings, "venue_description", "VR大空间体验馆提供沉浸式虚拟现实体验，支持多人联机互动。"),
    website: readSetting(settings, "company_website", ""),
    logo: readSetting(settings, "logo", ""),
    serviceQr: readSetting(settings, "service_qr", ""),
    bHomeNoticeEnabled: readSetting(settings, "b_home_notice_enabled", true),
    bHomeNoticeTitle: readSetting(settings, "b_home_notice_title", "今日运营提醒"),
    bHomeNoticeContent: readSetting(settings, "b_home_notice_content", "重点关注待核销订单、设备状态与退款审批，异常请及时处理。"),
    bHomeNoticeLevel: readSetting(settings, "b_home_notice_level", "info"),
    bHomeStatsTitle: readSetting(settings, "b_home_stats_title", "核心指标"),
    bHomeMetricNote: readSetting(settings, "b_home_metric_note", "营业额按付款时间统计 · 预约/核销按到场日期统计"),
    bHomeScheduleTitle: readSetting(settings, "b_home_schedule_title", "今日排场"),
    bHomeOrdersTitle: readSetting(settings, "b_home_orders_title", "最新订单"),
    bLoginTitle: readSetting(settings, "b_login_title", "VR大空间"),
    bLoginSubtitle: readSetting(settings, "b_login_subtitle", "预约排场管理系统"),
    bLoginFormTitle: readSetting(settings, "b_login_form_title", "登录管理后台"),
    bLoginFormDesc: readSetting(settings, "b_login_form_desc", "处理预约、排场、财务与门店运营"),
    bLoginHeroTitle: readSetting(settings, "b_login_hero_title", "沉浸式门店运营中枢"),
    bLoginHeroDesc: readSetting(settings, "b_login_hero_desc", "统一管理预约排场、订单核销、会员权益与财务对账。"),
    bLoginBackgroundImage: readSetting(settings, "b_login_background_image", ""),
    bLoginBackgroundVideo: readSetting(settings, "b_login_background_video", ""),
    bLoginBackgroundOverlay: readSetting(settings, "b_login_background_overlay", 72),
    bLoginShowDemoAccount: readSetting(settings, "b_login_show_demo_account", true),
    bLoginDemoAccountText: readSetting(settings, "b_login_demo_account_text", "测试账号: 13800000000 / admin123"),
    bLoginSupportText: readSetting(settings, "b_login_support_text", "遇到登录问题请联系系统管理员"),
    bLoginSecurityText: readSetting(settings, "b_login_security_text", "登录后将记录操作审计日志"),
    bLoginFooterText: readSetting(settings, "b_login_footer_text", ""),
    bLoginFeatureCards: normalizeLoginFeatureCards(readSetting(settings, "b_login_feature_cards", defaultLoginFeatureCards)),
  }
}

function Field({ label, children, desc }: { label: string; children: React.ReactNode; desc?: string }) {
  return (
    <div>
      <label className="block text-vr-caption text-vrtext-secondary mb-1">{label}</label>
      {children}
      {desc && <p className="mt-1 text-vr-caption text-vrtext-tertiary">{desc}</p>}
    </div>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all",
        props.className
      )}
    />
  )
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none",
        props.className
      )}
    />
  )
}

function ImageUploadField({
  label,
  imageUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string
  imageUrl: string
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const imageHint = "支持 JPG、PNG、GIF、WebP、SVG，最大 5MB"

  return (
    <Field label={label}>
      <div className="flex items-center gap-4">
        <div className="w-28 h-16 bg-vrbg-surface border border-vrborder-subtle rounded-lg flex items-center justify-center overflow-hidden">
          {imageUrl ? (
            <img src={getImageUrl(imageUrl)} alt="" className="w-full h-full object-cover" />
          ) : (
            <Image className="w-5 h-5 text-vrtext-muted" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors cursor-pointer relative self-start">
            <Upload className="w-4 h-4" />
            {uploading ? "上传中..." : "上传图片"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,.jpg,.jpeg,.png,.gif,.webp,.svg"
              disabled={uploading}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.currentTarget.value = ""
                if (!file) return
                if (file.size > 5 * 1024 * 1024) { toast.error("图片大小不能超过 5MB"); return }
                onUpload(file)
              }}
            />
          </label>
          <p className="text-vr-caption text-vrtext-tertiary">{imageHint}</p>
        </div>
        {imageUrl && (
          <button type="button" onClick={onRemove} className="px-3 py-2 rounded-lg text-vr-body-sm text-vrerror hover:bg-vrerror/10">
            移除
          </button>
        )}
      </div>
    </Field>
  )
}

function VideoUploadField({
  label,
  videoUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string
  videoUrl: string
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  return (
    <Field label={label} desc="建议上传 MP4/WebM，最大 300MB；登录页存在视频时优先展示视频。">
      <div className="flex items-center gap-4">
        <div className="w-32 aspect-video bg-vrbg-surface border border-vrborder-subtle rounded-lg flex items-center justify-center overflow-hidden">
          {videoUrl ? (
            <video src={getImageUrl(videoUrl, "")} className="w-full h-full object-cover" muted loop playsInline preload="metadata" />
          ) : (
            <Video className="w-5 h-5 text-vrtext-muted" />
          )}
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors cursor-pointer relative">
          <Upload className="w-4 h-4" />
          {uploading ? "上传中..." : "上传视频"}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
            disabled={uploading}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.currentTarget.value = ""
              if (!file) return
              if (file.size > 300 * 1024 * 1024) { toast.error("视频大小不能超过 300MB"); return }
              if (!file.type.startsWith("video/")) { toast.error("请选择视频文件"); return }
              onUpload(file)
            }}
          />
        </label>
        {videoUrl && (
          <button type="button" onClick={onRemove} className="px-3 py-2 rounded-lg text-vr-body-sm text-vrerror hover:bg-vrerror/10">
            移除
          </button>
        )}
      </div>
      {videoUrl && <p className="mt-2 text-vr-caption text-vrtext-tertiary break-all">当前视频：{videoUrl}</p>}
    </Field>
  )
}

function validateForm(form: AdminPageForm): string | null {
  if (form.phone && !/^[\d\-+() ]{7,20}$/.test(form.phone)) return "联系电话格式不正确"
  if (form.venueName.length > 50) return "场馆名称不能超过50字"
  if (form.website && !/^https?:\/\/.+\..+/.test(form.website)) return "公司网址需要以 http:// 或 https:// 开头"
  if (form.description.length > 800) return "公司简介不能超过800字"
  if (form.bLoginTitle.length > 40) return "登录页标题不能超过40字"
  if (form.bLoginSubtitle.length > 40) return "登录页副标题不能超过40字"
  if (form.bLoginHeroTitle.length > 60) return "登录页主视觉标题不能超过60字"
  if (form.bLoginHeroDesc.length > 160) return "登录页主视觉说明不能超过160字"
  if (form.bLoginFeatureCards.some((item) => item.title.length > 12 || item.desc.length > 40)) {
    return "登录页功能卡片标题最多12字，说明最多40字"
  }
  return null
}

export function AdminPageSettings({ settings }: { settings?: RawSettings }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminPageForm>(() => buildInitialForm(settings))
  const [activePanel, setActivePanel] = useState<"brand" | "login">("brand")
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [uploadingLoginBg, setUploadingLoginBg] = useState(false)
  const [uploadingLoginVideo, setUploadingLoginVideo] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const initialForm = useMemo(() => buildInitialForm(settings), [settings])

  useEffect(() => {
    if (settings) setForm(buildInitialForm(settings))
  }, [settings])

  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm)
  }, [form, initialForm])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = "" }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  const mutation = useMutation({
    mutationFn: bulkSaveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      queryClient.invalidateQueries({ queryKey: ["page-public-settings"] })
      setSaved(true)
      setConfirmOpen(false)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: any) => {
      toast.error("保存失败: " + (err?.response?.data?.message || err?.message || "未知错误"))
    },
  })

  const update = <K extends keyof AdminPageForm>(key: K, value: AdminPageForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const uploadImage = async (file: File, type: "logo" | "serviceQr") => {
    const setLoading = type === "logo" ? setUploadingLogo : setUploadingQr
    setLoading(true)
    try {
      const result = await uploadFile("logos", file)
      update(type, result.url)
      toast.success("上传成功，请保存页面设置后生效")
    } catch (err) {
      toast.error("上传失败: " + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const uploadPageAsset = async (file: File, type: "bLoginBackgroundImage" | "bLoginBackgroundVideo") => {
    const setLoading = type === "bLoginBackgroundImage" ? setUploadingLoginBg : setUploadingLoginVideo
    setLoading(true)
    try {
      const result = await uploadFile("pages", file)
      update(type, result.url)
      toast.success("上传成功，请保存页面设置后生效")
    } catch (err) {
      toast.error("上传失败: " + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const updateLoginFeature = (index: number, patch: Partial<LoginFeatureCard>) => {
    setForm((prev) => ({
      ...prev,
      bLoginFeatureCards: prev.bLoginFeatureCards.map((item, i) => i === index ? { ...item, ...patch } : item),
    }))
  }

  const handleSave = () => {
    if (form.bHomeNoticeTitle.length > 30) { toast.error("提醒标题不能超过30字"); return }
    if (form.bHomeNoticeContent.length > 500) { toast.error("提醒内容不能超过500字"); return }
    if (form.bHomeStatsTitle.length > 20) { toast.error("核心指标标题不能超过20字"); return }
    if (form.bHomeScheduleTitle.length > 20) { toast.error("排场标题不能超过20字"); return }
    if (form.bHomeOrdersTitle.length > 20) { toast.error("订单标题不能超过20字"); return }
    if (form.bHomeMetricNote.length > 80) { toast.error("指标说明不能超过80字"); return }
    if (form.bLoginFormTitle.length > 30) { toast.error("登录表单标题不能超过30字"); return }
    if (form.bLoginFormDesc.length > 80) { toast.error("登录表单说明不能超过80字"); return }
    if (form.bLoginDemoAccountText.length > 80) { toast.error("演示账号提示不能超过80字"); return }
    if (form.bLoginSupportText.length > 80) { toast.error("登录支持提示不能超过80字"); return }
    if (form.bLoginSecurityText.length > 80) { toast.error("安全提示不能超过80字"); return }
    const err = validateForm(form)
    if (err) { toast.error(err); return }
    setConfirmOpen(true)
  }

  const doSave = () => {
    mutation.mutate([
      { key: "venue_name", value: form.venueName, category: "page" },
      { key: "venue_address", value: form.address, category: "page" },
      { key: "venue_phone", value: form.phone, category: "page" },
      { key: "venue_hours", value: form.hours, category: "page" },
      { key: "venue_description", value: form.description, category: "page" },
      { key: "company_website", value: form.website, category: "page" },
      { key: "logo", value: form.logo, category: "page" },
      { key: "service_qr", value: form.serviceQr, category: "page" },
      { key: "b_home_notice_enabled", value: form.bHomeNoticeEnabled, category: "page" },
      { key: "b_home_notice_title", value: form.bHomeNoticeTitle, category: "page" },
      { key: "b_home_notice_content", value: form.bHomeNoticeContent, category: "page" },
      { key: "b_home_notice_level", value: form.bHomeNoticeLevel, category: "page" },
      { key: "b_home_stats_title", value: form.bHomeStatsTitle, category: "page" },
      { key: "b_home_metric_note", value: form.bHomeMetricNote, category: "page" },
      { key: "b_home_schedule_title", value: form.bHomeScheduleTitle, category: "page" },
      { key: "b_home_orders_title", value: form.bHomeOrdersTitle, category: "page" },
      { key: "b_login_title", value: form.bLoginTitle, category: "page" },
      { key: "b_login_subtitle", value: form.bLoginSubtitle, category: "page" },
      { key: "b_login_form_title", value: form.bLoginFormTitle, category: "page" },
      { key: "b_login_form_desc", value: form.bLoginFormDesc, category: "page" },
      { key: "b_login_hero_title", value: form.bLoginHeroTitle, category: "page" },
      { key: "b_login_hero_desc", value: form.bLoginHeroDesc, category: "page" },
      { key: "b_login_background_image", value: form.bLoginBackgroundImage, category: "page" },
      { key: "b_login_background_video", value: form.bLoginBackgroundVideo, category: "page" },
      { key: "b_login_background_overlay", value: form.bLoginBackgroundOverlay, category: "page" },
      { key: "b_login_show_demo_account", value: form.bLoginShowDemoAccount, category: "page" },
      { key: "b_login_demo_account_text", value: form.bLoginDemoAccountText, category: "page" },
      { key: "b_login_support_text", value: form.bLoginSupportText, category: "page" },
      { key: "b_login_security_text", value: form.bLoginSecurityText, category: "page" },
      { key: "b_login_footer_text", value: form.bLoginFooterText, category: "page" },
      { key: "b_login_feature_cards", value: form.bLoginFeatureCards, category: "page" },
    ])
  }

  const noticeColor = {
    info: "border-vraccent-primary/30 bg-vraccent-primary/10 text-vraccent-primary",
    success: "border-vrsuccess/30 bg-vrsuccess/10 text-vrsuccess",
    warning: "border-vrwarning/40 bg-vrwarning/10 text-vrwarning",
  }[form.bHomeNoticeLevel]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-vr-h2 text-vrtext-primary">B端页面设置</h2>
          <p className="text-vr-body-sm text-vrtext-tertiary mt-1">配置品牌基础信息与运营公告</p>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 max-w-4xl space-y-5">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-vrborder-subtle bg-vrbg-surface p-2">
            <button
              type="button"
              onClick={() => setActivePanel("brand")}
              className={cn(
                "rounded-lg px-4 py-3 text-left transition-colors",
                activePanel === "brand" ? "bg-vraccent-primary text-white" : "text-vrtext-secondary hover:bg-vrbg-elevated"
              )}
            >
              <p className="text-vr-body-sm font-semibold">品牌与首页</p>
              <p className={cn("mt-1 text-vr-caption", activePanel === "brand" ? "text-white/70" : "text-vrtext-tertiary")}>
                品牌基础、运营公告、首页模块文案
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel("login")}
              className={cn(
                "rounded-lg px-4 py-3 text-left transition-colors",
                activePanel === "login" ? "bg-vraccent-primary text-white" : "text-vrtext-secondary hover:bg-vrbg-elevated"
              )}
            >
              <p className="text-vr-body-sm font-semibold">登录页</p>
              <p className={cn("mt-1 text-vr-caption", activePanel === "login" ? "text-white/70" : "text-vrtext-tertiary")}>
                登录文案、背景素材、能力卡片
              </p>
            </button>
          </div>

          {activePanel === "brand" ? (
          <>
          <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-vraccent-primary" />
              <p className="text-vr-body-sm font-semibold text-vrtext-primary">品牌基础</p>
            </div>
            <p className="text-vr-caption text-vrtext-tertiary">
              配置公司展示信息、联系方式与系统 Logo，将影响 B 端、C 端和登录页公司简介。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="场馆名称">
                <TextInput value={form.venueName} onChange={(e) => update("venueName", e.target.value)} maxLength={50} />
              </Field>
              <Field label="联系电话">
                <TextInput value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="400-888-0000" />
              </Field>
              <Field label="场馆地址">
                <TextInput value={form.address} onChange={(e) => update("address", e.target.value)} />
              </Field>
              <Field label="营业时间">
                <TextInput value={form.hours} onChange={(e) => update("hours", e.target.value)} placeholder="09:00-22:00" />
              </Field>
              <Field label="公司网址" desc="用于登录页公司简介弹窗，可填写官网、公众号文章或品牌介绍页。">
                <TextInput value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://example.com" />
              </Field>
            </div>

            <Field label="公司简介" desc="会展示在登录页「公司简介」弹窗中，也会作为 C 端品牌说明的默认来源。">
              <TextArea rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} maxLength={800} />
            </Field>

            <ImageUploadField label="系统 Logo" imageUrl={form.logo} uploading={uploadingLogo}
              onUpload={(f) => uploadImage(f, "logo")} onRemove={() => update("logo", "")} />
            <ImageUploadField label="客服微信二维码" imageUrl={form.serviceQr} uploading={uploadingQr}
              onUpload={(f) => uploadImage(f, "serviceQr")} onRemove={() => update("serviceQr", "")} />
          </div>

          <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorCog className="w-4 h-4 text-vraccent-primary" />
                <p className="text-vr-body-sm font-semibold text-vrtext-primary">首页运营公告</p>
              </div>
              <Switch checked={form.bHomeNoticeEnabled} onCheckedChange={(v) => update("bHomeNoticeEnabled", v)} />
            </div>
            <p className="text-vr-caption text-vrtext-tertiary">
              公告显示在管理后台首页顶部，用于提醒操作员关注异常订单、设备状态、审批等事项。
            </p>

            <Field label="公告标题">
              <TextInput value={form.bHomeNoticeTitle} onChange={(e) => update("bHomeNoticeTitle", e.target.value)} maxLength={30} />
            </Field>

            <Field label="公告内容">
              <TextArea rows={4} value={form.bHomeNoticeContent} onChange={(e) => update("bHomeNoticeContent", e.target.value)} maxLength={500} />
            </Field>

            <Field label="公告等级">
              <select
                value={form.bHomeNoticeLevel}
                onChange={(e) => update("bHomeNoticeLevel", e.target.value as AdminPageForm["bHomeNoticeLevel"])}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
              >
                <option value="info">普通提示</option>
                <option value="success">正常提示</option>
                <option value="warning">风险提示</option>
              </select>
            </Field>
          </div>

          <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
            <div className="flex items-center gap-2">
              <MonitorCog className="w-4 h-4 text-vraccent-primary" />
              <p className="text-vr-body-sm font-semibold text-vrtext-primary">首页模块文案</p>
            </div>
            <p className="text-vr-caption text-vrtext-tertiary">
              控制 B 端首页关键模块标题与指标说明，适合按门店运营习惯调整。
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="核心指标标题">
                <TextInput value={form.bHomeStatsTitle} onChange={(e) => update("bHomeStatsTitle", e.target.value)} maxLength={20} />
              </Field>
              <Field label="今日排场标题">
                <TextInput value={form.bHomeScheduleTitle} onChange={(e) => update("bHomeScheduleTitle", e.target.value)} maxLength={20} />
              </Field>
              <Field label="最新订单标题">
                <TextInput value={form.bHomeOrdersTitle} onChange={(e) => update("bHomeOrdersTitle", e.target.value)} maxLength={20} />
              </Field>
              <Field label="指标说明">
                <TextInput value={form.bHomeMetricNote} onChange={(e) => update("bHomeMetricNote", e.target.value)} maxLength={80} />
              </Field>
            </div>
          </div>

          </>
          ) : (
          <>
          <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
            <div className="flex items-center gap-2">
              <MonitorCog className="w-4 h-4 text-vraccent-primary" />
              <p className="text-vr-body-sm font-semibold text-vrtext-primary">登录页展示</p>
            </div>
            <p className="text-vr-caption text-vrtext-tertiary">
              控制 B 端登录页的品牌文案、背景素材、登录说明和左侧能力卡片。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="登录页标题">
                <TextInput value={form.bLoginTitle} onChange={(e) => update("bLoginTitle", e.target.value)} maxLength={40} />
              </Field>
              <Field label="登录页副标题">
                <TextInput value={form.bLoginSubtitle} onChange={(e) => update("bLoginSubtitle", e.target.value)} maxLength={40} />
              </Field>
              <Field label="表单标题">
                <TextInput value={form.bLoginFormTitle} onChange={(e) => update("bLoginFormTitle", e.target.value)} maxLength={30} />
              </Field>
              <Field label="表单说明">
                <TextInput value={form.bLoginFormDesc} onChange={(e) => update("bLoginFormDesc", e.target.value)} maxLength={80} />
              </Field>
            </div>

            <Field label="左侧主标题">
              <TextInput value={form.bLoginHeroTitle} onChange={(e) => update("bLoginHeroTitle", e.target.value)} maxLength={60} />
            </Field>
            <Field label="左侧说明">
              <TextArea rows={3} value={form.bLoginHeroDesc} onChange={(e) => update("bLoginHeroDesc", e.target.value)} maxLength={160} />
            </Field>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ImageUploadField label="登录背景图" imageUrl={form.bLoginBackgroundImage} uploading={uploadingLoginBg}
                onUpload={(f) => uploadPageAsset(f, "bLoginBackgroundImage")} onRemove={() => update("bLoginBackgroundImage", "")} />
              <VideoUploadField label="登录背景视频" videoUrl={form.bLoginBackgroundVideo} uploading={uploadingLoginVideo}
                onUpload={(f) => uploadPageAsset(f, "bLoginBackgroundVideo")} onRemove={() => update("bLoginBackgroundVideo", "")} />
            </div>

            <Field label={`背景遮罩强度：${form.bLoginBackgroundOverlay}%`} desc="数值越高背景越暗，登录文字越清晰。">
              <input
                type="range"
                min={20}
                max={92}
                value={form.bLoginBackgroundOverlay}
                onChange={(e) => update("bLoginBackgroundOverlay", Number(e.target.value))}
                className="w-full accent-[#3B82F6]"
              />
            </Field>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="演示账号提示">
                <TextInput value={form.bLoginDemoAccountText} onChange={(e) => update("bLoginDemoAccountText", e.target.value)} maxLength={80} />
              </Field>
              <Field label="登录支持提示">
                <TextInput value={form.bLoginSupportText} onChange={(e) => update("bLoginSupportText", e.target.value)} maxLength={80} />
              </Field>
              <Field label="安全提示">
                <TextInput value={form.bLoginSecurityText} onChange={(e) => update("bLoginSecurityText", e.target.value)} maxLength={80} />
              </Field>
              <Field label="左下角页脚文案">
                <TextInput value={form.bLoginFooterText} onChange={(e) => update("bLoginFooterText", e.target.value)} maxLength={80} placeholder="留空则显示安全提示" />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-vrborder-subtle bg-vrbg-card px-4 py-3">
              <div>
                <p className="text-vr-body-sm text-vrtext-primary">显示演示账号提示</p>
                <p className="text-vr-caption text-vrtext-tertiary">关闭后登录页底部不展示测试账号。</p>
              </div>
              <Switch checked={form.bLoginShowDemoAccount} onCheckedChange={(v) => update("bLoginShowDemoAccount", v)} />
            </div>

            <div className="space-y-3">
              <p className="text-vr-caption text-vrtext-secondary">左侧功能卡片</p>
              {form.bLoginFeatureCards.map((item, index) => (
                <div key={index} className="grid grid-cols-1 lg:grid-cols-[88px_1fr_1.5fr_72px] gap-3 rounded-xl border border-vrborder-subtle bg-vrbg-card p-3">
                  <select
                    value={item.icon}
                    onChange={(e) => updateLoginFeature(index, { icon: e.target.value as LoginFeatureIcon })}
                    className="h-10 px-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-caption text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                  >
                    <option value="calendar">排场</option>
                    <option value="wallet">财务</option>
                    <option value="shield">安全</option>
                    <option value="activity">运营</option>
                    <option value="sparkle">亮点</option>
                  </select>
                  <TextInput value={item.title} onChange={(e) => updateLoginFeature(index, { title: e.target.value })} maxLength={12} placeholder="标题" />
                  <TextInput value={item.desc} onChange={(e) => updateLoginFeature(index, { desc: e.target.value })} maxLength={40} placeholder="说明" />
                  <div className="flex items-center justify-end">
                    <Switch checked={item.enabled} onCheckedChange={(v) => updateLoginFeature(index, { enabled: v })} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
          )}

          <div className="flex items-center justify-between rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
            <p className="text-vr-body-sm text-vrtext-tertiary">
              保存后将立即更新 B 端品牌基础、首页公告与登录页展示。
            </p>
            <button
              onClick={handleSave}
              disabled={mutation.isPending || !isDirty}
              className={cn(
                "inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-vr-body-sm font-medium transition-all duration-200",
                saved
                  ? "bg-vrsuccess/20 text-vrsuccess"
                  : mutation.isPending
                    ? "bg-vraccent-primary/50 text-white cursor-not-allowed"
                    : !isDirty
                      ? "bg-vrbg-elevated text-vrtext-muted cursor-not-allowed"
                      : "bg-vraccent-primary text-white hover:bg-vraccent-primary-hover"
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
        </div>

        <div className="hidden xl:block w-[320px] shrink-0">
          <div className="sticky top-6 rounded-2xl border border-vrborder-subtle bg-vrbg-surface p-4">
            <div className="flex items-center gap-2 text-vr-body-sm font-semibold text-vrtext-primary mb-3">
              <MonitorCog className="w-4 h-4 text-vraccent-primary" />
              B端首页预览
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-vrbg-surface border border-vrborder-subtle overflow-hidden flex items-center justify-center">
                  {form.logo ? (
                    <img src={getImageUrl(form.logo)} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Image className="w-4 h-4 text-vrtext-muted" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-vrtext-primary truncate">{form.venueName || "VR大空间"}</p>
                  <p className="text-[11px] text-vrtext-tertiary truncate">{form.phone || "未填写联系电话"}</p>
                </div>
              </div>
              {form.bHomeNoticeEnabled && (
                <div className={cn("rounded-xl border p-3", noticeColor)}>
                  <p className="text-xs font-semibold">{form.bHomeNoticeTitle}</p>
                  <p className="text-[11px] text-vrtext-secondary mt-1 leading-relaxed">{form.bHomeNoticeContent}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-3">
                  <p className="text-[11px] text-vrtext-tertiary">{form.bHomeStatsTitle || "核心指标"}</p>
                  <div className="h-5 mt-2 bg-vrbg-elevated rounded animate-pulse" />
                </div>
                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-3">
                  <p className="text-[11px] text-vrtext-tertiary">{form.bHomeScheduleTitle || "今日排场"}</p>
                  <div className="h-5 mt-2 bg-vrbg-elevated rounded animate-pulse" />
                </div>
              </div>
              <div className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-3">
                <p className="text-[11px] text-vrtext-tertiary">{form.bHomeOrdersTitle || "最新订单"}</p>
                <div className="h-5 mt-2 bg-vrbg-elevated rounded animate-pulse" />
              </div>
              <p className="text-[11px] text-vrtext-tertiary">{form.bHomeMetricNote || "实际数据由系统实时生成"}</p>

              <div className="pt-3 border-t border-vrborder-subtle">
                <div className="flex items-center gap-2 text-vr-body-sm font-semibold text-vrtext-primary mb-3">
                  <MonitorCog className="w-4 h-4 text-vraccent-primary" />
                  B端登录页预览
                </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-[#07111f] min-h-[180px] p-3 shadow-inner">
                  {form.bLoginBackgroundVideo ? (
                    <video src={getImageUrl(form.bLoginBackgroundVideo, "")} className="absolute inset-0 w-full h-full object-cover" muted loop playsInline preload="metadata" />
                  ) : form.bLoginBackgroundImage ? (
                    <img src={getImageUrl(form.bLoginBackgroundImage)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : null}
                  <div className="absolute inset-0 bg-[#07111f]" style={{ opacity: form.bLoginBackgroundOverlay / 100 }} />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg border border-white/10 bg-white/10 overflow-hidden flex items-center justify-center">
                        {form.logo ? <img src={getImageUrl(form.logo)} alt="" className="w-full h-full object-contain" /> : <Image className="w-4 h-4 text-white/70" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{form.bLoginTitle || form.venueName}</p>
                        <p className="text-[10px] text-white/55 truncate">{form.bLoginSubtitle}</p>
                      </div>
                    </div>
                    <p className="mt-5 text-sm font-semibold leading-5 text-white">{form.bLoginHeroTitle}</p>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/60">{form.bLoginHeroDesc}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {form.bLoginFeatureCards.filter((item) => item.enabled).slice(0, 3).map((item, index) => (
                        <div key={index} className="rounded-lg border border-white/10 bg-white/10 p-2">
                          <p className="text-[10px] font-semibold text-white truncate">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-[9px] leading-3 text-white/50">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-vrbg-card rounded-2xl border border-vrborder-subtle p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-vr-h4 text-vrtext-primary font-semibold">确认保存</h3>
            <p className="text-vr-body-sm text-vrtext-secondary mt-2">
              保存后将立即更新 B 端品牌基础、首页公告与登录页展示，确认保存？
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors">
                取消
              </button>
              <button onClick={doSave} disabled={mutation.isPending}
                className="px-4 py-2 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50">
                {mutation.isPending ? "保存中..." : "确认保存"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
