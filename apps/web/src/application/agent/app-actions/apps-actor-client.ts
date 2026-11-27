// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFile } from 'node:fs/promises'
import { DomainError } from '@/domain/errors'
import { parseEnvFile } from '@/infrastructure/auth/dxos-web-roles.client'
import type { Tenant } from '@/lib/api/tenant'

// Written by `./dxos apps actor enable`, the same file the Telegram enable uses.
const ROLES_ENV_FILE = '/run/dxos-web/roles.env'
const ACTOR_CLIENT_ID = 'dxos-apps-actor'
const TOKEN_SAFETY_MS = 5_000
const TIMEOUT_MS = 15_000
const NOT_ENABLED = 'Quyền thực hiện đề xuất của ứng dụng chưa được bật. Vui lòng nhờ quản trị viên bật rồi thử lại.'
const APP_REFUSED = 'Ứng dụng không thực hiện được đề xuất này.'

export interface AppActionCall {
  appId: string
  path: string
  body: Record<string, unknown>
  approver: Pick<Tenant, 'userId' | 'role' | 'htxCode'>
}

/** Runs an app action as the approver: the `dxos-apps-actor` token plus the three acting headers (C3). */
export class AppsActorClient {
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly readFileImpl: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly now: () => number = () => Date.now()
  ) {}

  private async secret(): Promise<string | null> {
    if (this.env.DXOS_APPS_ACTOR_SECRET) return this.env.DXOS_APPS_ACTOR_SECRET
    try {
      return parseEnvFile(await this.readFileImpl(ROLES_ENV_FILE)).DXOS_APPS_ACTOR_SECRET || null
    } catch {
      return null
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + TOKEN_SAFETY_MS) return this.token.value
    const secret = await this.secret()
    if (!secret) throw new DomainError(NOT_ENABLED)
    const realm = this.env.KEYCLOAK_INTERNAL_URL || 'http://keycloak:8080/realms/agrimarket'
    const res = await this.fetchImpl(`${realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ACTOR_CLIENT_ID, client_secret: secret }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`The apps actor token request failed with ${res.status}`)
    const data = (await res.json()) as { access_token: string; expires_in: number }
    this.token = { value: data.access_token, expiresAt: this.now() + data.expires_in * 1000 }
    return data.access_token
  }

  async call(call: AppActionCall): Promise<Record<string, unknown>> {
    const token = await this.accessToken()
    const res = await this.fetchImpl(`${this.env.CORE_GATEWAY_URL}/apps/${call.appId}${call.path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-DXOS-Acting-Sub': call.approver.userId,
        'X-DXOS-Acting-Role': call.approver.role,
        'X-DXOS-Acting-Htx': call.approver.htxCode,
      },
      body: JSON.stringify(call.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok) return body
    if (res.status >= 400 && res.status < 500) {
      const message = typeof body.message_vi === 'string' && body.message_vi.trim() ? body.message_vi.trim() : APP_REFUSED
      throw new DomainError(message)
    }
    throw new Error(`The app ${call.appId} answered ${res.status}`)
  }
}
