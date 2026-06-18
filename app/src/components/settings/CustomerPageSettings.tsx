import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  ArrowDown, ArrowUp, Bell, Check, ChevronRight, CreditCard, Crown, Gamepad2, Gift,
  HelpCircle, Image, ImagePlus, Link2, MapPin, Phone, Plus, Receipt,
  RotateCcw, Save, Smartphone, Ticket, Trash2, Upload, User, Users, Video, X,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { bulkSaveSettings } from "@/api/settings"
import { uploadFile } from "@/api/upload"
import { getGames } from "@/api/games"
import { getImageUrl } from "@/lib/imageUrl"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type RawSettings = Record<string, { value?: any } | any>

type SectionKey = "home" | "modules" | "layout" | "help" | "groupBooking"

export interface SectionOrderItem {
  key: string
  enabled: boolean
}

export interface BannerImage {
  id: string
  imageUrl: string
  badge: string
  title: string
  subtitle: string
  linkUrl: string
}

export interface ContentCard {
  id: string
  title: string
  content: string
  imageUrl: string
  videoUrl: string
  linkUrl: string
  buttonText: string
  layout: "card" | "banner"
  enabled: boolean
}

export interface FaqItem {
  question: string
  answer: string
}

interface PageForm {
  cHomeSearchPlaceholder: string
  cHomeBannerEnabled: boolean
  cHomeBannerImages: BannerImage[]
  cHomeCategoryEnabled: boolean
  cHomeVipEnabled: boolean
  cHomeVipTitle: string
  cHomeVipDesc: string
  cHomeVipButton: string
  cHomeHotTitle: string
  cHomeHotLinkText: string
  cHomeCustomModules: ContentCard[]
  cHomeSectionOrder: SectionOrderItem[]
  cProfileHelpEnabled: boolean
  cProfileHelpTitle: string
  cProfileHelpSubtitle: string
  cProfileHelpFaqs: FaqItem[]
  cProfileHelpContactPhone: string
  cProfileHelpContactWechat: string
  cProfileHelpContactHours: string
  cGroupBookingRules: string
}

function readSetting<T>(settings: RawSettings | undefined, key: string, fallback: T): T {
  const raw = settings?.[key]
  const value = raw && typeof raw === "object" && "value" in raw ? raw.value : raw
  return (value ?? fallback) as T
}

function normalizeBannerImages(value: unknown): BannerImage[] {
  if (!Array.isArray(value) || value.length === 0) return []
  return value.map((item: any, index: number) => ({
    id: String(item?.id || "banner-" + Date.now() + "-" + index),
    imageUrl: String(item?.imageUrl || ""),
    badge: String(item?.badge || "限时特惠"),
    title: String(item?.title || "沉浸宇宙\n触手可及"),
    subtitle: String(item?.subtitle || "全场体验项目最高 30% OFF"),
    linkUrl: String(item?.linkUrl || ""),
  }))
}

const defaultSectionOrder: SectionOrderItem[] = [
  { key: "search", enabled: true },
  { key: "banner", enabled: true },
  { key: "category", enabled: true },
  { key: "vip", enabled: true },
  { key: "customModules", enabled: true },
  { key: "groupBuy", enabled: true },
  { key: "hot", enabled: true },
]

function normalizeSectionOrder(value: unknown): SectionOrderItem[] {
  if (!Array.isArray(value) || value.length === 0) return defaultSectionOrder
  const normalized = value.map((item: any) => ({
    key: String(item?.key || ""),
    enabled: item?.enabled !== false,
  })).filter((item) => item.key)
  // 合并默认项中缺失的 key
  const existingKeys = new Set(normalized.map((i) => i.key))
  for (const def of defaultSectionOrder) {
    if (!existingKeys.has(def.key)) normalized.push({ ...def })
  }
  return normalized
}

function normalizeModules(value: unknown): ContentCard[] {
  if (!Array.isArray(value)) return []
  return value.map((item: any, index: number) => ({
    id: String(item?.id || "module-" + Date.now() + "-" + index),
    title: String(item?.title || ""),
    content: String(item?.content || ""),
    imageUrl: String(item?.imageUrl || ""),
    videoUrl: String(item?.videoUrl || ""),
    linkUrl: String(item?.linkUrl || ""),
    buttonText: String(item?.buttonText || "查看详情"),
    layout: item?.layout === "banner" ? "banner" : "card",
    enabled: item?.enabled !== false,
  }))
}

function normalizeFaqs(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item: any) => ({
    question: String(item?.question || ""),
    answer: String(item?.answer || ""),
  }))
}

function buildInitialForm(settings?: RawSettings): PageForm {
  return {
    cHomeSearchPlaceholder: readSetting(settings, "c_home_search_placeholder", "搜索 VR 体验项目..."),
    cHomeBannerEnabled: readSetting(settings, "c_home_banner_enabled", true),
    cHomeBannerImages: normalizeBannerImages(readSetting(settings, "c_home_banner_images", [])),
    cHomeCategoryEnabled: readSetting(settings, "c_home_category_enabled", true),
    cHomeVipEnabled: readSetting(settings, "c_home_vip_enabled", true),
    cHomeVipTitle: readSetting(settings, "c_home_vip_title", "VIP 专属权益"),
    cHomeVipDesc: readSetting(settings, "c_home_vip_desc", "开通会员，享受每月免费体验名额"),
    cHomeVipButton: readSetting(settings, "c_home_vip_button", "立即开通"),
    cHomeHotTitle: readSetting(settings, "c_home_hot_title", "热门体验"),
    cHomeHotLinkText: readSetting(settings, "c_home_hot_link_text", "查看全部"),
    cHomeCustomModules: normalizeModules(readSetting(settings, "c_home_custom_modules", [])),
    cHomeSectionOrder: normalizeSectionOrder(readSetting(settings, "c_home_section_order", defaultSectionOrder)),
    cProfileHelpEnabled: readSetting(settings, "c_profile_help_enabled", true),
    cProfileHelpTitle: readSetting(settings, "c_profile_help_title", "帮助与反馈"),
    cProfileHelpSubtitle: readSetting(settings, "c_profile_help_subtitle", "常见问题、意见反馈与使用帮助"),
    cProfileHelpFaqs: normalizeFaqs(readSetting(settings, "c_profile_help_faqs", [])),
    cProfileHelpContactPhone: readSetting(settings, "c_profile_help_contact_phone", "400-XXX-XXXX"),
    cProfileHelpContactWechat: readSetting(settings, "c_profile_help_contact_wechat", ""),
    cProfileHelpContactHours: readSetting(settings, "c_profile_help_contact_hours", "09:00-22:00"),
    cGroupBookingRules: readSetting(settings, "c_group_booking_rules", "## 拼场规则\n\n1. 选择心仪的 VR 体验项目并发起拼场。\n2. 系统将自动为你匹配同日同场的其他玩家。\n3. 拼场成功后，按实际到场人数计费，未凑满最低开场人数可能会自动取消或改期。\n4. 请按预约时间提前到场签到，迟到可能影响拼场体验。\n5. 如需取消，请遵守退款规则，开场前 2 小时内可能无法退款。"),
  }
}

