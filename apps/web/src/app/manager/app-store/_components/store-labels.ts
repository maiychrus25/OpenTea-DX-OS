// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AppStoreStatus, RequestStatus, StoreCategory } from '@/domain/entities/app-store'

export const ROLE_LABELS: Record<string, string> = { manager: 'Trưởng HTX', officer: 'Cán bộ', farmer: 'Nông dân' }

export const STATUS_LABELS: Record<AppStoreStatus, string> = {
  available: 'Chưa cài',
  installing: 'Đang cài…',
  enabled: 'Đã cài',
  removing: 'Đang gỡ…',
  enabled_all: 'Đã cài cho mọi HTX (quản trị máy chủ)',
  failed: 'Lỗi',
}
export const STATUS_TONES: Record<AppStoreStatus, 'green' | 'amber' | 'blue' | 'neutral'> = {
  available: 'neutral',
  installing: 'blue',
  enabled: 'green',
  removing: 'blue',
  enabled_all: 'green',
  failed: 'amber',
}
/** "Đã cài" in the status filter. */
export const INSTALLED_STATUSES: readonly AppStoreStatus[] = ['enabled', 'enabled_all', 'removing']

export const NEW_VERSION_LABEL = 'Có bản mới'
/** True when the HTX uses the app and the server runs another version than the catalogue offers. */
export const hasNewVersion = (app: { version: string; installedVersion: string | null; status: AppStoreStatus }) =>
  (app.status === 'enabled' || app.status === 'enabled_all') && app.installedVersion !== null && app.installedVersion !== app.version

export const CATEGORY_LABELS: Record<StoreCategory, string> = {
  production: 'Sản xuất và thu mua',
  sales: 'Bán hàng',
  members: 'Thành viên và vật tư',
  tourism: 'Du lịch',
  sample: 'Ứng dụng mẫu',
}

export const REQUEST_LABELS: Record<RequestStatus, string> = { PENDING: 'Đang chờ', RUNNING: 'Đang xử lý', DONE: 'Xong', FAILED: 'Lỗi' }
export const REQUEST_TONES: Record<RequestStatus, 'green' | 'amber' | 'blue' | 'neutral'> = {
  PENDING: 'neutral',
  RUNNING: 'blue',
  DONE: 'green',
  FAILED: 'amber',
}

export const WORKER_WARNING = 'Trình cài đặt chưa chạy. Yêu cầu sẽ được xử lý khi quản trị máy chủ bật ./dxos worker.'

/** Lower case, no accents; `đ` becomes `d`. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
}
