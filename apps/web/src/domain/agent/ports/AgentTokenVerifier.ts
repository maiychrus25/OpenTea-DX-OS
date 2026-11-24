// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface VerifiedAgentToken {
  sub: string
  azp: string
  htxCode: string
  roles: string[]
}

export interface AgentTokenVerifier {
  verify(token: string): Promise<VerifiedAgentToken>
}
