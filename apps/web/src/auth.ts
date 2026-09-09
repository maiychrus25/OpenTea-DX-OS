// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import NextAuth from "next-auth"
import { logger } from "@/lib/logger"

interface KeycloakProfile {
  realm_access?: {
    roles: string[]
  }
}

// Internal Keycloak URL (container-to-container) dùng cho token/userinfo
const KEYCLOAK_INTERNAL = process.env.KEYCLOAK_INTERNAL_URL || "http://keycloak:8080/realms/agrimarket"
// External Keycloak URL (browser redirect) dùng cho authorization
const KEYCLOAK_EXTERNAL = process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/agrimarket"

export const { handlers, signIn, signOut, auth } = NextAuth({
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
      clientId: process.env.KEYCLOAK_CLIENT_ID || "nextjs-web",
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "agrimarket-secret-key",
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
    async jwt({ token, profile, account }) {
      // Lưu idToken để dùng cho Keycloak logout (xóa SSO session)
      if (account?.id_token) {
        token.idToken = account.id_token
      }

      // CRITICAL: Ghi đè token.sub bằng Keycloak user ID thực
      // NextAuth v5 có thể tự tạo internal sub khác với OIDC sub claim
      // providerAccountId chính là giá trị "sub" từ Keycloak ID token
      if (account?.providerAccountId) {
        token.sub = account.providerAccountId
      }

      if (profile) {
        // Extract role from Keycloak realm_access (UserInfo endpoint)
        const kp = profile as KeycloakProfile;
        if (kp.realm_access && Array.isArray(kp.realm_access.roles)) {
          const roles = kp.realm_access.roles;
          if (roles.includes("manager")) token.role = "manager";
          else if (roles.includes("officer")) token.role = "officer";
          else if (roles.includes("farmer")) token.role = "farmer";
        }
      }
      
      // Fallback: Decode access_token (which usually contains realm_access)
      if (!token.role && account?.access_token) {
        try {
          const decoded = JSON.parse(Buffer.from(account.access_token.split('.')[1], 'base64').toString('utf8'));
          if (decoded.realm_access && Array.isArray(decoded.realm_access.roles)) {
            const roles = decoded.realm_access.roles;
            if (roles.includes("manager")) token.role = "manager";
            else if (roles.includes("officer")) token.role = "officer";
            else if (roles.includes("farmer")) token.role = "farmer";
          }
        } catch (e) {
          logger.error("Failed to decode access token", { error: e });
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.role) {
          session.user.role = token.role as 'manager' | 'officer' | 'farmer';
        }
        if (token.sub) {
          session.user.id = token.sub;
        }
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
        const issuer = process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_ISSUER || "http://keycloak:8080/realms/agrimarket"
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
