// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface VerifiedUserToken {
  sub: string
  /** The Keycloak client the browser session signed in with. */
  azp: string
  htxCode: string
  roles: string[]
}

/** A person's own access token, as a mini-app forwards it to the core. */
export interface UserTokenVerifier {
  verify(token: string): Promise<VerifiedUserToken>
}
