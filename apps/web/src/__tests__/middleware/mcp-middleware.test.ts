/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

jest.mock('@/auth', () => ({ auth: jest.fn((handler: unknown) => handler) }))

import { resolveAuthRedirect } from '@/middleware'

describe('middleware MCP exemption', () => {
  // The MCP routes verify the person's dxos-mcp bearer token themselves; there is never a session cookie (M14 CI).
  test('lets an unauthenticated request to /api/mcp/* reach the route verification', () => {
    expect(resolveAuthRedirect('/api/mcp/tools', false, undefined)).toBeNull()
    expect(resolveAuthRedirect('/api/mcp/tools/create_proposal', false, undefined)).toBeNull()
  })

  test('does not open look-alike paths', () => {
    expect(resolveAuthRedirect('/api/mcpx/tools', false, undefined)).toBe('UNAUTHORIZED_API')
    expect(resolveAuthRedirect('/api/mcp', false, undefined)).toBe('UNAUTHORIZED_API')
  })
})
