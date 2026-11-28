// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { UserTokenVerifier } from '@/domain/auth/ports/UserTokenVerifier'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { KeycloakUserTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
import { requireGatewayBearer } from './internal-gateway-auth'
import type { Tenant } from './tenant'

const defaultVerifier = new KeycloakUserTokenVerifier()

/**
 * `/api/internal/apps/*`: the gateway boundary plus the manager's own Keycloak token, re-verified here.
 * The cooperative is the one in the token, so a manager reaches no other cooperative. No session is read.
 */
export async function requireAppUserCaller(req: Request, verifier: UserTokenVerifier = defaultVerifier): Promise<Tenant> {
  const token = await verifier.verify(requireGatewayBearer(req))
  if (!token.roles.includes('manager')) throw new ForbiddenError('Manager role required')
  const htx = await new PrismaHtxProfileRepository().findByCode(token.htxCode)
  if (!htx) throw new UnauthorizedError('Unknown cooperative')
  return { userId: token.sub, role: 'manager', htxCode: token.htxCode, htxProfileId: htx.id }
}
