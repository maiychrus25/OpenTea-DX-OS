// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFile } from 'node:fs/promises'
import type { LiveRoleReader, LiveUserState } from '@/domain/telegram/ports/LiveRoleReader'

// Written by `./dxos telegram enable` (mode 600, owner 10001) and mounted read-only into the web container.
const ROLES_ENV_FILE = '/run/dxos-web/roles.env'
const CREDENTIALS_TTL_MS = 60_000
const TOKEN_SAFETY_MS = 5_000

interface Credentials {
  clientId: string
  clientSecret: string
  fetchedAt: number
}

export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*?)\s*$/)
    if (match) values[match[1]] = match[2]
  }
  return values
}

/**
 * Reads a user's live realm roles, enabled flag and `htx_code` attribute with the `dxos-web-roles`
 * service account (realm-management `view-users` only). Used at decision time, never the link.
 */
export class KeycloakLiveRoleReader implements LiveRoleReader {
  private readonly realmUrl: string
  private credentials: Credentials | null = null
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now(),
    private readonly readFileImpl: (path: string) => Promise<string> = (path) => readFile(path, 'utf8')
  ) {
    this.realmUrl = process.env.KEYCLOAK_INTERNAL_URL || 'http://keycloak:8080/realms/agrimarket'
  }

  private async loadCredentials(): Promise<Credentials> {
    if (this.credentials && this.now() - this.credentials.fetchedAt < CREDENTIALS_TTL_MS) {
      return this.credentials
    }
    let values: Record<string, string>
    try {
      values = parseEnvFile(await this.readFileImpl(ROLES_ENV_FILE))
    } catch {
      throw new Error('Live role lookup is not configured')
    }
    const { DXOS_ROLES_CLIENT_ID: clientId, DXOS_ROLES_CLIENT_SECRET: clientSecret } = values
    if (!clientId || !clientSecret) throw new Error('Live role lookup is not configured')
    this.credentials = { clientId, clientSecret, fetchedAt: this.now() }
    return this.credentials
  }

  private async serviceToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + TOKEN_SAFETY_MS) return this.token.value
    const { clientId, clientSecret } = await this.loadCredentials()
    const res = await this.fetchImpl(`${this.realmUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('Could not authenticate the role lookup client')
    const data = (await res.json()) as { access_token: string; expires_in: number }
    this.token = { value: data.access_token, expiresAt: this.now() + data.expires_in * 1000 }
    return data.access_token
  }

  async read(userId: string): Promise<LiveUserState | null> {
    const token = await this.serviceToken()
    const admin = `${this.realmUrl.replace('/realms/agrimarket', '')}/admin/realms/agrimarket`
    const headers = { Authorization: `Bearer ${token}` }
    const userRes = await this.fetchImpl(`${admin}/users/${encodeURIComponent(userId)}`, { headers, cache: 'no-store' })
    if (userRes.status === 404) return null
    if (!userRes.ok) throw new Error('Could not read the user')
    const user = (await userRes.json()) as {
      enabled?: boolean
      attributes?: { htx_code?: string[] }
    }

    const rolesRes = await this.fetchImpl(`${admin}/users/${encodeURIComponent(userId)}/role-mappings/realm`, {
      headers,
      cache: 'no-store',
    })
    if (!rolesRes.ok) throw new Error('Could not read the user roles')
    const mappings = (await rolesRes.json()) as { name: string }[]

    return {
      roles: mappings.map((r) => r.name),
      enabled: user.enabled === true,
      htxCode: user.attributes?.htx_code?.[0] ?? null,
    }
  }
}