const sectionTabs: Array<{ key: SectionKey; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "home", label: "C端首页", desc: "Banner、搜索与会员卡", icon: Smartphone },
  { key: "modules", label: "内容模块", desc: "首页自定义内容卡片", icon: ImagePlus },
  { key: "layout", label: "模块排序", desc: "调整C端首页各模块顺序与显示", icon: ArrowUp },
  { key: "help", label: "帮助与反馈", desc: "FAQ与客服联系方式", icon: HelpCircle },
  { key: "groupBooking", label: "拼场规则", desc: "C端拼场规则页面内容", icon: Users },
]
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

const quickLinks = [
  { label: "首页", path: "/", icon: Smartphone },
  { label: "体验项目列表", path: "/venues", icon: ImagePlus },
  { label: "充值中心", path: "/recharge", icon: CreditCard },
  { label: "积分商城", path: "/points-mall", icon: Gift },
  { label: "会员权益", path: "/member-benefits", icon: Crown },
  { label: "我的订单", path: "/orders", icon: Receipt },
  { label: "我的优惠券", path: "/coupons", icon: Ticket },
  { label: "个人中心", path: "/profile", icon: User },
]

function LinkUrlInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ['settings-games'],
    queryFn: () => getGames({ status: 'ACTIVE' }),
    enabled: open,
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "/recharge 或 https://..."}
          className="flex-1"
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 h-10 px-3 rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:border-vraccent-primary hover:text-vraccent-primary transition-colors"
            title="选择跳转页面"
          >
            <Link2 className="w-4 h-4" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-vrborder-subtle">
          <p className="text-vr-body-sm font-semibold text-vrtext-primary">选择跳转页面</p>
          <p className="text-vr-caption text-vrtext-tertiary mt-0.5">点击常用页面快速填充链接</p>
        </div>
        <div className="p-2 max-h-[360px] overflow-y-auto">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <button
                key={link.path}
                type="button"
                onClick={() => { onChange(link.path); setOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-vrbg-elevated transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-vrbg-active flex items-center justify-center text-vraccent-primary">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-vr-body-sm text-vrtext-primary">{link.label}</p>
                  <p className="text-vr-caption text-vrtext-tertiary truncate">{link.path}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-vrtext-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )
          })}
          <div className="mt-2 pt-2 border-t border-vrborder-subtle">
            <p className="px-3 py-1 text-vr-caption text-vrtext-tertiary">游戏详情</p>
            {gamesLoading ? (
              <p className="px-3 py-2 text-vr-caption text-vrtext-tertiary">加载中...</p>
            ) : (games || []).filter((g: any) => g.status === 'ACTIVE').map((game: any) => (
              <button
                key={game.id}
                type="button"
                onClick={() => { onChange(`/game/${game.id}`); setOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-vrbg-elevated transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-vrbg-active flex items-center justify-center text-vraccent-primary">
                  <Gamepad2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-vr-body-sm text-vrtext-primary">{game.title}</p>
                  <p className="text-vr-caption text-vrtext-tertiary truncate">/game/{game.id}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-vrtext-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
        <div className="p-3 border-t border-vrborder-subtle bg-vrbg-surface/50">
          <p className="text-vr-caption text-vrtext-tertiary">
            提示：也可以手动输入外部链接，如 <span className="text-vraccent-primary">https://example.com</span> 或 <span className="text-vraccent-primary">tel:400-XXX-XXXX</span>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ImageUploadField({
  label,
  imageUrl,
  uploading,
  onUpload,
  onRemove,
  desc,
}: {
  label: string
  imageUrl: string
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  desc?: string
}) {
  const imageHint = desc || "支持 JPG、PNG、GIF、WebP、SVG，最大 5MB"

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

function validateVideoFile(file: File): string | null {
  const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]
  const validExt = /\.(mp4|webm|mov|m4v)$/i.test(file.name)
  if (!validTypes.includes(file.type) && !validExt) return "仅支持 MP4、WebM、MOV、M4V 视频"
  if (file.size > 300 * 1024 * 1024) return "视频大小不能超过 300MB"
  return null
}

function VideoUploadField({
  label,
  videoUrl,
  uploading,
  onUpload,
  onRemove,
  desc,
}: {
  label: string
  videoUrl: string
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  desc?: string
}) {
  return (
    <Field label={label}>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-44 aspect-video bg-vrbg-surface border border-vrborder-subtle rounded-lg flex items-center justify-center overflow-hidden">
            {videoUrl ? (
              <video src={getImageUrl(videoUrl)} className="w-full h-full object-contain bg-black" autoPlay muted loop playsInline preload="metadata" />
            ) : (
              <Video className="w-5 h-5 text-vrtext-muted" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="inline-flex items-center gap-2 px-4 py-2 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors cursor-pointer relative self-start">
              <Upload className="w-4 h-4" />
              {uploading ? "上传中..." : "上传视频"}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
                disabled={uploading}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.currentTarget.value = ""
                  if (!file) return
                  const err = validateVideoFile(file)
                  if (err) { toast.error(err); return }
                  onUpload(file)
                }}
              />
            </label>
            {desc && <p className="text-vr-caption text-vrtext-tertiary">{desc}</p>}
          </div>
          {videoUrl && (
            <button type="button" onClick={onRemove} className="px-3 py-2 rounded-lg text-vr-body-sm text-vrerror hover:bg-vrerror/10">
              移除
            </button>
          )}
        </div>
        {videoUrl && (
          <p className="text-vr-caption text-vrtext-tertiary break-all">
            当前视频：{videoUrl}
          </p>
        )}
      </div>
    </Field>
  )
}

function PreviewCard({ form }: { form: PageForm }) {
  const [activeBanner, setActiveBanner] = useState(0)

  const previewSection = (key: string) => {
    switch (key) {
      case "search":
        return (
          <div className="h-9 rounded-full bg-slate-100 px-3 flex items-center text-xs text-slate-400">
            {form.cHomeSearchPlaceholder || "搜索 VR 体验项目..."}
          </div>
        )
      case "banner":
        return form.cHomeBannerEnabled && form.cHomeBannerImages.length > 0 ? (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-violet-950 to-blue-950 p-4 text-white">
            {form.cHomeBannerImages[activeBanner]?.imageUrl && (
              <img src={getImageUrl(form.cHomeBannerImages[activeBanner].imageUrl)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
            <div className="relative">
              <p className="text-[11px] text-cyan-300 mb-1">{form.cHomeBannerImages[activeBanner]?.badge || "限时特惠"}</p>
              <p className="text-lg font-black leading-tight whitespace-pre-line">{form.cHomeBannerImages[activeBanner]?.title || "沉浸宇宙\n触手可及"}</p>
              <p className="text-[11px] text-white/75 mt-2">{form.cHomeBannerImages[activeBanner]?.subtitle || "全场体验项目最高 30% OFF"}</p>
            </div>
            {form.cHomeBannerImages.length > 1 && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                {form.cHomeBannerImages.map((_, i) => (
                  <button key={i} onClick={() => setActiveBanner(i)}
                    className={cn("h-1.5 rounded-full transition-all", i === activeBanner ? "w-5 bg-white" : "w-1.5 bg-white/50")}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null
      case "category":
        return form.cHomeCategoryEnabled ? (
          <div className="grid grid-cols-4 gap-2">
            {["动作", "冒险", "解谜", "联机"].map((tag, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-xl bg-slate-100" />
                <span className="text-[10px] text-slate-500">{tag}</span>
              </div>
            ))}
          </div>
        ) : null
      case "vip":
        return form.cHomeVipEnabled ? (
          <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 p-3 text-white flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">{form.cHomeVipTitle}</p>
              <p className="text-[10px] text-white/80 mt-0.5">{form.cHomeVipDesc}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-violet-600">{form.cHomeVipButton}</span>
          </div>
        ) : null
      case "customModules":
        return (
          <>
            {form.cHomeCustomModules.filter((m) => m.enabled).slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                {item.title.trim() && <p className="text-xs font-bold text-slate-900">{item.title}</p>}
                {item.videoUrl ? (
                  <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg bg-black">
                    <video src={getImageUrl(item.videoUrl)} className="w-full h-full object-contain" autoPlay muted loop playsInline preload="metadata" />
                  </div>
                ) : item.imageUrl ? (
                  <img src={getImageUrl(item.imageUrl)} alt="" className="mt-2 h-16 w-full rounded-lg object-cover" />
                ) : null}
                {item.content && <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{item.content}</p>}
                {item.linkUrl && <p className="mt-2 text-[11px] font-semibold text-violet-600">{item.buttonText || "查看详情"}</p>}
              </div>
            ))}
            {form.cHomeCustomModules.filter((m) => m.enabled).length > 3 && (
              <p className="text-center text-[11px] text-slate-400">...更多模块</p>
            )}
          </>
        )
      case "groupBuy":
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">团购推荐</span>
              <span className="text-slate-400">查看全部</span>
            </div>
            <div className="h-20 rounded-xl bg-gradient-to-r from-indigo-900 to-slate-900" />
          </div>
        )
      case "hot":
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">{form.cHomeHotTitle}</span>
              <span className="text-slate-400">{form.cHomeHotLinkText}</span>
            </div>
            <div className="h-24 rounded-xl bg-slate-100" />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="sticky top-6 space-y-4 scrollbar-hide">
      <div className="rounded-2xl border border-vrborder-subtle bg-vrbg-surface p-4">
        <div className="flex items-center gap-2 text-vr-body-sm font-semibold text-vrtext-primary mb-3">
          <Smartphone className="w-4 h-4 text-vraccent-primary" />
          C端首页预览
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm space-y-3">
          {form.cHomeSectionOrder.filter((s) => s.enabled).map((section) => (
            <div key={section.key}>{previewSection(section.key)}</div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-vrborder-subtle bg-vrbg-surface p-4">
        <div className="flex items-center gap-2 text-vr-body-sm font-semibold text-vrtext-primary mb-3">
          <HelpCircle className="w-4 h-4 text-vraccent-primary" />
          帮助与反馈页预览
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-900">常见问题</p>
          {form.cProfileHelpFaqs.slice(0, 3).map((faq, i) => (
            <div key={i} className="rounded-lg border border-slate-100 p-2">
              <p className="text-[11px] font-medium text-slate-700">{faq.question}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{faq.answer}</p>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Phone className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] text-slate-500">{form.cProfileHelpContactPhone}</span>
          </div>
        </div>
      </div>

    </div>
  )
}

function validateForm(form: PageForm): string | null {
  if (form.cHomeVipTitle.length > 30) return "会员卡标题不能超过30字"
  if (form.cHomeVipDesc.length > 100) return "会员卡说明不能超过100字"
  for (const faq of form.cProfileHelpFaqs) {
    if (faq.question.length > 100) return "FAQ问题不能超过100字"
    if (faq.answer.length > 500) return "FAQ回答不能超过500字"
  }
  return null
}
export function CustomerPageSettings({ settings }: { settings?: RawSettings }) {
  const queryClient = useQueryClient()
  const [active, setActive] = useState<SectionKey>("home")
  const [form, setForm] = useState<PageForm>(() => buildInitialForm(settings))
  const [saved, setSaved] = useState(false)
  const [uploadingBannerId, setUploadingBannerId] = useState<string | null>(null)
  const [uploadingModuleId, setUploadingModuleId] = useState<string | null>(null)
  const [uploadingModuleVideoId, setUploadingModuleVideoId] = useState<string | null>(null)
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

  const activeMeta = useMemo(() => sectionTabs.find((t) => t.key === active)!, [active])

  const update = <K extends keyof PageForm>(key: K, value: PageForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const addBanner = () => {
    setForm((prev) => ({
      ...prev,
      cHomeBannerImages: [...prev.cHomeBannerImages, {
        id: "banner-" + Date.now(),
        imageUrl: "",
        badge: "限时特惠",
        title: "新活动标题",
        subtitle: "活动副标题",
        linkUrl: "",
      }],
    }))
  }

  const updateBanner = (id: string, patch: Partial<BannerImage>) => {
    setForm((prev) => ({
      ...prev,
      cHomeBannerImages: prev.cHomeBannerImages.map((b) => b.id === id ? { ...b, ...patch } : b),
    }))
  }

  const removeBanner = (id: string) => {
    setForm((prev) => ({
      ...prev,
      cHomeBannerImages: prev.cHomeBannerImages.filter((b) => b.id !== id),
    }))
  }

  const moveBanner = (id: string, direction: -1 | 1) => {
    setForm((prev) => {
      const arr = [...prev.cHomeBannerImages]
      const idx = arr.findIndex((b) => b.id === id)
      const target = idx + direction
      if (idx < 0 || target < 0 || target >= arr.length) return prev
      const [item] = arr.splice(idx, 1)
      arr.splice(target, 0, item)
      return { ...prev, cHomeBannerImages: arr }
    })
  }

  const addModule = () => {
    setForm((prev) => ({
      ...prev,
      cHomeCustomModules: [...prev.cHomeCustomModules, {
        id: "module-" + Date.now(),
        title: "新模块",
        content: "",
        imageUrl: "",
        videoUrl: "",
        linkUrl: "",
        buttonText: "查看详情",
        layout: "card",
        enabled: true,
      }],
    }))
  }

  const updateModule = (id: string, patch: Partial<ContentCard>) => {
    setForm((prev) => ({
      ...prev,
      cHomeCustomModules: prev.cHomeCustomModules.map((m) => m.id === id ? { ...m, ...patch } : m),
    }))
  }

  const removeModule = (id: string) => {
    setForm((prev) => ({
      ...prev,
      cHomeCustomModules: prev.cHomeCustomModules.filter((m) => m.id !== id),
    }))
  }

  const moveModule = (id: string, direction: -1 | 1) => {
    setForm((prev) => {
      const arr = [...prev.cHomeCustomModules]
      const idx = arr.findIndex((m) => m.id === id)
      const target = idx + direction
      if (idx < 0 || target < 0 || target >= arr.length) return prev
      const [item] = arr.splice(idx, 1)
      arr.splice(target, 0, item)
      return { ...prev, cHomeCustomModules: arr }
    })
  }

  const sectionLabels: Record<string, string> = {
    search: "搜索栏",
    banner: "Banner 轮播",
    category: "标签快捷入口",
    vip: "会员权益",
    customModules: "自定义内容模块",
    groupBuy: "团购推荐",
    hot: "热门体验",
  }

  const updateSectionOrder = (fn: (arr: SectionOrderItem[]) => SectionOrderItem[]) => {
    setForm((prev) => {
      const next = fn([...prev.cHomeSectionOrder])
      const banner = next.find((s) => s.key === "banner")
      const category = next.find((s) => s.key === "category")
      const vip = next.find((s) => s.key === "vip")
      return {
        ...prev,
        cHomeSectionOrder: next,
        cHomeBannerEnabled: banner ? banner.enabled : prev.cHomeBannerEnabled,
        cHomeCategoryEnabled: category ? category.enabled : prev.cHomeCategoryEnabled,
        cHomeVipEnabled: vip ? vip.enabled : prev.cHomeVipEnabled,
      }
    })
  }

  const moveSection = (key: string, direction: -1 | 1) => {
    updateSectionOrder((arr) => {
      const idx = arr.findIndex((s) => s.key === key)
      const target = idx + direction
      if (idx < 0 || target < 0 || target >= arr.length) return arr
      const [item] = arr.splice(idx, 1)
      arr.splice(target, 0, item)
      return arr
    })
  }

  const toggleSection = (key: string, enabled: boolean) => {
    updateSectionOrder((arr) => arr.map((s) => s.key === key ? { ...s, enabled } : s))
  }

  const syncSectionEnabledFromFlags = (key: "banner" | "category" | "vip", value: boolean) => {
    setForm((prev) => ({
      ...prev,
      cHomeSectionOrder: prev.cHomeSectionOrder.map((s) => s.key === key ? { ...s, enabled: value } : s),
    }))
  }

  const addFaq = () => {
    setForm((prev) => ({
      ...prev,
      cProfileHelpFaqs: [...prev.cProfileHelpFaqs, { question: "", answer: "" }],
    }))
  }

  const updateFaq = (index: number, patch: Partial<FaqItem>) => {
    setForm((prev) => ({
      ...prev,
      cProfileHelpFaqs: prev.cProfileHelpFaqs.map((f, i) => i === index ? { ...f, ...patch } : f),
    }))
  }

  const removeFaq = (index: number) => {
    setForm((prev) => ({
      ...prev,
      cProfileHelpFaqs: prev.cProfileHelpFaqs.filter((_, i) => i !== index),
    }))
  }

  const moveFaq = (index: number, direction: -1 | 1) => {
    setForm((prev) => {
      const arr = [...prev.cProfileHelpFaqs]
      const target = index + direction
      if (target < 0 || target >= arr.length) return prev
      const [item] = arr.splice(index, 1)
      arr.splice(target, 0, item)
      return { ...prev, cProfileHelpFaqs: arr }
    })
  }

  const uploadBannerImage = async (file: File, bannerId: string) => {
    setUploadingBannerId(bannerId)
    try {
      const result = await uploadFile("pages", file)
      updateBanner(bannerId, { imageUrl: result.url })
      toast.success("上传成功")
    } catch (err) {
      toast.error("上传失败: " + (err as Error).message)
    } finally {
      setUploadingBannerId(null)
    }
  }

  const uploadModuleImage = async (file: File, moduleId: string) => {
    setUploadingModuleId(moduleId)
    try {
      const result = await uploadFile("pages", file)
      updateModule(moduleId, { imageUrl: result.url })
      toast.success("上传成功")
    } catch (err) {
      toast.error("上传失败: " + (err as Error).message)
    } finally {
      setUploadingModuleId(null)
    }
  }

  const uploadModuleVideo = async (file: File, moduleId: string) => {
    const error = validateVideoFile(file)
    if (error) { toast.error(error); return }

    setUploadingModuleVideoId(moduleId)
    try {
      const result = await uploadFile("pages", file)
      updateModule(moduleId, { videoUrl: result.url })
      toast.success("视频上传成功")
    } catch (err) {
      toast.error("上传失败: " + (err as Error).message)
    } finally {
      setUploadingModuleVideoId(null)
    }
  }

  const handleSave = () => {
    const err = validateForm(form)
    if (err) { toast.error(err); return }
    setConfirmOpen(true)
  }

  const doSave = () => {
    mutation.mutate([
      { key: "c_home_search_placeholder", value: form.cHomeSearchPlaceholder, category: "page" },
      { key: "c_home_banner_enabled", value: form.cHomeBannerEnabled, category: "page" },
      { key: "c_home_banner_images", value: form.cHomeBannerImages, category: "page" },
      { key: "c_home_category_enabled", value: form.cHomeCategoryEnabled, category: "page" },
      { key: "c_home_vip_enabled", value: form.cHomeVipEnabled, category: "page" },
      { key: "c_home_vip_title", value: form.cHomeVipTitle, category: "page" },
      { key: "c_home_vip_desc", value: form.cHomeVipDesc, category: "page" },
      { key: "c_home_vip_button", value: form.cHomeVipButton, category: "page" },
      { key: "c_home_hot_title", value: form.cHomeHotTitle, category: "page" },
      { key: "c_home_hot_link_text", value: form.cHomeHotLinkText, category: "page" },
      { key: "c_home_custom_modules", value: form.cHomeCustomModules, category: "page" },
      { key: "c_home_section_order", value: form.cHomeSectionOrder, category: "page" },
      { key: "c_profile_help_enabled", value: form.cProfileHelpEnabled, category: "page" },
      { key: "c_profile_help_title", value: form.cProfileHelpTitle, category: "page" },
      { key: "c_profile_help_subtitle", value: form.cProfileHelpSubtitle, category: "page" },
      { key: "c_profile_help_faqs", value: form.cProfileHelpFaqs, category: "page" },
      { key: "c_profile_help_contact_phone", value: form.cProfileHelpContactPhone, category: "page" },
      { key: "c_profile_help_contact_wechat", value: form.cProfileHelpContactWechat, category: "page" },
      { key: "c_profile_help_contact_hours", value: form.cProfileHelpContactHours, category: "page" },
      { key: "c_group_booking_rules", value: form.cGroupBookingRules, category: "page" },

    ])
  }

  const resetSection = (section: SectionKey) => {
    const defaults = buildInitialForm(undefined)
    switch (section) {
      case "home":
        setForm((prev) => ({
          ...prev,
          cHomeSearchPlaceholder: defaults.cHomeSearchPlaceholder, cHomeBannerEnabled: defaults.cHomeBannerEnabled,
          cHomeBannerImages: defaults.cHomeBannerImages, cHomeCategoryEnabled: defaults.cHomeCategoryEnabled,
          cHomeVipEnabled: defaults.cHomeVipEnabled, cHomeVipTitle: defaults.cHomeVipTitle,
          cHomeVipDesc: defaults.cHomeVipDesc, cHomeVipButton: defaults.cHomeVipButton,
          cHomeHotTitle: defaults.cHomeHotTitle, cHomeHotLinkText: defaults.cHomeHotLinkText,
        }))
        break
      case "modules":
        setForm((prev) => ({ ...prev, cHomeCustomModules: defaults.cHomeCustomModules }))
        break
      case "help":
        setForm((prev) => ({
          ...prev,
          cProfileHelpEnabled: defaults.cProfileHelpEnabled, cProfileHelpTitle: defaults.cProfileHelpTitle,
          cProfileHelpSubtitle: defaults.cProfileHelpSubtitle, cProfileHelpFaqs: defaults.cProfileHelpFaqs,
          cProfileHelpContactPhone: defaults.cProfileHelpContactPhone, cProfileHelpContactWechat: defaults.cProfileHelpContactWechat,
          cProfileHelpContactHours: defaults.cProfileHelpContactHours,
        }))
        break
      case "groupBooking":
        setForm((prev) => ({ ...prev, cGroupBookingRules: defaults.cGroupBookingRules }))
        break
    }
    toast.success("已恢复默认值")
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-vr-h2 text-vrtext-primary">C端页面设置</h2>
          <p className="text-vr-body-sm text-vrtext-tertiary mt-1">配置C端首页、帮助反馈、联系门店的展示内容</p>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 mb-6 border-b border-vrborder-subtle pb-0 overflow-hidden">
            {sectionTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = active === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActive(tab.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-vr-body-sm font-medium border-b-2 -mb-[1px] transition-colors whitespace-nowrap",
                    isActive
                      ? "border-vraccent-primary text-vraccent-primary"
                      : "border-transparent text-vrtext-secondary hover:text-vrtext-primary"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

            {active === "home" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-vr-body-sm text-vrtext-tertiary">{activeMeta.desc}</p>
                  <button onClick={() => resetSection("home")} className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors">
                    恢复默认
                  </button>
                </div>

                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4 text-vraccent-primary" />
                      <p className="text-vr-body-sm font-semibold text-vrtext-primary">首页 Banner</p>
                    </div>
                    <Switch checked={form.cHomeBannerEnabled} onCheckedChange={(v) => { update("cHomeBannerEnabled", v); syncSectionEnabledFromFlags("banner", v) }} />
                  </div>
                  {form.cHomeBannerImages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-vrborder-subtle py-8 text-center">
                      <Image className="w-8 h-8 mx-auto text-vrtext-muted mb-2" />
                      <p className="text-vr-body-sm text-vrtext-secondary">暂无 Banner</p>
                      <p className="text-vr-caption text-vrtext-tertiary mt-1">支持多张 Banner 轮播展示</p>
                      <button onClick={addBanner} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-vraccent-primary text-white text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors">
                        <Plus className="w-4 h-4" />添加 Banner
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {form.cHomeBannerImages.map((banner, index) => (
                        <div key={banner.id} className="rounded-xl border border-vrborder-subtle bg-vrbg-card p-4">
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-lg bg-vrbg-active text-vraccent-primary flex items-center justify-center text-vr-body-sm font-semibold">
                                {index + 1}
                              </span>
                              <div>
                                <p className="text-vr-body-sm font-semibold text-vrtext-primary">Banner {index + 1}</p>
                                <p className="text-vr-caption text-vrtext-tertiary">{banner.title}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => moveBanner(banner.id, -1)} disabled={index === 0}
                                className="p-2 rounded-lg text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40">
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button type="button" onClick={() => moveBanner(banner.id, 1)} disabled={index === form.cHomeBannerImages.length - 1}
                                className="p-2 rounded-lg text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40">
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <button type="button" onClick={() => removeBanner(banner.id)}
                                className="p-2 rounded-lg text-vrerror hover:bg-vrerror/10">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <ImageUploadField label="Banner 图片" imageUrl={banner.imageUrl}
                              uploading={uploadingBannerId === banner.id}
                              onUpload={(f) => uploadBannerImage(f, banner.id)}
                              onRemove={() => updateBanner(banner.id, { imageUrl: "" })}
                              desc="建议比例 16:9，大小不超过 5MB" />
                            <Field label="角标文案">
                              <TextInput value={banner.badge} onChange={(e) => updateBanner(banner.id, { badge: e.target.value })} maxLength={20} />
                            </Field>
                            <Field label="标题">
                              <TextArea rows={2} value={banner.title} onChange={(e) => updateBanner(banner.id, { title: e.target.value })} maxLength={50} />
                            </Field>
                            <Field label="副标题">
                              <TextInput value={banner.subtitle} onChange={(e) => updateBanner(banner.id, { subtitle: e.target.value })} maxLength={50} />
                            </Field>
                            <Field label="点击跳转链接" desc="可选，点击 Banner 跳转到指定页面">
                              <LinkUrlInput value={banner.linkUrl} onChange={(v) => updateBanner(banner.id, { linkUrl: v })} placeholder="/recharge 或 https://..." />
                            </Field>
                          </div>
                        </div>
                      ))}
                      <button onClick={addBanner} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:border-vraccent-primary hover:text-vraccent-primary transition-colors">
                        <Plus className="w-4 h-4" />添加 Banner
                      </button>
                    </div>
                  )}
                </div>

                <Field label="搜索框占位文字">
                  <TextInput value={form.cHomeSearchPlaceholder} onChange={(e) => update("cHomeSearchPlaceholder", e.target.value)} maxLength={30} />
                </Field>

                <div className="flex items-center justify-between rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4">
                  <div>
                    <p className="text-vr-body-sm font-semibold text-vrtext-primary">标签快捷入口</p>
                    <p className="text-vr-caption text-vrtext-tertiary mt-1">根据已上架游戏标签自动生成</p>
                  </div>
                  <Switch checked={form.cHomeCategoryEnabled} onCheckedChange={(v) => { update("cHomeCategoryEnabled", v); syncSectionEnabledFromFlags("category", v) }} />
                </div>

                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-vraccent-primary" />
                      <p className="text-vr-body-sm font-semibold text-vrtext-primary">会员权益卡片</p>
                    </div>
                    <Switch checked={form.cHomeVipEnabled} onCheckedChange={(v) => { update("cHomeVipEnabled", v); syncSectionEnabledFromFlags("vip", v) }} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Field label="标题">
                      <TextInput value={form.cHomeVipTitle} onChange={(e) => update("cHomeVipTitle", e.target.value)} maxLength={30} />
                    </Field>
                    <Field label="按钮文案">
                      <TextInput value={form.cHomeVipButton} onChange={(e) => update("cHomeVipButton", e.target.value)} maxLength={20} />
                    </Field>
                    <Field label="说明文字">
                      <TextInput value={form.cHomeVipDesc} onChange={(e) => update("cHomeVipDesc", e.target.value)} maxLength={100} />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Field label="热门体验标题">
                    <TextInput value={form.cHomeHotTitle} onChange={(e) => update("cHomeHotTitle", e.target.value)} maxLength={20} />
                  </Field>
                  <Field label="查看全部文案">
                    <TextInput value={form.cHomeHotLinkText} onChange={(e) => update("cHomeHotLinkText", e.target.value)} maxLength={20} />
                  </Field>
                </div>
              </div>
            )}
            {active === "modules" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-vr-body-sm text-vrtext-tertiary">{activeMeta.desc}</p>
                    <p className="text-vr-caption text-vrtext-tertiary mt-0.5">灵活的内容卡片，支持图文、视频、链接组合，显示在C端首页会员卡与热门体验之间</p>
                  </div>
                  <button onClick={() => resetSection("modules")} className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors">
                    恢复默认
                  </button>
                </div>

                {form.cHomeCustomModules.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-vrborder-subtle bg-vrbg-surface py-12 text-center">
                    <ImagePlus className="w-10 h-10 mx-auto text-vrtext-muted mb-3" />
                    <p className="text-vr-body-sm text-vrtext-secondary">暂无内容模块</p>
                    <p className="text-vr-caption text-vrtext-tertiary mt-1">添加灵活的内容卡片，支持图文、视频、链接组合</p>
                    <button onClick={addModule} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-vraccent-primary text-white text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors">
                      <Plus className="w-4 h-4" />添加模块
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.cHomeCustomModules.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-vrbg-active text-vraccent-primary flex items-center justify-center text-vr-body-sm font-semibold">
                              {index + 1}
                            </span>
                            <div>
                              <p className="text-vr-body-sm font-semibold text-vrtext-primary">模块 {index + 1}</p>
                              <p className="text-vr-caption text-vrtext-tertiary">{item.layout === "banner" ? "通栏横幅" : "卡片"} · {item.title || "未命名"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => moveModule(item.id, -1)} disabled={index === 0}
                              className="p-2 rounded-lg text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40">
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => moveModule(item.id, 1)} disabled={index === form.cHomeCustomModules.length - 1}
                              className="p-2 rounded-lg text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40">
                              <ArrowDown className="w-4 h-4" />
                            </button>
                            <Switch checked={item.enabled} onCheckedChange={(v) => updateModule(item.id, { enabled: v })} />
                            <button type="button" onClick={() => removeModule(item.id)}
                              className="p-2 rounded-lg text-vrerror hover:bg-vrerror/10">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <Field label="标题" desc="可留空，留空后 C 端不展示标题。">
                            <TextInput value={item.title} onChange={(e) => updateModule(item.id, { title: e.target.value })} maxLength={50} />
                          </Field>
                          <Field label="布局样式">
                            <select value={item.layout} onChange={(e) => updateModule(item.id, { layout: e.target.value as "card" | "banner" })}
                              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary">
                              <option value="card">卡片式</option>
                              <option value="banner">通栏横幅</option>
                            </select>
                          </Field>
                          <Field label="正文内容">
                            <TextArea rows={3} value={item.content} onChange={(e) => updateModule(item.id, { content: e.target.value })} maxLength={500} />
                          </Field>
                          <ImageUploadField label="配图（可选）" imageUrl={item.imageUrl}
                            uploading={uploadingModuleId === item.id}
                            onUpload={(f) => uploadModuleImage(f, item.id)}
                            onRemove={() => updateModule(item.id, { imageUrl: "" })} />
                          <VideoUploadField
                            label="本地视频（可选）"
                            videoUrl={item.videoUrl}
                            uploading={uploadingModuleVideoId === item.id}
                            onUpload={(f) => uploadModuleVideo(f, item.id)}
                            onRemove={() => updateModule(item.id, { videoUrl: "" })}
                            desc="建议上传 MP4/WebM，最大 300MB。视频存在时会优先显示视频。"
                          />
                          <Field label="视频直链（可选）" desc="必须是可直接播放的视频文件地址，例如 https://.../video.mp4；普通网页链接无法播放。">
                            <TextInput value={item.videoUrl} onChange={(e) => updateModule(item.id, { videoUrl: e.target.value })} placeholder="https://.../video.mp4" />
                          </Field>
                          <Field label="跳转链接（可选）">
                            <LinkUrlInput value={item.linkUrl} onChange={(v) => updateModule(item.id, { linkUrl: v })} placeholder="/recharge 或 https://..." />
                          </Field>
                          {item.linkUrl && (
                            <Field label="按钮文案">
                              <TextInput value={item.buttonText} onChange={(e) => updateModule(item.id, { buttonText: e.target.value })} maxLength={20} />
                            </Field>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={addModule} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:border-vraccent-primary hover:text-vraccent-primary transition-colors">
                      <Plus className="w-4 h-4" />添加模块
                    </button>
                  </div>
                )}
              </div>
            )}
            {active === "layout" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-vr-body-sm text-vrtext-tertiary">{activeMeta.desc}</p>
                    <p className="text-vr-caption text-vrtext-tertiary mt-0.5">拖动或点击上下箭头调整模块顺序，关闭后C端首页不展示该模块</p>
                  </div>
                  <button
                    onClick={() => setForm((prev) => ({ ...prev, cHomeSectionOrder: defaultSectionOrder.map((s) => ({ ...s })) }))}
                    className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors"
                  >
                    恢复默认
                  </button>
                </div>

                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-3">
                  {form.cHomeSectionOrder.map((section, index) => (
                    <div
                      key={section.key}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors",
                        section.enabled ? "bg-vrbg-card border-vrborder-subtle" : "bg-vrbg-surface border-vrborder-subtle opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-vrbg-active text-vraccent-primary flex items-center justify-center text-vr-body-sm font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-vr-body-sm font-medium text-vrtext-primary">
                          {sectionLabels[section.key] || section.key}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveSection(section.key, -1)}
                          disabled={index === 0}
                          className="p-2 rounded-lg text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(section.key, 1)}
                          disabled={index === form.cHomeSectionOrder.length - 1}
                          className="p-2 rounded-lg text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <Switch
                          checked={section.enabled}
                          onCheckedChange={(v) => toggleSection(section.key, v)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-vraccent-primary/10 border border-vraccent-primary/20 p-3">
                  <p className="text-vr-caption text-vraccent-primary">
                    提示：Banner、标签入口、会员权益的开关会与「C端首页」Tab 中的对应开关保持同步。
                  </p>
                </div>
              </div>
            )}
            {active === "help" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-vr-body-sm text-vrtext-tertiary">编辑C端帮助与反馈页面的内容</p>
                  <button onClick={() => resetSection("help")} className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors">
                    恢复默认
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4">
                  <div>
                    <p className="text-vr-body-sm font-semibold text-vrtext-primary">在「我的」页面显示帮助入口</p>
                    <p className="text-vr-caption text-vrtext-tertiary mt-1">关闭后C端我的页面不显示帮助与反馈入口</p>
                  </div>
                  <Switch checked={form.cProfileHelpEnabled} onCheckedChange={(v) => update("cProfileHelpEnabled", v)} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Field label="入口标题">
                    <TextInput value={form.cProfileHelpTitle} onChange={(e) => update("cProfileHelpTitle", e.target.value)} maxLength={20} />
                  </Field>
                  <Field label="入口说明">
                    <TextInput value={form.cProfileHelpSubtitle} onChange={(e) => update("cProfileHelpSubtitle", e.target.value)} maxLength={50} />
                  </Field>
                </div>

                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-vr-body-sm font-semibold text-vrtext-primary">常见问题 (FAQ)</p>
                      <p className="text-vr-caption text-vrtext-tertiary mt-0.5">C端帮助页面展示的常见问题列表</p>
                    </div>
                    <button onClick={addFaq} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:border-vraccent-primary hover:text-vraccent-primary transition-colors">
                      <Plus className="w-4 h-4" />添加问题
                    </button>
                  </div>
                  {form.cProfileHelpFaqs.length === 0 ? (
                    <p className="text-vr-caption text-vrtext-tertiary text-center py-4">暂无FAQ，点击上方按钮添加</p>
                  ) : (
                    <div className="space-y-3">
                      {form.cProfileHelpFaqs.map((faq, index) => (
                        <div key={index} className="rounded-lg border border-vrborder-subtle bg-vrbg-card p-3">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <span className="text-vr-caption text-vrtext-tertiary">#{index + 1}</span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => moveFaq(index, -1)} disabled={index === 0}
                                className="p-1.5 rounded text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40">
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => moveFaq(index, 1)} disabled={index === form.cProfileHelpFaqs.length - 1}
                                className="p-1.5 rounded text-vrtext-tertiary hover:bg-vrbg-elevated disabled:opacity-40">
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => removeFaq(index)}
                                className="p-1.5 rounded text-vrerror hover:bg-vrerror/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <Field label="问题">
                            <TextInput value={faq.question} onChange={(e) => updateFaq(index, { question: e.target.value })} maxLength={100} placeholder="例如：如何充值会员？" />
                          </Field>
                          <div className="mt-3">
                            <Field label="回答">
                              <TextArea rows={3} value={faq.answer} onChange={(e) => updateFaq(index, { answer: e.target.value })} maxLength={500} placeholder="输入回答内容..." />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
                  <p className="text-vr-body-sm font-semibold text-vrtext-primary">客服联系方式</p>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Field label="客服电话">
                      <TextInput value={form.cProfileHelpContactPhone} onChange={(e) => update("cProfileHelpContactPhone", e.target.value)} placeholder="400-XXX-XXXX" />
                    </Field>
                    <Field label="客服微信">
                      <TextInput value={form.cProfileHelpContactWechat} onChange={(e) => update("cProfileHelpContactWechat", e.target.value)} placeholder="微信号" />
                    </Field>
                    <Field label="客服工作时间">
                      <TextInput value={form.cProfileHelpContactHours} onChange={(e) => update("cProfileHelpContactHours", e.target.value)} placeholder="09:00-22:00" />
                    </Field>
                  </div>
                </div>
              </div>
            )}
            {active === "groupBooking" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-vr-body-sm text-vrtext-tertiary">编辑C端拼场规则页面的内容，支持 Markdown 简单语法（# 标题、## 标题、1. 列表）</p>
                  <button onClick={() => resetSection("groupBooking")} className="text-vr-caption text-vrtext-muted hover:text-vrtext-secondary transition-colors">
                    恢复默认
                  </button>
                </div>

                <div className="rounded-xl border border-vrborder-subtle bg-vrbg-surface p-4 space-y-4">
                  <Field label="规则内容" desc="C端「拼场规则」页面展示的正文，按段落和换行自动排版。">
                    <TextArea
                      rows={16}
                      value={form.cGroupBookingRules}
                      onChange={(e) => update("cGroupBookingRules", e.target.value)}
                      placeholder="输入拼场规则内容..."
                    />
                  </Field>
                </div>
              </div>
            )}
          </motion.div>

          <div className="flex items-center justify-between rounded-xl border border-vrborder-subtle bg-vrbg-card p-4 mt-8">
            <p className="text-vr-body-sm text-vrtext-tertiary">
              保存后将立即更新 C 端展示内容，请确认无误后再保存。
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

        <div className="hidden xl:block w-[320px] shrink-0 overflow-hidden">
          <PreviewCard form={form} />
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-vrbg-card rounded-2xl border border-vrborder-subtle p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-vr-h4 text-vrtext-primary font-semibold">确认保存</h3>
            <p className="text-vr-body-sm text-vrtext-secondary mt-2">
              保存后将立即更新 C 端首页、帮助反馈、拼场规则、联系门店的展示内容，确认保存？
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
