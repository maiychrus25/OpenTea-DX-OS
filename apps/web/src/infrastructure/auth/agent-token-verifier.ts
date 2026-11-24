// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createPublicKey, verify as cryptoVerify, type JsonWebKey, type KeyObject } from 'node:crypto'
import type { AgentTokenVerifier, VerifiedAgentToken } from '@/domain/agent/ports/AgentTokenVerifier'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'

const TEN_MINUTES_MS = 10 * 60 * 1000
const JWKS_TIMEOUT_MS = 5000
const HTX_CODE_RE = /^[A-Z0-9_-]{1,20}$/

interface JwkEntry extends JsonWebKey {
  kid?: string
  kty?: string
  use?: string
  alg?: string
}

interface JwksCache {
  keys: Map<string, KeyObject>
  fetchedAt: number
}

export interface KeycloakAgentTokenVerifierOptions {
  jwksUrl?: string
  expectedIssuer?: string
  expectedAudience?: string
  cacheTtlMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
}

function defaultKeycloakInternal(): string {
  return process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/agrimarket'
}

function defaultKeycloakIssuer(): string {
  return process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/agrimarket'
}

function decodeJwtPart(segment: string): Record<string, unknown> {
  if (!segment) throw new UnauthorizedError('Invalid token format')
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new UnauthorizedError('Invalid token format')
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid token format')
  }
}

function hasAudience(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected
  if (Array.isArray(aud)) return aud.includes(expected)
  return false
}

/** Verifies Keycloak RS256 service-account JWTs issued to per-HTX `dxos-agent-<htx>` clients. */
export class KeycloakAgentTokenVerifier implements AgentTokenVerifier {
  private readonly jwksUrl: string
  private readonly expectedIssuer: string
  private readonly expectedAudience: string
  private readonly cacheTtlMs: number
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private cache: JwksCache | null = null
  private inFlight: Promise<JwksCache> | null = null

  constructor(options: KeycloakAgentTokenVerifierOptions = {}) {
    this.jwksUrl = options.jwksUrl ?? `${defaultKeycloakInternal()}/protocol/openid-connect/certs`
    this.expectedIssuer = options.expectedIssuer ?? defaultKeycloakIssuer()
    this.expectedAudience = options.expectedAudience ?? 'dx-os-core'
    this.cacheTtlMs = options.cacheTtlMs ?? TEN_MINUTES_MS
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => Date.now())
  }

  private async fetchJwks(): Promise<JwksCache> {
    if (this.inFlight) return this.inFlight
    this.inFlight = (async () => {
      let res: Response
      try {
        res = await this.fetchImpl(this.jwksUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
        })
      } catch {
        throw new UnauthorizedError('Unable to fetch signing keys')
      }
      if (!res.ok) {
        throw new UnauthorizedError('Unable to fetch signing keys')
      }
      const data = (await res.json().catch(() => null)) as { keys?: JwkEntry[] } | null
      if (!data || !Array.isArray(data.keys)) {
        throw new UnauthorizedError('Invalid signing key set')
      }

      const keys = new Map<string, KeyObject>()
      for (const jwk of data.keys) {
        if (
          jwk.kty === 'RSA' &&
          typeof jwk.kid === 'string' &&
          jwk.kid.length > 0 &&
          (jwk.use === undefined || jwk.use === 'sig') &&
          (jwk.alg === undefined || jwk.alg === 'RS256')
        ) {
          try {
            keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }))
          } catch {
            // Skip malformed JWK entry rather than breaking valid keys.
          }
        }
      }

      const nextCache: JwksCache = { keys, fetchedAt: this.now() }
      this.cache = nextCache
      return nextCache
    })().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async getSigningKey(kid: string): Promise<KeyObject> {
    const expired = !this.cache || this.now() - this.cache.fetchedAt >= this.cacheTtlMs
    const current = expired ? await this.fetchJwks() : this.cache!
    const hit = current.keys.get(kid)
    if (hit) return hit

    // Unknown kid while cache is still fresh triggers one forced refetch for key rotation.
    if (!expired) {
      const refreshed = await this.fetchJwks()
      const retryHit = refreshed.keys.get(kid)
      if (retryHit) return retryHit
    }

    throw new UnauthorizedError('Unknown signing key')
  }

  async verify(token: string): Promise<VerifiedAgentToken> {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new UnauthorizedError('Invalid token format')
    }
    const [headerB64, payloadB64, signatureB64] = parts
    const header = decodeJwtPart(headerB64)
    const payload = decodeJwtPart(payloadB64)

    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) {
      throw new UnauthorizedError('Unsupported token algorithm')
    }

    const key = await this.getSigningKey(header.kid)
    let signatureOk = false
    try {
      signatureOk = cryptoVerify(
        'RSA-SHA256',
        Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
        key,
        Buffer.from(signatureB64, 'base64url')
      )
    } catch {
      signatureOk = false
    }
    if (!signatureOk) {
      throw new UnauthorizedError('Invalid token signature')
    }

    const nowSec = Math.floor(this.now() / 1000)
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSec) {
      throw new UnauthorizedError('Token expired')
    }
    if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > nowSec + 5)) {
      throw new UnauthorizedError('Token not yet valid')
    }
    if (payload.iss !== this.expectedIssuer) {
      throw new UnauthorizedError('Invalid token issuer')
    }
    if (!hasAudience(payload.aud, this.expectedAudience)) {
      throw new UnauthorizedError('Invalid token audience')
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedError('Invalid token subject')
    }

    const realmAccess = payload.realm_access as { roles?: unknown } | undefined
    const roles = Array.isArray(realmAccess?.roles)
      ? realmAccess.roles.filter((r): r is string => typeof r === 'string')
      : []
    if (!roles.includes('agent')) {
      throw new ForbiddenError('Agent role required')
    }

    if (typeof payload.htx_code !== 'string' || !HTX_CODE_RE.test(payload.htx_code)) {
      throw new ForbiddenError('Valid htx_code claim required')
    }

    const expectedAzp = `dxos-agent-${payload.htx_code.toLowerCase()}`
    if (payload.azp !== expectedAzp) {
      throw new ForbiddenError('Invalid agent client binding')
    }

    return {
      sub: payload.sub,
      azp: payload.azp,
      htxCode: payload.htx_code,
      roles,
    }
  }
}
