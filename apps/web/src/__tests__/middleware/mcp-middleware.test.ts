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

describe('middleware internal routes of the mini-app factory (M13)', () => {
  // A12 and the relay call these with a service token and never carry a session cookie.
  test('lets the A12 routes and the relay media route reach their token check', () => {
    expect(resolveAuthRedirect('/api/internal/agent/app-builder/requests', false, undefined)).toBeNull()
    expect(resolveAuthRedirect('/api/internal/agent/app-builder/requests/abc/announce', false, undefined)).toBeNull()
    expect(resolveAuthRedirect('/api/internal/telegram/media', false, undefined)).toBeNull()
  })

  test('keeps the manager routes behind a session', () => {
    expect(resolveAuthRedirect('/api/agent/app-requests', false, undefined)).toBe('UNAUTHORIZED_API')
  })
})

describe('middleware Mini App entry (M6)', () => {
  test('sends a signed-out visitor of /telegram/open to the login with a return URL', () => {
    expect(resolveAuthRedirect('/telegram/open', false, undefined, '?to=%2Fmanager%2Fai')).toBe(
      '/login?callbackUrl=%2Ftelegram%2Fopen%3Fto%3D%252Fmanager%252Fai'
    )
  })

  test('lets a signed-in person reach it, and keeps the session route behind the session', () => {
    expect(resolveAuthRedirect('/telegram/open', true, 'farmer')).toBeNull()
    expect(resolveAuthRedirect('/api/telegram/webapp/session', false, undefined)).toBe('UNAUTHORIZED_API')
  })
})

describe('middleware public pages', () => {
  test('middleware does not list deleted pages as public', () => {
    expect(resolveAuthRedirect('/forgot-pin', false, undefined)).toBe('/login')
    expect(resolveAuthRedirect('/login', false, undefined)).toBeNull()
  })
})
