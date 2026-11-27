// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFile } from 'node:fs/promises'
import { DomainError } from '@/domain/errors'
import { parseEnvFile, ROLES_ENV_FILE } from './dxos-web-roles.client'

const CLIENT_ID = 'dxos-web-service'
const TOKEN_SAFETY_MS = 5_000
const TIMEOUT_MS = 15_000
export const WEB_SERVICE_NOT_ENABLED = 'Chưa bật chẩn đoán qua Telegram.'

/**
 * The web's own service token (client `dxos-web-service`, role `web-service`), for server-to-server calls that have
 * no browser session. The secret comes from the environment first, then from roles.env that `./dxos telegram enable` writes.
 */
export class WebServiceTokenProvider {
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly readFileImpl: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly now: () => number = () => Date.now()
  ) {}

  private async secret(): Promise<string | null> {
    if (this.env.DXOS_WEB_SERVICE_SECRET) return this.env.DXOS_WEB_SERVICE_SECRET
    try {
      return parseEnvFile(await this.readFileImpl(ROLES_ENV_FILE)).DXOS_WEB_SERVICE_SECRET || null
    } catch {
      return null
    }
  }

  async get(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + TOKEN_SAFETY_MS) return this.token.value
    const secret = await this.secret()
    if (!secret) throw new DomainError(WEB_SERVICE_NOT_ENABLED)
    const realm = this.env.KEYCLOAK_INTERNAL_URL || 'http://keycloak:8080/realms/agrimarket'
    const res = await this.fetchImpl(`${realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: secret }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`The web service token request failed with ${res.status}`)
    const data = (await res.json()) as { access_token: string; expires_in: number }
    this.token = { value: data.access_token, expiresAt: this.now() + data.expires_in * 1000 }
    return data.access_token
  }
}
