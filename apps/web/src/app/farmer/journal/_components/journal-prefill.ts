// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Not a client module: the server page of /farmer/journal/new calls journalPrefillFromParams, and a server component
// cannot call a function exported from a 'use client' file.

export interface JournalPrefill {
  parcelId?: string
  activityType?: string
  productName?: string
  dosage?: string
  withdrawalDays?: number
}

export const ACTIVITY_TYPES = [
  { value: 'SPRAYING', label: 'Phun thuốc' },
  { value: 'FERTILIZING', label: 'Bón phân' },
  { value: 'IRRIGATION', label: 'Tưới tiêu' },
  { value: 'HARVEST', label: 'Thu hoạch' },
  { value: 'SOWING', label: 'Trồng mới' },
  { value: 'PRUNING', label: 'Đốn chè' },
  { value: 'OTHER', label: 'Khác' },
]

const ACTIVITY_VALUES = ACTIVITY_TYPES.map(t => t.value)

/** Reads the `?parcel&activity&product&dosage&withdrawal` of the chat card's Sửa button. */
export function journalPrefillFromParams(params: Record<string, string | string[] | undefined>): JournalPrefill {
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)
  const withdrawal = one('withdrawal') === undefined ? NaN : Number(one('withdrawal'))
  const activity = one('activity')
  return {
    parcelId: one('parcel'),
    activityType: activity && ACTIVITY_VALUES.includes(activity) ? activity : undefined,
    productName: one('product')?.slice(0, 200),
    dosage: one('dosage')?.slice(0, 100),
    withdrawalDays: Number.isInteger(withdrawal) && withdrawal >= 0 && withdrawal <= 365 ? withdrawal : undefined,
  }
}
