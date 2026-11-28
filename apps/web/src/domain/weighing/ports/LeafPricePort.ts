// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface LeafGradeView {
  id: string
  name: string
  sort_order: number
  active: boolean
}

export interface TodayPrices {
  date: string
  published_at: string | null
  prices: { grade_id: string; grade_name: string; price_vnd_per_kg: number | null; yesterday_vnd_per_kg: number | null }[]
}

export interface LeafPricePort {
  listGrades(htxProfileId: string): Promise<LeafGradeView[]>
  createGrade(htxProfileId: string, input: { name: string; sort_order?: number }): Promise<LeafGradeView>
  /** Null when the grade is not in the HTX. */
  updateGrade(htxProfileId: string, id: string, input: { name?: string; sort_order?: number; active?: boolean }): Promise<LeafGradeView | null>
  /** Prices of the active grades on `day`, with the calendar day before as `yesterday_vnd_per_kg`. */
  pricesFor(htxProfileId: string, day: string): Promise<TodayPrices>
  /** Upserts one row per grade; returns false and writes nothing when a grade is not an active grade of the HTX. */
  upsertPrices(input: { htxProfileId: string; day: string; publishedById: string; prices: { grade_id: string; price_vnd_per_kg: number }[]; at: Date }): Promise<boolean>
}
