// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CertificateKind, CertificateRow } from '../views'

export interface NewCertificate {
  htxProfileId: string
  userId: string
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
}

export interface CertificatePort {
  list(htxProfileId: string): Promise<CertificateRow[]>
  find(htxProfileId: string, id: string): Promise<CertificateRow | null>
  create(input: NewCertificate): Promise<CertificateRow>
  /** One conditional write; `null` when the certificate is already revoked (or not found), so a double revoke never overwrites the first. */
  revoke(htxProfileId: string, id: string, userId: string, reason: string): Promise<CertificateRow | null>
  /**
   * The certificates an export may attach. `ids` null means every certificate of the HTX that is valid on `today`.
   * Any id that is foreign, missing, revoked or expired makes the answer `{ invalid: [those ids] }`.
   */
  validForLot(htxProfileId: string, ids: string[] | null, today: string): Promise<{ ok: CertificateRow[] } | { invalid: string[] }>
}
