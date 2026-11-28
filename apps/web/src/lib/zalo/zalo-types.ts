// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Shapes of the Zalo routes' `data` payloads (the routes wrap them in `{ data }`). */

export const ZALO_EVENT_KINDS = ['PRICE_PUBLISHED', 'TICKET_RECEIPT', 'WITHDRAWAL_ENDED', 'SETTLEMENT_CLOSED'] as const
export type ZaloEventKind = (typeof ZALO_EVENT_KINDS)[number]

export const ZALO_KIND_LABELS: Record<ZaloEventKind, string> = {
  PRICE_PUBLISHED: 'Giá thu mua hôm nay',
  TICKET_RECEIPT: 'Phiếu cân',
  WITHDRAWAL_ENDED: 'Hết thời gian cách ly',
  SETTLEMENT_CLOSED: 'Chốt kỳ quyết toán',
}

export interface ZaloSettings {
  enabled: boolean
  kinds: ZaloEventKind[]
  quiet_start_hour: number
  quiet_end_hour: number
  monthly_quota: number
  sent_this_month: number
  kinds_without_template: ZaloEventKind[]
}

/** What the settings PUT accepts: every field is required. */
export type ZaloSettingsInput = Pick<ZaloSettings, 'enabled' | 'kinds' | 'quiet_start_hour' | 'quiet_end_hour' | 'monthly_quota'>

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ gửi',
  leased: 'Đang gửi',
  sent: 'Đã gửi',
  failed: 'Gửi lỗi',
  skipped: 'Bỏ qua',
}

export interface ZaloDelivery {
  id: string
  kind: ZaloEventKind
  template_key: string
  status: 'pending' | 'leased' | 'sent' | 'failed' | 'skipped'
  /** Already masked to the last three digits by the server. */
  phone_masked: string
  attempts: number
  last_error: string | null
  reason_vi: string | null
  created_at: string
  sent_at: string | null
}

export type ZaloTemplateKey = 'price_today' | 'ticket_receipt' | 'withdrawal_ended' | 'settlement_closed'

export const ZALO_TEMPLATE_LABELS: Record<ZaloTemplateKey, string> = {
  price_today: 'Giá hôm nay',
  ticket_receipt: 'Phiếu cân',
  withdrawal_ended: 'Hết thời gian cách ly',
  settlement_closed: 'Chốt kỳ quyết toán',
}

export interface ZaloTemplate {
  template_key: ZaloTemplateKey
  configured: boolean
  zns_template_id: string | null
  params: string[]
  allowed_params: string[]
}

export type ZaloConsentStatus = 'OPTED_IN' | 'OPTED_OUT'
export type ZaloConsentSource = 'REGISTRATION' | 'OFFICER' | 'MEMBER'

/** A household's consent as the consent route returns it; null fields mean nothing is recorded yet. */
export interface ZaloConsent {
  status: ZaloConsentStatus | null
  source: ZaloConsentSource | null
  at: string | null
}

export const CONSENT_SOURCE_LABELS: Record<ZaloConsentSource, string> = {
  REGISTRATION: 'khi đăng ký',
  OFFICER: 'cán bộ ghi nhận',
  MEMBER: 'xã viên tự tắt',
}

export interface ZaloCredentials {
  configured: boolean
  access_token_last4: string | null
  expires_at: string | null
  updated_at: string | null
}
