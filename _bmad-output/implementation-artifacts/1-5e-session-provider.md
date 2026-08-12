# Story 1.5e: NextAuth SessionProvider for Client Components

Status: ready-for-dev

## Story

As a developer building client components that need auth context,
I want a `SessionProvider` wrapper in the root layout and proper TypeScript types for the session,
so that client components can access `user.role` via `useSession()` without `any` casts.

## Acceptance Criteria

1. **Given** the root layout renders → `Providers` component wraps children with `SessionProvider` from `next-auth/react`
2. `JWT` type in `next-auth.d.ts` is augmented with `role: 'manager' | 'officer' | 'farmer'`
3. No `any` casts remain in `auth.ts` or `middleware.ts`
4. Any client component calling `useSession()` receives `session.user.role` with full TypeScript type
5. `providers.tsx` is a `'use client'` component

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/providers.tsx` (AC: 1, 5)
  - [ ] `'use client'` directive
  - [ ] Wrap `{children}` with `<SessionProvider>`
- [ ] Update `apps/web/src/app/layout.tsx` (AC: 1)
  - [ ] Import `Providers` from `./providers`
  - [ ] Wrap `{children}` with `<Providers>`
- [ ] Update `apps/web/src/types/next-auth.d.ts` (AC: 2, 3, 4)
  - [ ] Add `JWT` interface augmentation with `role` field
  - [ ] `Session.user.role` already augmented — verify it's typed not `string` but union
- [ ] Remove `any` casts from `apps/web/src/auth.ts` (AC: 3)
  - [ ] `(profile.realm_access as any).roles` → use proper typed access
- [ ] Remove `any` casts from `apps/web/src/middleware.ts` (AC: 3)
  - [ ] `(req.auth?.user as any)?.role` → use `req.auth?.user?.role`

## Dev Notes

### Providers Pattern
```tsx
// apps/web/src/app/providers.tsx
'use client'
import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

### TypeScript Fix for auth.ts
```typescript
// Current (broken):
const roles = (profile.realm_access as any).roles as string[]

// Correct:
interface KeycloakProfile {
  realm_access?: { roles: string[] }
}
const keycloakProfile = profile as KeycloakProfile
const roles = keycloakProfile.realm_access?.roles ?? []
```

### JWT Type Augmentation
```typescript
// next-auth.d.ts — add JWT section:
declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'manager' | 'officer' | 'farmer'
  }
}
```

### Project Structure Notes
- `providers.tsx` goes directly in `app/` directory
- `layout.tsx` already exists — only wrap children, don't restructure
- Do NOT remove existing font setup or metadata from layout.tsx

### References
- [Source: apps/web/src/auth.ts — current any casts at lines 14, 24]
- [Source: apps/web/src/middleware.ts — current any cast]
- [Source: apps/web/src/types/next-auth.d.ts — current Session augmentation]
- [Source: apps/web/src/app/layout.tsx — current root layout]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/providers.tsx` (NEW)
- `apps/web/src/app/layout.tsx` (MODIFY)
- `apps/web/src/types/next-auth.d.ts` (MODIFY)
- `apps/web/src/auth.ts` (MODIFY)
- `apps/web/src/middleware.ts` (MODIFY)
