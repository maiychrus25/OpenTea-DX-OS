// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Plain Vietnamese for proposal previews and inbox evidence. Pure: safe to import from client components.

export const ACTIVITY_LABEL: Record<string, string> = {
  SOWING: 'Trồng mới',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  OTHER: 'Khác',
}

export const JOURNAL_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  REQUEST_CHANGES: 'Yêu cầu sửa',
}

/** A journal entry a proposal mentions: parcel code, activity label and day (dd/MM) in Vietnam time. */
export interface JournalSubject {
  id: string
  parcel: string
  activity: string
  day: string
}

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh'

function toDate(raw: Date | string | null | undefined): Date | null {
  if (raw === null || raw === undefined || raw === '') return null
  const date = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

// vi-VN renders day and month with "-" when no year is given, so the parts are joined here.
function joinDateParts(raw: Date | string | null | undefined, withYear: boolean): string | null {
  const date = toDate(raw)
  if (!date) return null
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: VN_TIMEZONE,
  }
  const parts = new Intl.DateTimeFormat('vi-VN', options).formatToParts(date)
  return ['day', 'month', ...(withYear ? ['year'] : [])]
    .map((type) => parts.find((p) => p.type === type)?.value ?? '')
    .join('/')
}

/** dd/MM/yyyy in Vietnam time, or null when the value is missing. */
export function formatVnDate(raw: Date | string | null | undefined): string | null {
  return joinDateParts(raw, true)
}

/** dd/MM in Vietnam time, or null when the value is missing. */
export function formatVnDayMonth(raw: Date | string | null | undefined): string | null {
  return joinDateParts(raw, false)
}
