// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { McpTokenVerifier, VerifiedMcpToken } from '@/domain/mcp/ports/McpTokenVerifier'
import { UnauthorizedError } from '@/domain/errors'
import { KeycloakMcpTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'

const defaultVerifier = new KeycloakMcpTokenVerifier()

/** Verifies the person's `dxos-mcp` bearer token for `/api/mcp/*`. No session or gateway header is involved. */
export async function requireMcpCaller(req: Request, verifier: McpTokenVerifier = defaultVerifier): Promise<VerifiedMcpToken> {
  const match = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  if (!match) throw new UnauthorizedError('Missing bearer token')
  return verifier.verify(match[1])
}
