// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import NextAuth from "next-auth"
import Keycloak from "next-auth/providers/keycloak"

interface KeycloakProfile {
  realm_access?: {
    roles: string[]
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID || "nextjs-web",
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "agrimarket-secret-key",
      issuer: process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/agrimarket",
    })
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const kp = profile as KeycloakProfile;
        if (kp.realm_access && Array.isArray(kp.realm_access.roles)) {
          const roles = kp.realm_access.roles;
          if (roles.includes("manager")) token.role = "manager";
          else if (roles.includes("officer")) token.role = "officer";
          else if (roles.includes("farmer")) token.role = "farmer";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.role) {
        session.user.role = token.role as 'manager' | 'officer' | 'farmer';
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
      if ('token' in message && message.token?.idToken) {
        const issuer = process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/agrimarket"
        const logoutUrl = `${issuer}/protocol/openid-connect/logout`
        const redirectUri = encodeURIComponent(
          `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/login`
        )
        await fetch(`${logoutUrl}?id_token_hint=${message.token.idToken}&post_logout_redirect_uri=${redirectUri}`)
          .catch(() => {}) // best-effort, don't throw if Keycloak is unreachable
      }
    }
  }
})
