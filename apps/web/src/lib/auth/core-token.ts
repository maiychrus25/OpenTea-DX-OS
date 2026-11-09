// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getToken } from 'next-auth/jwt'
import { headers } from 'next/headers'
import { CoreUnauthorizedError } from '@/domain/errors'
import { refreshAccessToken } from './token-refresh'

/** Server-only (next/headers): the user's Keycloak access token for calling the core gateway. */
export async function getCoreToken(): Promise<string> {
  const requestHeaders = headers()
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL
  const stored = await getToken({
    req: { headers: requestHeaders },
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    // Same rule next-auth uses to name the session cookie.
    secureCookie: authUrl ? authUrl.startsWith('https:') : requestHeaders.get('x-forwarded-proto') === 'https',
  })
  if (!stored) throw new CoreUnauthorizedError()

  // The middleware's refreshed cookie only reaches the browser, so this request can still carry the old token.
  const token = await refreshAccessToken(stored)
  if (token.error || !token.accessToken) throw new CoreUnauthorizedError()
  return token.accessToken
}
