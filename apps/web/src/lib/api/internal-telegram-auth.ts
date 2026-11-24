// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { TelegramTokenVerifier, VerifiedTelegramToken } from '@/domain/telegram/ports/TelegramTokenVerifier'
import { KeycloakTelegramTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'
import { requireGatewayBearer } from './internal-gateway-auth'

const defaultVerifier = new KeycloakTelegramTokenVerifier()

/** Gateway boundary plus the `dxos-telegram` service token, for `/api/internal/telegram/*` only. */
export async function requireTelegramCaller(
  req: Request,
  verifier: TelegramTokenVerifier = defaultVerifier
): Promise<VerifiedTelegramToken> {
  return verifier.verify(requireGatewayBearer(req))
}
