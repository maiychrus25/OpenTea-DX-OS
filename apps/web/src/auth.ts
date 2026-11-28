// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import NextAuth from "next-auth"
import { logger } from "@/lib/logger"
import {
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
  KEYCLOAK_INTERNAL,
  endKeycloakSession,
  readAuthTime,
  readHtxCode,
  readRoles,
  refreshAccessToken,
} from "@/lib/auth/token-refresh"
import { defaultActiveRole, heldRoles, rolesFromRealmRoles, validActiveRole } from "@/lib/auth/roles"

interface KeycloakProfile {
  realm_access?: {
    roles: string[]
  }
}

// External Keycloak URL (browser redirect) dùng cho authorization
const KEYCLOAK_EXTERNAL = process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/agrimarket"

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  trustHost: true,
  providers: [
    {
      id: "keycloak",
      name: "Keycloak",
      type: "oauth",
      // issuer = external URL (host.docker.internal:8080)
      // Keycloak được config KC_HOSTNAME để phát JWT với iss = URL này
      // → khớp hoàn toàn, không còn mismatch
      issuer: KEYCLOAK_EXTERNAL,
      checks: ["state"] as any,
      clientId: KEYCLOAK_CLIENT_ID,
      clientSecret: KEYCLOAK_CLIENT_SECRET,
      authorization: {
        url: `${KEYCLOAK_EXTERNAL}/protocol/openid-connect/auth`,
        params: { scope: "openid profile email" }
      },
      // token/userinfo dùng internal URL (container-to-container, nhanh hơn)
      token: `${KEYCLOAK_INTERNAL}/protocol/openid-connect/token`,
      userinfo: `${KEYCLOAK_INTERNAL}/protocol/openid-connect/userinfo`,
      profile(profile: any) {
        return {
          id: profile.sub,
          name: profile.name || profile.preferred_username || "Unknown",
          email: profile.email || `${profile.preferred_username}@agrimarket.local`,
          image: profile.picture || null,
        }
      }
    }
  ],
  callbacks: {
    async jwt({ token, profile, account, trigger, session }) {
      // The id token is not kept: with it the session needs two cookies, and concurrent responses can mix them (#75).
      // Sign-out ends the Keycloak session with the refresh token instead. Older sessions lose it on their next request.
      delete token.idToken

      // CRITICAL: Ghi đè token.sub bằng Keycloak user ID thực
      // NextAuth v5 có thể tự tạo internal sub khác với OIDC sub claim
      // providerAccountId chính là giá trị "sub" từ Keycloak ID token
      if (account?.providerAccountId) {
        token.sub = account.providerAccountId
      }

      // Every human role of the token, and the active one. Keycloak stays the source of truth.
      if (profile) {
        const roles = rolesFromRealmRoles((profile as KeycloakProfile).realm_access?.roles)
        if (roles.length) {
          token.roles = roles
          token.role = defaultActiveRole(roles)
        }
      }

      // Fallback: Decode access_token (which usually contains realm_access)
      if (!token.roles?.length && account?.access_token) {
        try {
          const roles = readRoles(account.access_token)
          token.roles = roles
          token.role = defaultActiveRole(roles)
        } catch (e) {
          logger.error("Failed to decode access token", { error: e });
        }
      }

      // A role switch (server update). Never trust the requested role: it must be one the token holds, and a client can call update() too.
      if (trigger === "update") {
        const held = heldRoles(token)
        const requested = (session as { role?: unknown } | undefined)?.role
        if (typeof requested === "string" && (held as string[]).includes(requested)) token.role = requested as typeof token.role
      }

      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpiresAt = account.expires_at;
        token.htxCode = readHtxCode(account.access_token);
        // The moment of the real sign-in, kept across refreshes: the web asks for a fresh one before it turns autonomous mode on.
        token.authTime = readAuthTime(account.id_token) ?? readAuthTime(account.access_token);
        return token;
      }
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        // Cookies from before multi-role support have only `role`: they hold exactly that role.
        const roles = heldRoles(token)
        session.user.roles = roles
        const role = validActiveRole(token.role, roles)
        if (role) session.user.role = role
        if (token.sub) {
          session.user.id = token.sub;
        }
        session.user.htxCode = token.htxCode ?? null;
      }
      if (token.authTime !== undefined) session.authTime = token.authTime;
      if (token.error) {
        session.error = token.error;
      }
      return session;
    }
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours (yêu cầu từ checklist)
  },
  events: {
    async signOut(message) {
      if ('token' in message && message.token?.refreshToken) {
        await endKeycloakSession(message.token.refreshToken)
      }
    }
  }
})
