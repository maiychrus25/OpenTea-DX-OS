// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** The five dry tea grades of Thái Nguyên tea (phase 2 spec §7.2). Stored as the enum value, shown with the label. */
export const DRY_TEA_GRADES = ['DINH', 'TOM_NON', 'MOC_CAU', 'BOM', 'CAM'] as const

export type DryTeaGrade = (typeof DRY_TEA_GRADES)[number]

export const DRY_TEA_GRADE_LABELS: Record<DryTeaGrade, string> = {
  DINH: 'Đinh',
  TOM_NON: 'Tôm nõn',
  MOC_CAU: 'Móc câu',
  BOM: 'Bồm',
  CAM: 'Cám',
}

/** Fresh net kg per dry kg that needs no explanation (spec §4.2, §7.3). Inclusive at both ends. */
export const RECOVERY_BAND = { min: 4.5, max: 5.0 } as const
