/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { resolveAuthRedirect } from '@/middleware'

jest.mock('@/auth', () => ({ auth: (handler: unknown) => handler }))

describe('resolveAuthRedirect, mobile app endpoints', () => {
  test.each(['/api/apps/tea-tour/tenants', '/api/apps/tea-tour/tenants/', '/api/mobile/config'])('%s is reachable without a session', path => {
    expect(resolveAuthRedirect(path, false, undefined)).toBeNull()
  })

  test.each([
    '/api/apps/tea-tour/tenants/x',
    '/api/apps/tea-tour/other',
    '/api/apps/tea-tour',
    '/api/apps/Tea_Tour/tenants',
    '/api/apps/a/b/tenants',
    '/api/mobile/config/x',
    '/api/mobile',
    '/api/mobile/other',
    '/api/members',
  ])('%s still needs a session', path => {
    expect(resolveAuthRedirect(path, false, undefined)).toBe('UNAUTHORIZED_API')
  })
})
