import NextAuth from "next-auth"
import Keycloak from "next-auth/providers/keycloak"

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
      if (profile && profile.realm_access && Array.isArray((profile.realm_access as any).roles)) {
        const roles = (profile.realm_access as any).roles;
        if (roles.includes("manager")) token.role = "manager";
        else if (roles.includes("officer")) token.role = "officer";
        else if (roles.includes("farmer")) token.role = "farmer";
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
  }
})
