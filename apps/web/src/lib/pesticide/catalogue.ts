// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { get, set } from 'idb-keyval'

/** One row of GET /api/pesticides (the effective floor is the cooperative's own). */
export type PesticideRow = {
  id: string
  trade_name: string
  active_ingredient: string
  group: 'BOTANICAL' | 'MICROBIAL' | 'BIOLOGICAL' | 'CHEMICAL' | 'ANTIBIOTIC'
  targets: string[]
  default_phi_days: number
  floor_days: number
  label: { label_phi_days: number; label_note: string | null; verified_at: string } | null
  needs_label_check: boolean
}

export const CATALOGUE_CACHE_KEY = 'pesticide_catalogue_cache'
/** The floor of "Thuốc khác" (outside the catalogue). */
export const CUSTOM_PRODUCT_FLOOR_DAYS = 14

// idb-keyval throws synchronously when IndexedDB is missing (private mode, jsdom), so await inside try.
async function readCache(): Promise<PesticideRow[] | undefined> {
  try { return await get<PesticideRow[]>(CATALOGUE_CACHE_KEY) } catch { return undefined }
}
async function writeCache(rows: PesticideRow[]): Promise<void> {
  try { await set(CATALOGUE_CACHE_KEY, rows) } catch { /* the cache is optional */ }
}

/** Loads the catalogue and keeps the last answer in IndexedDB; offline it serves that copy. */
export async function loadPesticideCatalogue(target?: string): Promise<PesticideRow[]> {
  try {
    const res = await fetch(target ? `/api/pesticides?target=${encodeURIComponent(target)}` : '/api/pesticides')
    if (!res.ok) throw new Error('catalogue request failed')
    const rows = ((await res.json()).data ?? []) as PesticideRow[]
    // Only the unfiltered list is the offline copy; a filtered one would hide products.
    if (!target) await writeCache(rows)
    return rows
  } catch (error) {
    const cached = await readCache()
    if (cached) return cached
    throw error
  }
}
