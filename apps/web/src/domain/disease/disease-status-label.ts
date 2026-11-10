// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type DiseaseStatusTone = 'amber' | 'green' | 'neutral'

const DISEASE_STATUS_LABELS: Record<string, { label: string; tone: DiseaseStatusTone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'amber' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'green' },
  REJECTED: { label: 'Bị từ chối', tone: 'neutral' },
}

/** Vietnamese label and pill tone of a disease report status (DiseaseReportStatus); an unknown value is shown as it is. */
export function diseaseStatusLabel(status: string): { label: string; tone: DiseaseStatusTone } {
  return DISEASE_STATUS_LABELS[status] ?? { label: status, tone: 'neutral' }
}
