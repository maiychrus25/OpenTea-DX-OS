// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Shapes of the Zalo gateway APIs as the screens use them. The backend owns the contract. */

export const ZALO_EVENT_KINDS = ['PRICE_PUBLISHED', 'TICKET_RECEIPT', 'WITHDRAWAL_ENDED', 'SETTLEMENT_CLOSED'] as const
export type ZaloEventKind = (typeof ZALO_EVENT_KINDS)[number]

export const ZALO_KIND_LABELS: Record<ZaloEventKind, string> = {
  PRICE_PUBLISHED: 'Công bố giá búp',
  TICKET_RECEIPT: 'Phiếu cân',
  WITHDRAWAL_ENDED: 'Kết thúc đợt rút',
  SETTLEMENT_CLOSED: 'Chốt quyết toán',
}

export interface ZaloSettings {
  enabled: boolean
  kinds: Record<ZaloEventKind, boolean>
  monthly_quota: number
  used_this_month: number
}

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ gửi',
  leased: 'Đang gửi',
  sent: 'Đã gửi',
  failed: 'Gửi lỗi',
  skipped: 'Bỏ qua',
}

export interface ZaloDelivery {
  id: string
  event_kind: ZaloEventKind
  phone_masked: string
  status: string
  last_error_vi: string | null
  created_at: string
  sent_at: string | null
}

export interface ZaloDeliveryPage {
  data: ZaloDelivery[]
  next_cursor: string | null
}

export interface ZaloTemplate {
  template_key: string
  zns_template_id: string
  params: string[]
}

export type ZaloConsentStatus = 'OPTED_IN' | 'OPTED_OUT'

export interface ZaloConsent {
  status: ZaloConsentStatus
  at: string
  recorded_by_name: string | null
}

export interface ZaloCredentialsSaved {
  access_token_last4: string
  expires_at: string
}

/** Keeps only the last 3 digits of a phone, so a list never shows a full number. */
export function maskPhone(phone: string): string {
  return phone.replace(/\d(?=(?:\D*\d){3})/g, '*')
}
