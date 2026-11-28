// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CertificateStatus } from './status'

export type CertificateKind = 'VIETGAP' | 'OCOP' | 'ORGANIC' | 'OTHER'

/** A stored certificate; days are Vietnam days `YYYY-MM-DD`. */
export interface CertificateRow {
  id: string
  htx_profile_id: string
  kind: CertificateKind
  number: string
  issuer: string
  issued_on: string
  expires_on: string
  scope_note: string | null
  file_key: string
  file_name: string
  file_mime: string
  file_size: number
  revoked_at: Date | null
  revoke_reason: string | null
}

/** The JSON of the API contract. `file_key` stays on the server. */
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
  status: CertificateStatus
}
