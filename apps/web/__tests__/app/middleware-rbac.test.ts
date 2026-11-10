// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * @jest-environment node
 *
 * Unit tests cho Story 1-5: middleware RBAC và fail-closed behavior.
 * Test pure function resolveAuthRedirect() — không cần NextRequest, không cần Keycloak.
 *
 * Chạy: npm test -- --testPathPatterns="middleware-rbac"
 */

// Mock @/auth TRƯỚC TIÊN để chặn next-auth ESM import chain
// (next-auth dùng ESM, không tương thích Jest CommonJS transform)
jest.mock('@/auth', () => ({
  auth: (fn: unknown) => fn, // pass-through: không dùng trong test này
}))

// Mock public-resource-path
jest.mock('@/lib/contracts/public-resource-path', () => ({
  isPublicResourcePath: (pathname: string) => /^\/(?:lot|htx)\/[^/]+$/.test(pathname),
  isPublicApiPath: jest.requireActual('@/lib/contracts/public-resource-path').isPublicApiPath,
}))

// Import pure function — không import middleware handler (Edge Runtime incompatible)
import { resolveAuthRedirect } from '@/middleware'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const allow = null // resolveAuthRedirect returns null → allow request

describe('resolveAuthRedirect — unauthenticated', () => {
  it('allows the public home page /', () => {
    expect(resolveAuthRedirect('/', false, undefined)).toBe(allow)
  })

  it('redirects /manager/dashboard to /login', () => {
    expect(resolveAuthRedirect('/manager/dashboard', false, undefined)).toBe('/login')
  })

  it('redirects /officer/journal to /login', () => {
    expect(resolveAuthRedirect('/officer/journal', false, undefined)).toBe('/login')
  })

  it('allows /login (no redirect)', () => {
    expect(resolveAuthRedirect('/login', false, undefined)).toBe(allow)
  })

  it('allows public /lot/[code] path', () => {
    expect(resolveAuthRedirect('/lot/TC-CHE-20260801-001', false, undefined)).toBe(allow)
  })

  it('allows public /htx/[code] path', () => {
    expect(resolveAuthRedirect('/htx/HTX001', false, undefined)).toBe(allow)
  })

  it('allows anonymous self-registration on /api/register', () => {
    expect(resolveAuthRedirect('/api/register', false, undefined)).toBe(allow)
  })

  it('still refuses anonymous access to paths under /api/register', () => {
    expect(resolveAuthRedirect('/api/register/admin', false, undefined)).toBe('UNAUTHORIZED_API')
  })
})

describe('resolveAuthRedirect — authenticated, VALID role', () => {
  it('manager on /manager/dashboard → allow', () => {
    expect(resolveAuthRedirect('/manager/dashboard', true, 'manager')).toBe(allow)
  })

  it('officer on /officer/journal → allow', () => {
    expect(resolveAuthRedirect('/officer/journal', true, 'officer')).toBe(allow)
  })

  it('farmer on /farmer/dashboard → allow', () => {
    expect(resolveAuthRedirect('/farmer/dashboard', true, 'farmer')).toBe(allow)
  })

  it('manager on / → redirects to /manager/dashboard', () => {
    expect(resolveAuthRedirect('/', true, 'manager')).toBe('/manager/dashboard')
  })

  it('officer on / → redirects to /officer/dashboard', () => {
    expect(resolveAuthRedirect('/', true, 'officer')).toBe('/officer/dashboard')
  })

  it('farmer on / → redirects to /farmer/dashboard', () => {
    expect(resolveAuthRedirect('/', true, 'farmer')).toBe('/farmer/dashboard')
  })
})

describe('resolveAuthRedirect — RBAC cross-role', () => {
  it('officer accessing /manager/* → /unauthorized', () => {
    expect(resolveAuthRedirect('/manager/dashboard', true, 'officer')).toBe('/unauthorized')
  })

  it('farmer accessing /officer/* → /unauthorized', () => {
    expect(resolveAuthRedirect('/officer/journal', true, 'farmer')).toBe('/unauthorized')
  })

  it('manager accessing /farmer/* → /unauthorized', () => {
    expect(resolveAuthRedirect('/farmer/dashboard', true, 'manager')).toBe('/unauthorized')
  })
})

describe('resolveAuthRedirect — FAIL-CLOSED: unknown/missing role (Issue #46)', () => {
  it('role=undefined on /dashboard → /unauthorized (not stuck on page)', () => {
    expect(resolveAuthRedirect('/dashboard', true, undefined)).toBe('/unauthorized')
  })

  it('role=undefined on /manager/lots → /unauthorized', () => {
    expect(resolveAuthRedirect('/manager/lots', true, undefined)).toBe('/unauthorized')
  })

  it('role="admin" (unknown) on / → /unauthorized', () => {
    expect(resolveAuthRedirect('/', true, 'admin')).toBe('/unauthorized')
  })

  it('role=undefined on /unauthorized → allow (prevent infinite redirect loop)', () => {
    expect(resolveAuthRedirect('/unauthorized', true, undefined)).toBe(allow)
  })

  it('role=undefined on /login → allow (prevent infinite redirect loop)', () => {
    expect(resolveAuthRedirect('/login', true, undefined)).toBe(allow)
  })
})

describe('resolveAuthRedirect — static/auth paths always allowed', () => {
  it('/_next/static/... → allow', () => {
    expect(resolveAuthRedirect('/_next/static/chunks/main.js', false, undefined)).toBe(allow)
  })

  it('/api/auth/callback → allow', () => {
    expect(resolveAuthRedirect('/api/auth/callback/keycloak', false, undefined)).toBe(allow)
  })

  it('/favicon.ico → allow', () => {
    expect(resolveAuthRedirect('/favicon.ico', false, undefined)).toBe(allow)
  })
})
