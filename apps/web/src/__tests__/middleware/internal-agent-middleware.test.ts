/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

jest.mock('@/auth', () => ({ auth: jest.fn((handler: unknown) => handler) }))

import { resolveAuthRedirect } from '@/middleware'

describe('middleware internal agent exemption', () => {
  test('allows unauthenticated requests to /api/internal/* to reach route handler verification', () => {
    expect(resolveAuthRedirect('/api/internal/agent/runs', false, undefined)).toBeNull()
    expect(resolveAuthRedirect('/api/internal/agent/proposals', false, undefined)).toBeNull()
  })

  test('lets the staff app routes reach their own token check', () => {
    expect(resolveAuthRedirect('/api/internal/staff/tasks', false, undefined)).toBeNull()
    expect(resolveAuthRedirect('/api/internal/staff/tasks/abc/ack', false, undefined)).toBeNull()
    expect(resolveAuthRedirect('/api/internal/staff/roster', false, undefined)).toBeNull()
    expect(resolveAuthRedirect('/api/internal/staff/attendance', false, undefined)).toBeNull()
  })

  test('continues blocking unauthenticated /api/agent/* requests', () => {
    expect(resolveAuthRedirect('/api/agent/proposals', false, undefined)).toBe('UNAUTHORIZED_API')
  })
})
