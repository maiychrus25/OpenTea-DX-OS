// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { encode } from 'next-auth/jwt'

/**
 * DEV-ONLY: Quick login as any role without Keycloak.
 * Usage: GET /api/dev-login?role=manager
 * Roles: manager, officer, farmer
 */
export async function GET(request: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const url = new URL(request.url)
  const role = url.searchParams.get('role') || 'officer'
  const validRoles = ['manager', 'officer', 'farmer']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Use: ${validRoles.join(', ')}` }, { status: 400 })
  }

  const ROLE_NAMES: Record<string, string> = {
    manager: 'Trưởng HTX (Dev)',
    officer: 'Cán bộ KT (Dev)',
    farmer: 'Nông dân (Dev)',
  }

  const now = Math.floor(Date.now() / 1000)
  const secret = process.env.AUTH_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || 'agrimarket-secret-key'

  const token = await encode({
    token: {
      sub: `dev-${role}-id`,
      name: ROLE_NAMES[role],
      email: `${role}@dev.local`,
      role,
      iat: now,
      exp: now + 60 * 60 * 8,
      jti: `dev-jti-${now}`,
    },
    secret,
    salt: 'authjs.session-token',
  })

  const cookieStore = await cookies()
  cookieStore.set('authjs.session-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  })

  const redirectMap: Record<string, string> = {
    manager: '/manager/dashboard',
    officer: '/officer/dashboard',
    farmer: '/farmer/dashboard',
  }

  return NextResponse.redirect(new URL(redirectMap[role], request.url))
}
