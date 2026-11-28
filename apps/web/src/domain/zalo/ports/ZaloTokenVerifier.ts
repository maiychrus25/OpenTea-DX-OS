// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Keycloak client of the Zalo relay (`dxos-zalo`). */
export const ZALO_CLIENT_ID = 'dxos-zalo'

export interface VerifiedZaloToken {
  sub: string
  azp: string
  roles: string[]
}

export interface ZaloTokenVerifier {
  verify(token: string): Promise<VerifiedZaloToken>
}
