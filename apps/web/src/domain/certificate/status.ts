// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type CertificateStatus = 'VALID' | 'EXPIRED' | 'REVOKED'

/** Computed at read time. `today` and `expires_on` are Vietnam days `YYYY-MM-DD`, so a string compare is a date compare. */
export function certificateStatus(c: { revoked_at: Date | null; expires_on: string }, today: string): CertificateStatus {
  if (c.revoked_at) return 'REVOKED'
  return today > c.expires_on ? 'EXPIRED' : 'VALID'
}
