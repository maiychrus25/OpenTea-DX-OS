// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ZaloRepository } from '@/domain/zalo/ports/ZaloRepository'

export interface ZaloTokens {
  access_token: string
  refresh_token: string
  expires_at: string
}

export interface TokenCipher {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

/** Stores the OA tokens encrypted and gives them to the relay. Never logs a token. */
export class ZaloCredentialService {
  constructor(private readonly repo: ZaloRepository, private readonly cipher: TokenCipher) {}

  async save(tokens: ZaloTokens, actor: string): Promise<void> {
    await this.repo.saveCredentials(
      { accessTokenEnc: this.cipher.encrypt(tokens.access_token), refreshTokenEnc: this.cipher.encrypt(tokens.refresh_token), expiresAt: new Date(tokens.expires_at) },
      actor,
    )
  }

  /** The relay's view: the clear tokens, or null before an admin entered them. */
  async forRelay(): Promise<ZaloTokens | null> {
    const stored = await this.repo.credentials()
    if (!stored) return null
    return {
      access_token: this.cipher.decrypt(stored.accessTokenEnc),
      refresh_token: this.cipher.decrypt(stored.refreshTokenEnc),
      expires_at: stored.expiresAt.toISOString(),
    }
  }

  /** The admin's view after saving: whether tokens exist and the last 4 characters of the access token, never more. */
  async summary(): Promise<{ configured: boolean; access_token_last4: string | null; expires_at: string | null; updated_at: string | null }> {
    const tokens = await this.forRelay()
    const stored = tokens ? await this.repo.credentials() : null
    return {
      configured: !!tokens,
      access_token_last4: tokens ? tokens.access_token.slice(-4) : null,
      expires_at: tokens?.expires_at ?? null,
      updated_at: stored?.updatedAt.toISOString() ?? null,
    }
  }
}
