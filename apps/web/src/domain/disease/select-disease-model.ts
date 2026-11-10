// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type DiseaseModel = 'tea' | 'general'

/** Tea when the crop names "chè"/"tea" as a word, with or without diacritics ("Che shan tuyet"); otherwise general. */
export function selectDiseaseModel(cropType: string | null | undefined): DiseaseModel {
  const plain = (cropType ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /\b(che|tea)\b/.test(plain) ? 'tea' : 'general'
}
