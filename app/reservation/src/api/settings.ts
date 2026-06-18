import { apiClient } from './client'

export interface RefundTier {
  hours: number
  rate: number
  label: string
}

export interface RefundRules {
  tiers: RefundTier[]
  cancelHours: number
}

export async function getRefundRules() {
  const res = await apiClient.get('/settings/refund-rules')
  return res.data.data as RefundRules
}

export async function getBookingConfig() {
  const res = await apiClient.get('/settings/booking-config')
  return res.data.data as { advanceDays: number }
}

export interface BookingLifecycle {
  verifyAdvanceMinutes: number
  lateBufferMinutes: number
  noShowDeadlineMinutes: number
  noShowPenaltyRate: number
  rescheduleFeeRate: number
  rescheduleDeadlineHours: number
  rescheduleMaxCount: number
  rescheduleAllowAfterStart: boolean
  rescheduleAfterStartMinutes: number
}

export async function getBookingLifecycle() {
  const res = await apiClient.get('/settings/booking-lifecycle')
  return res.data.data as BookingLifecycle
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
  layout: 'card' | 'banner'
  enabled: boolean
}

export interface FaqItem {
  question: string
  answer: string
}

export interface MapLink {
  label: string
  url: string
}

export interface PagePublicSettings {
  venueName: string
  venueAddress: string
  venuePhone: string
  venueHours: string
  venueDescription: string
  logo: string
  serviceQr: string
  cHomeSearchPlaceholder: string
  cHomeBannerEnabled: boolean
  cHomeBannerImages: BannerImage[]
  cHomeBannerBadge: string
  cHomeBannerSubtitle: string
  cHomeCategoryEnabled: boolean
  cHomeVipEnabled: boolean
  cHomeVipTitle: string
  cHomeVipDesc: string
  cHomeVipButton: string
  cHomeHotTitle: string
  cHomeHotLinkText: string
  cHomeCustomModules: ContentCard[]
  cHomeSectionOrder: { key: string; enabled: boolean }[]
  cProfileHelpEnabled: boolean
  cProfileHelpTitle: string
  cProfileHelpSubtitle: string
  cProfileHelpFaqs: FaqItem[]
  cProfileHelpContactPhone: string
  cProfileHelpContactWechat: string
  cProfileHelpContactHours: string
  cProfileContactEnabled: boolean
  cProfileContactTitle: string
  cProfileContactSubtitle: string
  cProfileContactPhones: string[]
  cProfileContactAddress: string
  cProfileContactHours: string
  cProfileContactQr: string
  cProfileContactMapLinks: MapLink[]
  cGroupBookingRules: string
}

export async function getPagePublicSettings() {
  const res = await apiClient.get('/settings/page-public')
  return res.data.data as PagePublicSettings
}
