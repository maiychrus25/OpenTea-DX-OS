// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Stored as `ai_disease_name` when the model was not confident enough to name a disease. */
export const UNCERTAIN_DISEASE_NAME = 'Không xác định'

/** The officer's confirmed name wins over the AI's. */
export function displayDiseaseName(r: { confirmed_diagnosis: string | null; ai_disease_name: string }): string {
  return r.confirmed_diagnosis?.trim() ? r.confirmed_diagnosis : r.ai_disease_name
}
