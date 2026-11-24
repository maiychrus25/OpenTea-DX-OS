// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AgentTokenVerifier, VerifiedAgentToken } from '@/domain/agent/ports/AgentTokenVerifier'
import { KeycloakAgentTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'
import { requireGatewayBearer } from './internal-gateway-auth'

const defaultVerifier = new KeycloakAgentTokenVerifier()

/**
 * Enforces the APISIX internal gateway boundary (`X-Dxos-Gateway`) and verifies
 * the caller's Keycloak `agent` bearer JWT before letting internal agent routes execute.
 */
export async function requireAgentCaller(
  req: Request,
  verifier: AgentTokenVerifier = defaultVerifier
): Promise<VerifiedAgentToken> {
  return verifier.verify(requireGatewayBearer(req))
}
