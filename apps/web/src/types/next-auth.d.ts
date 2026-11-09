// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import NextAuth, { type DefaultSession } from "next-auth"

declare module "next-auth/jwt" {
  interface JWT {
    role?: 'manager' | 'officer' | 'farmer'
    accessToken?: string
    refreshToken?: string
    /** Seconds since the epoch. */
    accessTokenExpiresAt?: number
    htxCode?: string | null
    error?: 'RefreshFailed'
  }
}

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    error?: 'RefreshFailed'
    user: {
      role?: 'manager' | 'officer' | 'farmer'
      htxCode: string | null
    } & DefaultSession["user"]
  }
}
