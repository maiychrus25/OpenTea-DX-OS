// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash, timingSafeEqual } from 'node:crypto'
import type { AgentTokenVerifier, VerifiedAgentToken } from '@/domain/agent/ports/AgentTokenVerifier'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { KeycloakAgentTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'

const defaultVerifier = new KeycloakAgentTokenVerifier()

function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest()
  const digestB = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(digestA, digestB)
}

/**
 * Enforces the APISIX internal gateway boundary (`X-Dxos-Gateway`) and verifies
 * the caller's Keycloak `agent` bearer JWT before letting internal agent routes execute.
 */
export async function requireAgentCaller(
  req: Request,
  verifier: AgentTokenVerifier = defaultVerifier
): Promise<VerifiedAgentToken> {
  const expectedSecret = process.env.DXOS_INTERNAL_GATEWAY_SECRET
  const providedSecret = req.headers.get('x-dxos-gateway')
  if (!expectedSecret || providedSecret === null || !constantTimeEquals(providedSecret, expectedSecret)) {
    throw new ForbiddenError('INTERNAL_GATEWAY_REQUIRED')
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(\S+)$/i)
  if (!match) {
    throw new UnauthorizedError('Missing bearer token')
  }

  return verifier.verify(match[1])
}
