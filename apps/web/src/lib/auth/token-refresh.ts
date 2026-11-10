// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { JWT } from 'next-auth/jwt'
import { logger } from '@/lib/logger'

// Internal Keycloak URL (container-to-container) dùng cho token/userinfo
export const KEYCLOAK_INTERNAL = process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/agrimarket'
export const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'nextjs-web'
export const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || 'agrimarket-secret-key'

const REFRESH_WINDOW_SECONDS = 30
const REFRESH_TIMEOUT_MS = 5000

function readClaims(accessToken: string): Record<string, any> | null {
  try {
    // atob, not Buffer: this runs in the Edge middleware. Only ASCII claims are read, so UTF-8 can stay undecoded.
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}

export function readHtxCode(accessToken: string): string | null {
  return readClaims(accessToken)?.htx_code || null
}

/** The strongest role in Keycloak's realm_access.roles, or undefined when none is recognised. */
export function roleFromRealmRoles(roles: unknown): 'manager' | 'officer' | 'farmer' | undefined {
  if (!Array.isArray(roles)) return undefined
  return (['manager', 'officer', 'farmer'] as const).find((role) => roles.includes(role))
}

export async function refreshAccessToken(token: JWT, fetchImpl: typeof fetch = fetch): Promise<JWT> {
  // No refresh token: a dev-login or pre-upgrade cookie, or a refresh that already failed.
  if (!token.refreshToken) {
    return process.env.NODE_ENV === 'production' ? { ...token, accessToken: undefined, error: 'RefreshFailed' } : token
  }

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = token.accessTokenExpiresAt ?? 0
  if (expiresAt - now > REFRESH_WINDOW_SECONDS) return token

  try {
    const response = await fetchImpl(`${KEYCLOAK_INTERNAL}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
      }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
    const data = response.ok ? await response.json() : null
    if (data?.access_token && data.expires_in) {
      return {
        ...token,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? token.refreshToken,
        accessTokenExpiresAt: now + data.expires_in,
        htxCode: readHtxCode(data.access_token),
        role: roleFromRealmRoles(readClaims(data.access_token)?.realm_access?.roles),
      }
    }
    logger.error('Keycloak token refresh failed', { status: response.status })
  } catch {
    // The error is not logged: only the fact of the failure is useful, and nothing token-derived may reach a log line.
    logger.error('Keycloak token refresh failed', { status: 'unreachable' })
  }

  // Keycloak being down or slow must not end a session whose access token still works.
  if (expiresAt > now) return token
  return { ...token, accessToken: undefined, refreshToken: undefined, error: 'RefreshFailed' }
}
