# Story 1.5c: Sign-Out Flow

Status: ready-for-dev

> ⚠️ **DESIGN UPDATE — 2026-08-14 (Epic 7 sync):**
> Story 7-3 (TopBar refactor) sẽ thêm user avatar placeholder trong TopBar.
> Story 7-2 (Sidebar refactor) thêm user profile button trong `sidebar-foot`.
> **Khuyến nghị:** Implement `UserMenu` logic trong Sidebar-foot (`sidebar-foot .profile` button) thay vì TopBar dropdown — phù hợp với prototype design hơn.
> CSS tokens cần dùng: `var(--card)` (thay `--color-surface-overlay`), `var(--border)` (thay `--color-border-default`), `var(--radius-md)`.
> **Nếu 7-2/7-3 chưa done:** Vẫn có thể implement TopBar dropdown như spec cũ.


## Story

As any authenticated user,
I want to sign out from the application,
so that my session is terminated and no one can access my data on a shared device.

## Acceptance Criteria

1. **Given** any authenticated user is on any page → TopBar avatar click opens dropdown with role label (read-only) and "Đăng xuất" button
2. Clicking "Đăng xuất" calls NextAuth `signOut()` + terminates Keycloak session (OIDC end_session_endpoint)
3. After sign-out → user redirected to `/login`
4. **Given** JWT expires (after 8h) → middleware auto-redirects to `/login`

## Tasks / Subtasks

- [ ] Create `apps/web/src/components/layout/TopBar/UserMenu.tsx` (AC: 1, 2, 3)
  - [ ] `'use client'` directive (needs click handlers + state)
  - [ ] Avatar button: shows initials; click toggles dropdown
  - [ ] Dropdown: role label (read-only) + "Đăng xuất" button
  - [ ] Click outside to close (use `useRef` + `useEffect` click listener)
  - [ ] Sign-out action calls `signOut({ callbackUrl: '/login' })`
- [ ] Create `apps/web/src/components/layout/TopBar/UserMenu.module.css` (AC: 1)
  - [ ] Dropdown positioned `absolute`, right-aligned, `z-index` above content
  - [ ] Uses design tokens: `--color-surface-overlay`, `--color-border-default`, `--rounded-md`
- [ ] Update `apps/web/src/components/layout/TopBar/TopBar.tsx` (AC: 1)
  - [ ] Replace static avatar div with `<UserMenu role={role} userName={userName} />`
  - [ ] Pass `role` prop down from layout
- [ ] Configure Keycloak session termination (AC: 2)
  - [ ] In `auth.ts` → add NextAuth `events.signOut` callback
  - [ ] Call Keycloak logout endpoint: `${KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
- [ ] Verify middleware handles expired JWT (AC: 4)
  - [ ] Existing middleware should handle this — verify no changes needed

## Dev Notes

### Keycloak End-Session Pattern
```typescript
// In auth.ts events handler:
events: {
  async signOut(message) {
    // Clear Keycloak session
    if ('token' in message && message.token?.id_token) {
      const logoutUrl = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
      await fetch(`${logoutUrl}?id_token_hint=${message.token.id_token}&post_logout_redirect_uri=${process.env.NEXTAUTH_URL}/login`)
    }
  }
}
```

### UserMenu Dropdown Pattern
```tsx
// Click outside handler:
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
```

### Project Structure Notes
- `UserMenu` goes in same folder as `TopBar`: `components/layout/TopBar/`
- TopBar currently has a static avatar `<div>` — replace with `<UserMenu />`
- TopBar is currently a Server Component — UserMenu must be imported as a Client Component

### References
- [Source: apps/web/src/components/layout/TopBar/TopBar.tsx — current avatar implementation]
- [Source: apps/web/src/auth.ts — NextAuth config, signOut function]
- [Source: apps/web/src/middleware.ts — JWT expiry handling]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/components/layout/TopBar/UserMenu.tsx` (NEW)
- `apps/web/src/components/layout/TopBar/UserMenu.module.css` (NEW)
- `apps/web/src/components/layout/TopBar/TopBar.tsx` (MODIFY)
- `apps/web/src/auth.ts` (MODIFY)
