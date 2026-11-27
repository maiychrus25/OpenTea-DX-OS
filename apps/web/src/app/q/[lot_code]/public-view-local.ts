// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LotTraceCertificate, LotTraceData } from '@/domain/entities/lot-trace-data'

/**
 * Names of people (household, journal author, batch master) leave the public page unless the cooperative allows them.
 * TODO(integration): replace with publicView(trace, showNames) from '@/domain/lot/public-view' (phase 2 B2).
 */
export function hideNamesUnlessAllowed(trace: LotTraceData, showNames: boolean): LotTraceData {
  if (showNames) return trace
  return {
    ...trace,
    parcels: trace.parcels.map(p => ({ ...p, household_name: '' })),
    journal_summaries: trace.journal_summaries.map(j => ({ ...j, performed_by: '' })),
    batches: trace.batches?.map(b => ({ ...b, master_name: null })),
  }
}

export type CertificateState = 'VALID' | 'EXPIRED' | 'REVOKED'

/**
 * Validity at view time, on a Vietnam day (YYYY-MM-DD): revoked wins, expired only after the expiry day itself.
 * The trace snapshot carries no revoked_at today, so the field is read when present.
 * TODO(integration): replace with certificateStatus(c, today) from '@/domain/certificate/status' (phase 2 B1).
 */
export function certificateStatusOn(c: LotTraceCertificate & { revoked_at?: string | null }, today: string): CertificateState {
  if (c.revoked_at) return 'REVOKED'
  return today > c.expires_on ? 'EXPIRED' : 'VALID'
}
