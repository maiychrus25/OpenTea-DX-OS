// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import { auth } from '@/auth'
import { CoreUnavailableError, ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { logger } from '@/lib/logger'
import { KEYCLOAK_INTERNAL, readHtxCode, roleFromRealmRoles } from '@/lib/auth/token-refresh'

/** The only client whose access tokens a mobile app may present. Tokens of any other client are refused. */
export const MOBILE_CLIENT_ID = 'dxos-mobile'

const MAX_TOKEN_LENGTH = 8192
const CLOCK_TOLERANCE_SECONDS = 30
const JWKS_TTL_MS = 10 * 60_000
/** A token naming an unknown `kid` may force one refetch (key rotation), at most this often. */
const JWKS_MIN_REFETCH_MS = 30_000
const JWKS_TIMEOUT_MS = 5000
const JWKS_MAX_KEYS = 20
const BASE64URL = /^[A-Za-z0-9_-]+$/
const HTX_CODE = /^[A-Za-z0-9_-]{1,20}$/

/** The caller, in the shape of `session.user`. */
export type RequestUser = {
  id: string
  role: 'manager' | 'officer' | 'farmer'
  htxCode: string | null
  name?: string | null
}

export type RequestAuth = {
  user: RequestUser
  /** The verified access token when the caller used a Bearer header, null for a cookie session. */
  accessToken: string | null
}

type Jwk = JsonWebKey & { kid?: string; use?: string; alg?: string }

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null
let jwksInFlight: Promise<Jwk[]> | null = null
let lastForcedFetch = 0

/** Test hook: forgets the cached key set. */
export function resetJwksCache(): void {
  jwksCache = null
  jwksInFlight = null
  lastForcedFetch = 0
}

async function fetchJwks(): Promise<Jwk[]> {
  if (jwksInFlight) return jwksInFlight
  jwksInFlight = (async () => {
    try {
      const response = await fetch(`${KEYCLOAK_INTERNAL}/protocol/openid-connect/certs`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`status ${response.status}`)
      const body = (await response.json()) as { keys?: unknown }
      if (!Array.isArray(body.keys)) throw new Error('no keys')
      const keys = (body.keys as Jwk[]).filter((k) => k && typeof k === 'object').slice(0, JWKS_MAX_KEYS)
      jwksCache = { keys, fetchedAt: Date.now() }
      return keys
    } finally {
      jwksInFlight = null
    }
  })()
  return jwksInFlight
}

/** The signing key for a `kid`. A Keycloak that cannot be reached leaves no key, so the caller is refused (fail closed). */
async function findKey(kid: string): Promise<Jwk | null> {
  const now = Date.now()
  let keys = jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS ? jwksCache.keys : await fetchJwks()
  let key = keys.find((k) => k.kid === kid)
  if (!key && Date.now() - lastForcedFetch > JWKS_MIN_REFETCH_MS && jwksCache && Date.now() - jwksCache.fetchedAt > JWKS_MIN_REFETCH_MS) {
    lastForcedFetch = Date.now()
    keys = await fetchJwks()
    key = keys.find((k) => k.kid === kid)
  }
  if (!key || key.kty !== 'RSA' || (key.use && key.use !== 'sig')) return null
  return key
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** The claims of a token whose RS256 signature, issuer, times and client all check out; null otherwise. */
async function verifyMobileToken(token: string): Promise<Record<string, any> | null> {
  if (token.length > MAX_TOKEN_LENGTH) return null
  const parts = token.split('.')
  if (parts.length !== 3 || !parts.every((p) => BASE64URL.test(p))) return null

  const header = decodeJson(parts[0])
  // Only RS256 is accepted: "none", HS256 (a public key used as a secret) and every other algorithm are refused.
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200) return null

  let jwk: Jwk | null
  try {
    jwk = await findKey(header.kid)
  } catch {
    // Fail closed, but as 503 rather than 401 so a client keeps its sign-in. Nothing token-derived is logged.
    logger.error('Keycloak key set unavailable, Bearer token refused', { reason: 'jwks' })
    throw new CoreUnavailableError()
  }
  if (!jwk) return null
  let valid = false
  try {
    valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))
  } catch {
    return null
  }
  if (!valid) return null

  const claims = decodeJson(parts[1])
  if (!claims) return null
  const issuer = process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/agrimarket'
  const now = Math.floor(Date.now() / 1000)
  if (claims.iss !== issuer) return null
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_TOLERANCE_SECONDS <= now) return null
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf - CLOCK_TOLERANCE_SECONDS > now)) return null
  // The authorized party, not the audience: service accounts and the web client carry the same `aud` entries.
  if (claims.azp !== MOBILE_CLIENT_ID) return null
  if (typeof claims.sub !== 'string' || !claims.sub) return null
  return claims
}

function bearerToken(request: Request): string | null {
  const header = request.headers?.get('authorization') ?? null
  if (header === null) return null
  const match = /^bearer(?:\s+(.*))?$/i.exec(header.trim())
  return match ? (match[1] ?? '').trim() : null
}

/**
 * The caller of a request: a verified mobile Bearer token when the Authorization header carries one, otherwise the
 * NextAuth cookie session (null when there is none).
 * A Bearer header that is present but not valid throws UnauthorizedError (401) and never falls back to the cookie;
 * a valid token without a manager/officer/farmer role throws ForbiddenError (403).
 */
export async function authFromRequest(request: Request): Promise<RequestAuth | null> {
  const token = bearerToken(request)
  if (token === null) {
    const user = (await auth())?.user
    if (!user) return null
    return { user: user as RequestUser, accessToken: null }
  }

  const claims = token ? await verifyMobileToken(token) : null
  if (!claims) throw new UnauthorizedError('Invalid or expired token')
  const role = roleFromRealmRoles(claims.realm_access?.roles)
  if (!role) throw new ForbiddenError('Forbidden')

  const htxCode = readHtxCode(token)
  return {
    user: {
      id: claims.sub,
      role,
      htxCode: typeof htxCode === 'string' && HTX_CODE.test(htxCode) ? htxCode : null,
      name: (claims.name as string) || (claims.preferred_username as string) || 'Unknown',
    },
    accessToken: token,
  }
}

/** A token provider for CoreGatewayClient: the caller's own verified token, so Hasura scopes rows exactly as for a session. */
export function coreTokenOf(authResult: RequestAuth): (() => Promise<string>) | undefined {
  const { accessToken } = authResult
  return accessToken ? async () => accessToken : undefined
}
