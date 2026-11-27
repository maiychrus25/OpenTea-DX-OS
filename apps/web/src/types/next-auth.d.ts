// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import NextAuth, { type DefaultSession } from "next-auth"
import type { HumanRole } from "@/lib/auth/roles"

declare module "next-auth/jwt" {
  interface JWT {
    /** The active role. */
    role?: HumanRole
    /** Every human role of the access token. Absent on cookies issued before multi-role support. */
    roles?: HumanRole[]
    accessToken?: string
    refreshToken?: string
    /** Seconds since the epoch. */
    accessTokenExpiresAt?: number
    htxCode?: string | null
    /** Seconds since the epoch of the user's last sign-in with credentials (Keycloak `auth_time`). */
    authTime?: number
    error?: 'RefreshFailed'
  }
}

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    error?: 'RefreshFailed'
    /** Seconds since the epoch of the user's last sign-in with credentials. */
    authTime?: number
    user: {
      /** The active role. */
      role?: HumanRole
      roles?: HumanRole[]
      htxCode: string | null
    } & DefaultSession["user"]
  }
}
