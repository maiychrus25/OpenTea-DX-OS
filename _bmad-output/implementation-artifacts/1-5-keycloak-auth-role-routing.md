# Story 1.5: Keycloak Configuration and Authentication Flow

Status: review

## Story

As a developer,
I want Keycloak OIDC integrated with NextAuth.js (v5) and role-based route groups established,
so that users are securely authenticated, their session contains their role, and they are automatically routed to the correct layout (`/manager`, `/officer`, `/farmer`) without being able to access other roles' areas.

## Dependencies
- **Depends on:** 1.4
- **Blocks:** 1.6

## Acceptance Criteria

1. **Given** a user is unauthenticated **When** they visit `/` or any protected route **Then** they are redirected to the Keycloak login page via NextAuth.js.
2. **Given** Keycloak integration **When** a user successfully logs in **Then** NextAuth.js captures their Keycloak `preferred_username`, `email`, and `groups`/`roles` claim.
3. **Given** the NextAuth session **When** `auth()` is called on the server **Then** it returns a session object containing `user.id` (Keycloak sub) and `user.role` (mapped from Keycloak group: 'MANAGER', 'OFFICER', or 'FARMER').
4. **Given** the Next.js `app/` router **When** inspected **Then** it uses route groups: `(manager)`, `(officer)`, and `(farmer)`, each with its own `layout.tsx` that wraps children in the `AppShell` with the correct `navItems`.
5. **Given** the Next.js middleware **When** an authenticated user tries to access a route **Then** the middleware enforces role-based access control (RBAC):
   - `/manager/*` requires `MANAGER` role.
   - `/officer/*` requires `OFFICER` role.
   - `/farmer/*` requires `FARMER` role.
   - Unauthorized access redirects to a generic `/unauthorized` or their default home.
6. **Given** a successful login **When** the user lands on `/` **Then** they are automatically redirected to their role's dashboard (e.g., `/manager/dashboard`, `/officer/dashboard`, `/farmer/today`).
7. **Given** the `AppShell` component (from Story 1.2) **When** rendered in a role's layout **Then** it correctly receives the session's role and renders the role-specific navigation items.

## Tóm tắt Kế hoạch

- [x] Tạo file cấu hình `docker/keycloak/realm-agrimarket.json` với 3 Roles (manager, officer, farmer).
- [x] Sửa `docker-compose.yml` để mount volume cấu hình và kích hoạt cờ import realm lúc khởi động.
- [x] Cài đặt `next-auth@beta` và định nghĩa `auth.ts` sử dụng Keycloak Provider, tích hợp hàm trích xuất role từ token.
- [x] Triển khai Next.js Edge Middleware tại `middleware.ts` để block truy cập trái phép.
- [x] Tạo các trang giao diện cơ bản (Login, Unauthorized, Dashboard 3 roles).

## Tasks / Subtasks

  - [ ] Create `app/api/auth/[...nextauth]/route.ts` using the new v5 handlers.

- [ ] **T2: Middleware & RBAC Routing** (AC: 1, 5, 6)
  - [ ] Create `src/middleware.ts`.
  - [ ] Implement logic:
    - If unauthenticated, redirect to `/api/auth/signin` (or let NextAuth handle it).
    - If authenticated and on `/`, redirect based on `req.auth.user.role`.
    - If authenticated and accessing `/manager/...`, verify role === 'MANAGER'. Else redirect to their default home.
    - Repeat for `/officer/...` and `/farmer/...`.

- [ ] **T3: Route Groups & Role Layouts** (AC: 4, 7)
  - [ ] Create folder structure: `src/app/(manager)/`, `src/app/(officer)/`, `src/app/(farmer)/`.
  - [ ] In `src/app/(manager)/layout.tsx`: import `AppShell` and `auth()`. Render `AppShell` passing manager-specific nav items.
  - [ ] Repeat for `(officer)/layout.tsx` and `(farmer)/layout.tsx`.
  - [ ] Note: The root `app/layout.tsx` remains for the `<html>` and `<body>` tags and global font (from Story 1.2). The route group layouts wrap the `AppShell`.

- [ ] **T4: Navigation Configuration** (AC: 7)
  - [ ] Create a configuration file `src/config/navigation.tsx` (or similar) defining the `navItems` array for each role.
  - [ ] *Manager:* Tổng quan, HTX Của Tôi, Bản Tin Thị Trường, Đối Tác, Vùng Trồng, Quản Lý Mã Lô, Phát Thanh.
  - [ ] *Officer:* Hôm Nay, Vùng Trồng, Nhật Ký Chờ Duyệt, Duyệt Thu Hoạch, Lô Hàng, Báo Cáo Sâu Bệnh, Chatbot Kỹ Thuật.
  - [ ] *Farmer:* Hôm Nay, HTX Của Tôi, Ghi Nhật Ký, Chẩn Đoán Bệnh, Bản Tin.
  - [ ] Use `lucide-react` icons.

