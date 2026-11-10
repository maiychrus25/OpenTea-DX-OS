// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from "./auth"
import { NextResponse } from "next/server"
import { isPublicResourcePath, isPublicApiPath } from '@/lib/contracts/public-resource-path'

export { isPublicResourcePath, isPublicApiPath } from '@/lib/contracts/public-resource-path'

const RECOGNIZED_ROLES = ['manager', 'officer', 'farmer'] as const
type RecognizedRole = (typeof RECOGNIZED_ROLES)[number]

/**
 * Pure function — extracts route-decision logic for testability.
 * Returns a redirect path string, or null if the request should proceed.
 */
export function resolveAuthRedirect(
  pathname: string,
  isLoggedIn: boolean,
  role: string | undefined,
): string | null {
  const lowerPath = pathname.toLowerCase()

  // Static assets and auth endpoints — always allow (case-insensitive, exact prefix with slash)
  if (
    lowerPath.startsWith('/api/auth/') ||
    lowerPath === '/api/auth' ||
    lowerPath.startsWith('/_next') ||
    pathname === '/favicon.ico'
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
        isPublicApiPath(pathname)
      )
        return null
      return 'UNAUTHORIZED_API'
    }
    if (
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/forgot-pin' ||
      pathname === '/unauthorized' ||
      isPublicResourcePath(pathname)
    )
      return null
    return '/login'
  }

  const isRecognized = RECOGNIZED_ROLES.includes(role as RecognizedRole)

  // Fail-closed: authenticated but unknown/missing role → /unauthorized
  // Guard: don't redirect /unauthorized or /login themselves (prevent infinite loop)
  if (!isRecognized && pathname !== '/unauthorized' && pathname !== '/login') {
    return '/unauthorized'
  }

  // RBAC: protect role-specific routes
  if (lowerPath.startsWith('/manager') && role !== 'manager') return '/unauthorized'
  if (lowerPath.startsWith('/officer') && role !== 'officer') return '/unauthorized'
  if (lowerPath.startsWith('/farmer')  && role !== 'farmer')  return '/unauthorized'

  // Root redirect based on role
  if (pathname === '/') {
    if (role === 'manager') return '/manager/dashboard'
    if (role === 'officer') return '/officer/dashboard'
    if (role === 'farmer')  return '/farmer/dashboard'
    // Fail-closed guard (belt-and-suspenders after isRecognized check)
    return '/unauthorized'
  }

  return null // allow
}

export default auth((req) => {
  const isLoggedIn = !!req.auth && req.auth.error !== 'RefreshFailed'
  const { pathname } = req.nextUrl
  const role = req.auth?.user?.role

  const redirect = resolveAuthRedirect(pathname, isLoggedIn, role)
  if (redirect === 'UNAUTHORIZED_API') {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized access' } }, { status: 401 })
  }
  if (redirect) return NextResponse.redirect(new URL(redirect, req.url))
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw\\.js|workbox-.*\\.js|manifest\\.json|api/auth|api/health|api/dev-login|sample-certificate\\.pdf).*)'],
}
