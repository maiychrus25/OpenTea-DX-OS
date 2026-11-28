// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export const ZALO_EVENT_KINDS = ['PRICE_PUBLISHED', 'TICKET_RECEIPT', 'WITHDRAWAL_ENDED', 'SETTLEMENT_CLOSED'] as const
export type ZaloEventKind = (typeof ZALO_EVENT_KINDS)[number]

export const TEMPLATE_KEYS = ['price_today', 'ticket_receipt', 'withdrawal_ended', 'settlement_closed'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

const TEMPLATE_OF: Record<ZaloEventKind, TemplateKey> = {
  PRICE_PUBLISHED: 'price_today',
  TICKET_RECEIPT: 'ticket_receipt',
  WITHDRAWAL_ENDED: 'withdrawal_ended',
  SETTLEMENT_CLOSED: 'settlement_closed',
}
export const templateKeyOf = (kind: ZaloEventKind): TemplateKey => TEMPLATE_OF[kind]

/**
 * The only parameter names a template may use, per key. A bank account, a pesticide name or another person's name has no
 * entry here, so no template can ask for one. `customer_name` is the household's own name.
 */
export const TEMPLATE_PARAM_KEYS: Record<TemplateKey, readonly string[]> = {
  price_today: ['customer_name', 'date', 'price_list'],
  ticket_receipt: ['customer_name', 'ticket_no', 'date', 'net_kg', 'amount_vnd'],
  withdrawal_ended: ['customer_name', 'parcel_code', 'safe_date'],
  settlement_closed: ['customer_name', 'period_code', 'result_label', 'amount_vnd', 'slip_url'],
}

export const SKIP_REASONS = ['ZALO_OFF', 'KIND_OFF', 'NO_CONSENT', 'CONSENT_REVOKED', 'NO_TEMPLATE', 'BAD_TEMPLATE', 'QUOTA_REACHED', 'INVALID_PHONE'] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

const SKIP_LABELS: Record<SkipReason, string> = {
  ZALO_OFF: 'HTX chưa bật gửi tin Zalo.',
  KIND_OFF: 'Loại tin này đang tắt.',
  NO_CONSENT: 'Hộ chưa đồng ý nhận tin Zalo.',
  CONSENT_REVOKED: 'Hộ đã tắt nhận tin Zalo.',
  NO_TEMPLATE: 'Chưa có mẫu tin ZNS cho loại tin này.',
  BAD_TEMPLATE: 'Mẫu tin ZNS có tham số không hợp lệ.',
  QUOTA_REACHED: 'Đã hết hạn mức tin của tháng.',
  INVALID_PHONE: 'Số điện thoại của hộ không hợp lệ.',
}
export const skipReasonLabelVi = (reason: string): string => SKIP_LABELS[reason as SkipReason] ?? 'Tin không được gửi.'

/** Zalo error codes the relay passes through in `error` (verified against Zalo's public ZNS docs by the relay track). */
const ERROR_LABELS: [RegExp, string][] = [
  [/-108|not.*zalo|user not found/i, 'Số điện thoại này không dùng Zalo.'],
  [/-118|template/i, 'Mẫu tin ZNS không hợp lệ hoặc chưa được duyệt.'],
  [/-124|quota|limit/i, 'Đã hết hạn mức gửi tin của Zalo.'],
  [/consent/i, 'Hộ đã tắt nhận tin Zalo.'],
]
/** The Vietnamese reason for a failed or skipped row: a skip reason, a known Zalo error, or a generic line. */
export function errorLabelVi(error: string): string {
  if ((SKIP_REASONS as readonly string[]).includes(error)) return skipReasonLabelVi(error)
  return ERROR_LABELS.find(([pattern]) => pattern.test(error))?.[1] ?? 'Zalo chưa gửi được tin này.'
}

/** One message event. `householdId` null means every household of the cooperative (the price message). */
export interface ZaloEvent {
  kind: ZaloEventKind
  htxCode: string
  eventId: string
  householdId: string | null
  params: Record<string, string>
}
