// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type DiseaseLabelGroup = 'PEST' | 'DISEASE' | 'HEALTHY' | 'OTHER'

export interface DiseaseLabelView {
  code: string
  name_vi: string
  scientific_name: string | null
  group: DiseaseLabelGroup
  is_target: boolean
  sort_order: number
}

/** The one list of class codes and Vietnamese names (table `disease_labels`). */
export interface DiseaseLabelPort {
  /** Targets first, then by sort_order. */
  list(): Promise<DiseaseLabelView[]>
  exists(code: string): Promise<boolean>
}
