// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/** Fallback only: real parcel geometry / partner coordinates always take priority. */
export const DEFAULT_MAP_VIEW = { center: [21.55, 105.80] as [number, number], zoom: 14 }

export const PARCEL_STATUS_CONFIG: Record<string, { color: string; fillColor: string; label: string }> = {
  SOWING: { color: 'var(--color-status-sowing)', fillColor: 'var(--color-status-sowing)', label: 'Đang gieo sạ' },
  TENDING: { color: 'var(--color-status-tending)', fillColor: 'var(--color-status-tending)', label: 'Đang chăm sóc' },
  DRAFT: { color: 'var(--color-status-draft)', fillColor: 'var(--color-status-draft)', label: 'Khởi tạo' },
  HARVEST_APPROVED: { color: 'var(--color-status-harvest-approved)', fillColor: 'var(--color-status-harvest-approved)', label: 'Đã duyệt thu hoạch' },
  HARVESTED: { color: 'var(--color-status-harvested)', fillColor: 'var(--color-status-harvested)', label: 'Đã thu hoạch' },
}

export function parcelStatusLabel(status: string): string {
  return PARCEL_STATUS_CONFIG[status]?.label ?? (status === 'ACTIVE' ? 'Đang canh tác' : status)
}

/** Growing states from ParcelStatus; ACTIVE remains supported for legacy readers. */
export function isCultivating(status: string): boolean {
  return ['SOWING', 'TENDING', 'HARVEST_APPROVED', 'ACTIVE'].includes(status)
}
