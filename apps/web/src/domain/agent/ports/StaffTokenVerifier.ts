// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface VerifiedStaffToken {
  sub: string
  azp: string
  htxCode: string
  roles: string[]
}

export interface StaffTokenVerifier {
  verify(token: string): Promise<VerifiedStaffToken>
}
