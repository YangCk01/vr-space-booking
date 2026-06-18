import { Request, Response } from "express"
import { prisma } from "../utils/prisma"
import { success, error } from "../utils/response"
import { getMemberLevels, getPointsConfig } from "../utils/memberConfig"
import { getConfig } from "../services/configService"

interface RefundTier {
  hours: number
  rate: number
  label: string
}

function unwrapSetting(raw: any) {
  return raw !== null && typeof raw === "object" && "value" in raw ? raw.value : raw
}

async function readSettingsMap(keys: string[]) {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  })
  const result: Record<string, any> = {}
  for (const row of rows) {
    result[row.key] = unwrapSetting(row.value)
  }
  return result
}

/** 公开接口：返回会员相关配置（供C端使用） */
export async function memberPublic(req: Request, res: Response) {
  try {
    const [levels, points] = await Promise.all([
      getMemberLevels(),
      getPointsConfig(),
    ])
    return success(res, { levels, points })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 公开接口：返回B/C端页面展示配置（供C端首页使用） */
export async function pagePublic(req: Request, res: Response) {
  try {
    const keys = [
      "venue_name",
      "venue_address",
      "venue_phone",
      "venue_hours",
      "venue_description",
      "company_website",
      "logo",
      "service_qr",
      "c_home_search_placeholder",
      "c_home_banner_enabled",
      "c_home_banner_images",
      "c_home_banner_image",
      "c_home_banner_badge",
      "c_home_banner_title",
      "c_home_banner_subtitle",
      "c_home_category_enabled",
      "c_home_vip_enabled",
      "c_home_vip_title",
      "c_home_vip_desc",
      "c_home_vip_button",
      "c_home_hot_title",
      "c_home_hot_link_text",
      "c_home_custom_modules",
      "c_home_section_order",
      "c_profile_help_enabled",
      "c_profile_help_title",
      "c_profile_help_subtitle",
      "c_profile_help_faqs",
      "c_profile_help_contact_phone",
      "c_profile_help_contact_wechat",
      "c_profile_help_contact_hours",
      "c_profile_contact_enabled",
      "c_profile_contact_title",
      "c_profile_contact_subtitle",
      "c_profile_contact_phones",
      "c_profile_contact_address",
      "c_profile_contact_hours",
      "c_profile_contact_qr",
      "c_profile_contact_map_links",
      "b_home_notice_enabled",
      "b_home_notice_title",
      "b_home_notice_content",
      "b_home_notice_level",
      "b_home_stats_title",
      "b_home_metric_note",
      "b_home_schedule_title",
      "b_home_orders_title",
      "b_login_title",
      "b_login_subtitle",
      "b_login_form_title",
      "b_login_form_desc",
      "b_login_hero_title",
      "b_login_hero_desc",
      "b_login_background_image",
      "b_login_background_video",
      "b_login_background_overlay",
      "b_login_show_demo_account",
      "b_login_demo_account_text",
      "b_login_support_text",
      "b_login_security_text",
      "b_login_footer_text",
      "b_login_feature_cards",
    ]
    const map = await readSettingsMap(keys)

    // Banner images: prefer new array, fallback to old single image
    let bannerImages: any[] = []
    if (Array.isArray(map.c_home_banner_images) && map.c_home_banner_images.length > 0) {
      bannerImages = map.c_home_banner_images
    } else if (map.c_home_banner_image) {
      bannerImages = [{
        id: "legacy-banner",
        imageUrl: map.c_home_banner_image,
        badge: map.c_home_banner_badge ?? "限时特惠",
        title: map.c_home_banner_title ?? "沉浸宇宙\n触手可及",
        subtitle: map.c_home_banner_subtitle ?? "全场体验项目最高 30% OFF",
        linkUrl: "",
      }]
    }

    return success(res, {
      venueName: map.venue_name ?? "VR大空间体验馆",
      venueAddress: map.venue_address ?? "",
      venuePhone: map.venue_phone ?? "",
      venueHours: map.venue_hours ?? "09:00-22:00",
      venueDescription: map.venue_description ?? "VR大空间体验馆提供沉浸式虚拟现实体验，支持多人联机互动。",
      companyWebsite: map.company_website ?? "",
      logo: map.logo ?? "",
      serviceQr: map.service_qr ?? "",
      cHomeSearchPlaceholder: map.c_home_search_placeholder ?? "搜索 VR 体验项目...",
      cHomeBannerEnabled: map.c_home_banner_enabled ?? true,
      cHomeBannerImages: bannerImages,
      cHomeCategoryEnabled: map.c_home_category_enabled ?? true,
      cHomeVipEnabled: map.c_home_vip_enabled ?? true,
      cHomeVipTitle: map.c_home_vip_title ?? "VIP 专属权益",
      cHomeVipDesc: map.c_home_vip_desc ?? "开通会员，享受每月免费体验名额",
      cHomeVipButton: map.c_home_vip_button ?? "立即开通",
      cHomeHotTitle: map.c_home_hot_title ?? "热门体验",
      cHomeHotLinkText: map.c_home_hot_link_text ?? "查看全部",
      cHomeCustomModules: Array.isArray(map.c_home_custom_modules) ? map.c_home_custom_modules : [],
      cHomeSectionOrder: Array.isArray(map.c_home_section_order) ? map.c_home_section_order : [
        { key: "search", enabled: true },
        { key: "banner", enabled: true },
        { key: "category", enabled: true },
        { key: "vip", enabled: true },
        { key: "customModules", enabled: true },
        { key: "groupBuy", enabled: true },
        { key: "hot", enabled: true },
      ],
      cProfileHelpEnabled: map.c_profile_help_enabled ?? true,
      cProfileHelpTitle: map.c_profile_help_title ?? "帮助与反馈",
      cProfileHelpSubtitle: map.c_profile_help_subtitle ?? "常见问题、意见反馈与使用帮助",
      cProfileHelpFaqs: Array.isArray(map.c_profile_help_faqs) ? map.c_profile_help_faqs : [
        { question: "如何充值会员？", answer: "进入「我的」→「会员储值」，选择充值档位，支持微信支付和支付宝。充值后本金和赠送金额即时到账。" },
        { question: "积分如何获取和使用？", answer: "消费时按本金消耗金额返还积分（1元返1积分）。积分可在下单时抵扣，100积分抵1元，最高可抵扣订单金额的30%。" },
        { question: "如何退款？", answer: "未核销的订单可在「我的订单」中申请退款。已核销订单不支持退款。退款金额按消费时的本金/赠送比例原路退回。" },
        { question: "余额的有效期是多久？", answer: "充值本金无有效期限制。赠送金额无有效期限制，但退款时赠送部分不予退还。" },
      ],
      cProfileHelpContactPhone: map.c_profile_help_contact_phone ?? "400-XXX-XXXX",
      cProfileHelpContactWechat: map.c_profile_help_contact_wechat ?? "",
      cProfileHelpContactHours: map.c_profile_help_contact_hours ?? "09:00-22:00",
      cGroupBookingRules: map.c_group_booking_rules ?? "## 拼场规则\n\n1. 选择心仪的 VR 体验项目并发起拼场。\n2. 系统将自动为你匹配同日同场的其他玩家。\n3. 拼场成功后，按实际到场人数计费，未凑满最低开场人数可能会自动取消或改期。\n4. 请按预约时间提前到场签到，迟到可能影响拼场体验。\n5. 如需取消，请遵守退款规则，开场前 2 小时内可能无法退款。",
      cProfileContactEnabled: map.c_profile_contact_enabled ?? true,
      cProfileContactTitle: map.c_profile_contact_title ?? "联系门店",
      cProfileContactSubtitle: map.c_profile_contact_subtitle ?? "查看电话、地址与营业时间",
      cProfileContactPhones: Array.isArray(map.c_profile_contact_phones) ? map.c_profile_contact_phones : [],
      cProfileContactAddress: map.c_profile_contact_address ?? "",
      cProfileContactHours: map.c_profile_contact_hours ?? "",
      cProfileContactQr: map.c_profile_contact_qr ?? "",
      cProfileContactMapLinks: Array.isArray(map.c_profile_contact_map_links) ? map.c_profile_contact_map_links : [],
      bHomeNoticeEnabled: map.b_home_notice_enabled ?? true,
      bHomeNoticeTitle: map.b_home_notice_title ?? "今日运营提醒",
      bHomeNoticeContent: map.b_home_notice_content ?? "重点关注待核销订单、设备状态与退款审批，异常请及时处理。",
      bHomeNoticeLevel: map.b_home_notice_level ?? "info",
      bHomeStatsTitle: map.b_home_stats_title ?? "核心指标",
      bHomeMetricNote: map.b_home_metric_note ?? "营业额按付款时间统计 · 预约/核销按到场日期统计",
      bHomeScheduleTitle: map.b_home_schedule_title ?? "今日排场",
      bHomeOrdersTitle: map.b_home_orders_title ?? "最新订单",
      bLoginTitle: map.b_login_title ?? "VR大空间",
      bLoginSubtitle: map.b_login_subtitle ?? "预约排场管理系统",
      bLoginFormTitle: map.b_login_form_title ?? "登录管理后台",
      bLoginFormDesc: map.b_login_form_desc ?? "处理预约、排场、财务与门店运营",
      bLoginHeroTitle: map.b_login_hero_title ?? "沉浸式门店运营中枢",
      bLoginHeroDesc: map.b_login_hero_desc ?? "统一管理预约排场、订单核销、会员权益与财务对账。",
      bLoginBackgroundImage: map.b_login_background_image ?? "",
      bLoginBackgroundVideo: map.b_login_background_video ?? "",
      bLoginBackgroundOverlay: map.b_login_background_overlay ?? 72,
      bLoginShowDemoAccount: map.b_login_show_demo_account ?? true,
      bLoginDemoAccountText: map.b_login_demo_account_text ?? "测试账号: 13800000000 / admin123",
      bLoginSupportText: map.b_login_support_text ?? "遇到登录问题请联系系统管理员",
      bLoginSecurityText: map.b_login_security_text ?? "登录后将记录操作审计日志",
      bLoginFooterText: map.b_login_footer_text ?? "",
      bLoginFeatureCards: Array.isArray(map.b_login_feature_cards) ? map.b_login_feature_cards : [],
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 公开接口：返回退款阶梯规则（供C端订单页展示） */
export async function refundRules(req: Request, res: Response) {
  try {
    const [tierSetting, cancelSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "booking_refund_tiers" } }),
      prisma.systemSetting.findUnique({ where: { key: "booking_cancel_hours" } }),
    ])
    const tierRaw = tierSetting?.value as any
    const cancelRaw = cancelSetting?.value as any
    const raw = unwrapSetting(tierRaw) as RefundTier[] | undefined
    const cancelHours = unwrapSetting(cancelRaw) ?? 2
    const tiers: RefundTier[] = raw && Array.isArray(raw) && raw.length > 0
      ? raw
      : [
          { hours: 24, rate: 100, label: "开场24小时前" },
          { hours: 2, rate: 50, label: "开场2-24小时" },
        ]
    return success(res, { tiers, cancelHours })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 公开接口：返回预约相关配置（供C端使用） */
export async function bookingConfig(req: Request, res: Response) {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "booking_advance_days" } })
    const raw = setting?.value as any
    const value = unwrapSetting(raw)
    const advanceDays = typeof value === "number" ? value : 7
    return success(res, { advanceDays })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

/** 公开接口：返回预约生命周期配置（供C端使用） */
export async function bookingLifecycle(req: Request, res: Response) {
  try {
    const keys = [
      "verify_advance_minutes",
      "late_buffer_minutes",
      "no_show_deadline_minutes",
      "no_show_penalty_rate",
      "reschedule_fee_rate",
      "reschedule_deadline_hours",
      "reschedule_max_count",
      "reschedule_allow_after_start",
      "reschedule_after_start_minutes",
    ]
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    })
    const map: Record<string, any> = {}
    for (const s of settings) {
      const raw = s.value as any
      map[s.key] = unwrapSetting(raw)
    }
    return success(res, {
      verifyAdvanceMinutes: map.verify_advance_minutes ?? 15,
      lateBufferMinutes: map.late_buffer_minutes ?? 10,
      noShowDeadlineMinutes: map.no_show_deadline_minutes ?? 15,
      noShowPenaltyRate: map.no_show_penalty_rate ?? 100,
      rescheduleFeeRate: map.reschedule_fee_rate ?? 10,
      rescheduleDeadlineHours: map.reschedule_deadline_hours ?? 2,
      rescheduleMaxCount: map.reschedule_max_count ?? 1,
      rescheduleAllowAfterStart: map.reschedule_allow_after_start ?? true,
      rescheduleAfterStartMinutes: map.reschedule_after_start_minutes ?? 15,
    })
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function list(req: Request, res: Response) {
  try {
    const category = req.query.category as string | undefined
    const where: any = {}
    if (category) where.category = category

    const settings = await prisma.systemSetting.findMany({
      where,
      orderBy: { key: "asc" },
    })

    const result: Record<string, any> = {}
    for (const s of settings) {
      const raw = s.value as any
      if (raw !== null && typeof raw === "object" && "value" in raw) {
        result[s.key] = raw
      } else {
        result[s.key] = { value: raw }
      }
    }

    return success(res, result)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function getByKey(req: Request, res: Response) {
  try {
    const key = req.params.key as string
    const setting = await prisma.systemSetting.findUnique({ where: { key } })

    if (!setting) {
      return error(res, "设置项不存在", 404)
    }

    return success(res, setting.value)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function update(req: Request, res: Response) {
  try {
    const { key, value, category } = req.body

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value, category: category || "general" },
      create: { key, value, category: category || "general" },
    })

    return success(res, setting, "设置保存成功")
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}

export async function bulkUpdate(req: Request, res: Response) {
  try {
    const settings = req.body as Array<{ key: string; value: any; category?: string }>

    for (const s of settings) {
      await prisma.systemSetting.upsert({
        where: { key: s.key },
        update: { value: s.value, category: s.category || "general" },
        create: { key: s.key, value: s.value, category: s.category || "general" },
      })
    }

    return success(res, null, "设置批量保存成功")
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
}
