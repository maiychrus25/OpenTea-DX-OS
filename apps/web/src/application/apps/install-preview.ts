// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { StoreMenuEntry } from '@/domain/entities/app-store'

const ROLE_LABELS: Record<string, string> = { manager: 'Trưởng HTX', officer: 'Cán bộ', farmer: 'Nông dân' }

/** What installing the app adds for the HTX, in plain Vietnamese, built from the catalogue data. */
export function installPreview(
  app: { id: string; menu: StoreMenuEntry[]; hasPublic: boolean; hasDatabase: boolean; coreReads: string[]; installedOnServer: boolean },
  htxCode: string,
): string[] {
  const lines = app.menu.map(entry => `Thêm mục "${entry.label}" cho ${entry.roles.map(role => ROLE_LABELS[role] ?? role).join(', ')}`)
  if (app.hasPublic) lines.push(`Mở trang công khai tại /apps/${app.id}/public/${htxCode}, ai có địa chỉ cũng xem được`)
  if (app.hasDatabase) lines.push('Tạo kho dữ liệu riêng cho ứng dụng; dữ liệu của mỗi HTX tách theo mã HTX')
  for (const item of app.coreReads) lines.push(`Đọc ${item} bằng quyền của người đang dùng`)
  lines.push(app.installedOnServer ? 'Ứng dụng đã có trên máy chủ nên được bật ngay' : 'Lần cài đầu trên máy chủ phải dựng ứng dụng, mất vài phút')
  return lines
}
