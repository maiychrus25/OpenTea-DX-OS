// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

const LOT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  READY: 'Sẵn sàng',
  QR_EXPORTED: 'Đã xuất QR',
}

/** Vietnamese label of a lot status (LotStatus); an unknown value is shown as it is. */
export function lotStatusLabel(status: string): string {
  return LOT_STATUS_LABELS[status] ?? status
}
