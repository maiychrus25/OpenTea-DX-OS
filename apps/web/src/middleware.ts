// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from "./auth"
import { NextResponse } from "next/server"
import { isPublicResourcePath, isPublicApiPath, isMiniAppPath } from '@/lib/contracts/public-resource-path'

export { isPublicResourcePath, isPublicApiPath } from '@/lib/contracts/public-resource-path'

import { heldRoles, homeFor, isHumanRole, type HumanRole } from '@/lib/auth/roles'

const ROLE_AREAS: ReadonlyArray<readonly [string, HumanRole]> = [
  ['/manager', 'manager'],
  ['/officer', 'officer'],
  ['/farmer', 'farmer'],
  ['/accountant', 'accountant'],
  ['/platform', 'platform_admin'],
]

/**
 * Pure function — extracts route-decision logic for testability.
 * Returns a redirect path string, or null if the request should proceed.
 */
export function resolveAuthRedirect(
  pathname: string,
  isLoggedIn: boolean,
  role: string | undefined,
  search = '',
  roles?: string[],
): string | null {
  const lowerPath = pathname.toLowerCase()

  // Static assets, auth endpoints and mini-app paths (the proxy route checks them) — always allow
  if (
    lowerPath.startsWith('/api/auth/') ||
    lowerPath === '/api/auth' ||
    lowerPath.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    isMiniAppPath(pathname)
  ) {
    return null
  }

  // Unauthenticated — allow public paths and /login, block everything else
  if (!isLoggedIn) {
    if (lowerPath.startsWith('/api/')) {
      if (
        lowerPath.startsWith('/api/auth/') ||
        lowerPath === '/api/auth' ||
        lowerPath.startsWith('/api/health') ||
        lowerPath === '/api/health/' ||
        lowerPath.startsWith('/api/dev-login') ||
        lowerPath.startsWith('/api/internal/') ||
        // MCP routes verify the person's dxos-mcp bearer token themselves; an MCP client never has a session.
        lowerPath.startsWith('/api/mcp/') ||
        isPublicApiPath(pathname)
      )
        return null
      return 'UNAUTHORIZED_API'
    }
    if (
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/unauthorized' ||
      isPublicResourcePath(pathname)
    )
      return null
    // The Mini App entry keeps its return URL, so the person lands on it after signing in inside Telegram.
    if (pathname === '/telegram/open') return `/login?callbackUrl=${encodeURIComponent(pathname + search)}`
    return '/login'
  }

  // A session from before multi-role support has no roles list: it holds only its role.
  const held = heldRoles({ role, roles: roles ?? (role ? [role] : []) })
  const active = isHumanRole(role) && held.includes(role) ? role : undefined

  // Fail-closed: authenticated but unknown/missing role → /unauthorized
  // Guard: don't redirect /unauthorized or /login themselves (prevent infinite loop)
  if (!active && pathname !== '/unauthorized' && pathname !== '/login') {
    return '/unauthorized'
  }

  // RBAC: protect role-specific routes. The user holds the role but it is not the active one: offer the switch.
  for (const [prefix, areaRole] of ROLE_AREAS) {
    if (lowerPath === prefix || lowerPath.startsWith(prefix + '/')) {
      if (active === areaRole) break
      return held.includes(areaRole) ? `/unauthorized?switch=${areaRole}` : '/unauthorized'
    }
  }

  // Root redirect based on the active role
  if (pathname === '/') return active ? homeFor(active) : '/unauthorized'

  return null // allow
}

export default auth((req) => {
  const isLoggedIn = !!req.auth && req.auth.error !== 'RefreshFailed'
  const { pathname } = req.nextUrl
  const role = req.auth?.user?.role
  const roles = req.auth?.user?.roles

  const redirect = resolveAuthRedirect(pathname, isLoggedIn, role, req.nextUrl.search, roles)
  if (redirect === 'UNAUTHORIZED_API') {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized access' } }, { status: 401 })
  }
  if (redirect) return NextResponse.redirect(new URL(redirect, req.url))
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw\\.js|workbox-.*\\.js|manifest\\.json|dxos-app\\.css|icon-\\d+x\\d+\\.png|api/auth|api/health|api/dev-login|sample-certificate\\.pdf|images/(?:tea-hills-(?:sunrise|mist)|auth-hills)\\.jpg).*)'],
}
