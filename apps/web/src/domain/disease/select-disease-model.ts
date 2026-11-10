// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type DiseaseModel = 'tea' | 'general'

// A letter, digit or remaining combining mark continues a word; anything else (space, `_`, `-`) separates.
const TEA_WORD = /(?:^|[^a-z0-9\u0300-\u036f])(?:che|tea)(?:$|[^a-z0-9\u0300-\u036f])/

/**
 * Tea when the crop names "chè" (or unaccented "che") or "tea" as a word; otherwise general.
 * Only the grave accent is dropped, so "chế", "chẻ" and "chê" stay distinct from "chè".
 */
export function selectDiseaseModel(cropType: string | null | undefined): DiseaseModel {
  const folded = (cropType ?? '').normalize('NFD').toLowerCase().replace(/\u0300/g, '')
  return TEA_WORD.test(folded) ? 'tea' : 'general'
}
