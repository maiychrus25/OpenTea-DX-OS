// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Keycloak client of the MCP bridge (`dxos-mcp`), a public client on the device grant. */
export const MCP_CLIENT_ID = 'dxos-mcp'

export interface VerifiedMcpToken {
  sub: string
  azp: string
  roles: string[]
}

export interface McpTokenVerifier {
  verify(token: string): Promise<VerifiedMcpToken>
}