- [ ] **T5: Basic Dashboard Stubs** (AC: 6)
  - [ ] Create simple `page.tsx` stubs so the redirects have somewhere to land.
  - [ ] `src/app/(manager)/dashboard/page.tsx`
  - [ ] `src/app/(officer)/dashboard/page.tsx`
  - [ ] `src/app/(farmer)/today/page.tsx`
  - [ ] Create `src/app/unauthorized/page.tsx`.

## Dev Notes

### NextAuth.js v5 Keycloak Profile Mapping

Keycloak returns a specific profile structure. You need to tell NextAuth how to map it, especially the roles.
In `auth.config.ts`:

```typescript
import KeycloakProvider from "next-auth/providers/keycloak"

export const authConfig = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
      profile(profile) {
        // Keycloak's default profile mapping doesn't include roles/groups automatically
        // You usually have to map a claim in Keycloak admin console to add roles to the UserInfo endpoint or Token.
        // Assuming we configure Keycloak to put roles in `realm_access.roles` or `groups`
        
        let userRole = 'FARMER' // Default
        
        // Example check (adjust based on actual Keycloak setup later)
        const roles = profile.realm_access?.roles || profile.groups || []
        if (roles.includes('MANAGER') || roles.includes('manager')) userRole = 'MANAGER'
        else if (roles.includes('OFFICER') || roles.includes('officer')) userRole = 'OFFICER'
        
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username,
          email: profile.email,
          role: userRole,
          // image: ...
        }
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) { // User object is only passed on initial sign in
        token.role = user.role
        token.sub = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string
        session.user.id = token.sub as string
      }
      return session
    }
  }
}
```

### TypeScript Module Augmentation for NextAuth

NextAuth's default `Session.user` type doesn't have `role` or `id`. You MUST augment the module. Create `types/next-auth.d.ts` (or put it in `auth.config.ts` if preferred):

```typescript
// types/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession["user"]
  }
  interface User {
    id: string
    role: string
  }
}
```

### NextAuth v5 Middleware

```typescript
// src/middleware.ts
import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl
  
  // Exclude API routes, static files, trpc, etc. from middleware if needed using matcher below

  if (!isLoggedIn) {
     // If they are trying to access a protected route, redirect to login.
     // NextAuth handles the `/api/auth/signin` redirect automatically if configured, 
     // but you can force it here if you prefer a specific flow.
     // For now, let NextAuth handle it or do:
     // return Response.redirect(new URL("/api/auth/signin", req.nextUrl))
  } else {
      const role = req.auth?.user?.role

      if (pathname === '/') {
          if (role === 'MANAGER') return Response.redirect(new URL('/manager/dashboard', req.nextUrl))
          if (role === 'OFFICER') return Response.redirect(new URL('/officer/dashboard', req.nextUrl))
          return Response.redirect(new URL('/farmer/today', req.nextUrl))
      }

      // RBAC
      if (pathname.startsWith('/manager') && role !== 'MANAGER') {
          return Response.redirect(new URL('/unauthorized', req.nextUrl))
      }
      if (pathname.startsWith('/officer') && role !== 'OFFICER') {
          return Response.redirect(new URL('/unauthorized', req.nextUrl))
      }
      if (pathname.startsWith('/farmer') && role !== 'FARMER') {
          return Response.redirect(new URL('/unauthorized', req.nextUrl))
      }
  }
})

// Optionally configure matcher
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### Client vs Server Auth

- **Server Components:** Use `const session = await auth()` (imported from `@/lib/auth`).
- **Client Components:** NextAuth v5 encourages passing the session down as a prop from a Server Component, OR using `SessionProvider` + `useSession()`. For DX-AgriMarket, prefer Server Components fetching the session and passing the `user` object to Client Components.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/auth.config.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- `apps/web/src/middleware.ts`
- `apps/web/types/next-auth.d.ts`
- `apps/web/src/config/navigation.tsx`
- `apps/web/src/app/(manager)/layout.tsx`
- `apps/web/src/app/(manager)/dashboard/page.tsx`
- `apps/web/src/app/(officer)/layout.tsx`
- `apps/web/src/app/(officer)/dashboard/page.tsx`
- `apps/web/src/app/(farmer)/layout.tsx`
- `apps/web/src/app/(farmer)/today/page.tsx`
- `apps/web/src/app/unauthorized/page.tsx`

**Files to UPDATE:**
- `apps/web/package.json` — add `next-auth@beta` dependency
- `apps/web/tsconfig.json` — ensure `types/next-auth.d.ts` is included in `include` array if necessary.
