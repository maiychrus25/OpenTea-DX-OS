// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { StaffTokenVerifier, VerifiedStaffToken } from '@/domain/agent/ports/StaffTokenVerifier'
import { KeycloakStaffTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'
import { requireGatewayBearer } from './internal-gateway-auth'

const defaultVerifier = new KeycloakStaffTokenVerifier()

/**
 * Enforces the APISIX internal gateway boundary and verifies the caller's `dxos-staff-<htx>` bearer JWT,
 * so a staff app reaches only its own cooperative.
 */
export async function requireStaffCaller(
  req: Request,
  verifier: StaffTokenVerifier = defaultVerifier
): Promise<VerifiedStaffToken> {
  return verifier.verify(requireGatewayBearer(req))
}
