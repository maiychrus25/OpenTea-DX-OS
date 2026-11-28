// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { VerifiedZaloToken, ZaloTokenVerifier } from '@/domain/zalo/ports/ZaloTokenVerifier'
import { KeycloakZaloTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'
import { requireGatewayBearer } from './internal-gateway-auth'

const defaultVerifier = new KeycloakZaloTokenVerifier()

/** Gateway boundary plus the `dxos-zalo` service token, for `/api/internal/zalo/*` only. */
export async function requireZaloCaller(req: Request, verifier: ZaloTokenVerifier = defaultVerifier): Promise<VerifiedZaloToken> {
  return verifier.verify(requireGatewayBearer(req))
}
