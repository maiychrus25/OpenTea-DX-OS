// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type CertificateKind = 'VIETGAP' | 'OCOP' | 'ORGANIC' | 'OTHER'

/** A cooperative certificate as GET /api/certificates returns it; `status` is computed at read time (Vietnam day). */
export interface CertificateView {
  id: string
  kind: CertificateKind
  number: string
  issuer: string
  issued_on: string
  expires_on: string
  scope_note: string | null
  file_name: string
  file_mime: string
  file_size: number
  revoked_at: string | null
  revoke_reason: string | null
  status: 'VALID' | 'EXPIRED' | 'REVOKED'
}
