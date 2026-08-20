# Story 1.5c: Sign-Out Flow

Status: ready-for-dev

> ✅ **CONFLICT RESOLVED — 2026-08-21 (Post Epic 7 sync):**
> Story ban đầu yêu cầu tạo `TopBar/UserMenu.tsx` dropdown — **đã bị xóa bỏ**.
> **Lý do:** TopBar hiện là Server Component (7-3 done). Sidebar (7-2 done) đã có `.profile` button sẵn ở `sidebar-foot` nhưng `onClick` đang trống.
> **Hướng mới:** Gắn sign-out vào `.profile` button trong `Sidebar.tsx` + tạo shared `signout-action.ts` Server Action.
> **Ảnh hưởng Epic 8:** Story 8-8 (Profile page) sẽ dùng chung `signout-action.ts` — không conflict.
> CSS tokens: `var(--card)` (thay `--color-surface-overlay`), `var(--border)`, `var(--radius-md)`.


## Story

As any authenticated user,
I want to sign out from the application,
so that my session is terminated and no one can access my data on a shared device.

## Acceptance Criteria

1. **Given** any authenticated user is on any page → Click vào `.profile` button trong Sidebar-foot opens popup nhỏ với role label (read-only) và hai action: "Hồ sơ tài khoản" (link) + "Đăng xuất" button
2. Clicking "Đăng xuất" calls NextAuth `signOut()` + terminates Keycloak session (OIDC end_session_endpoint)
3. After sign-out → user redirected to `/login`
4. **Given** JWT expires (after 8h) → middleware auto-redirects to `/login` *(đã pass — middleware hiện tại xử lý đúng, không cần thay đổi)*

## Tasks / Subtasks

- [ ] Thêm `events.signOut` vào `apps/web/src/auth.ts` (AC: 2)
  - [ ] Trong callback `events`, gọi Keycloak `end_session_endpoint` với `id_token_hint`
  - [ ] Dùng `process.env.KEYCLOAK_ISSUER` + `process.env.NEXTAUTH_URL`
  - [ ] Best-effort: `.catch(() => {})` — không throw nếu Keycloak down
- [ ] Create `apps/web/src/app/actions/signout-action.ts` (AC: 2, 3) [NEW]
  - [ ] `'use server'` directive
  - [ ] Export `async function signOutAction()` gọi `signOut({ redirectTo: '/login' })` từ `@/auth`
- [ ] Modify `apps/web/src/components/layout/Sidebar/Sidebar.tsx` (AC: 1, 2, 3)
  - [ ] Import `signOutAction` từ `@/app/actions/signout-action`
  - [ ] Thêm state `profileOpen: boolean` (dùng `useState`)
  - [ ] Gắn `onClick={() => setProfileOpen(prev => !prev)}` vào `<button className={styles.profile}>`
  - [ ] Thêm click-outside handler dùng `useRef` + `useEffect`
  - [ ] Render popup `<div>` khi `profileOpen === true`:
    - Role label (read-only)
    - Link "Hồ sơ tài khoản" → `/${role}/profile`
    - Button "Đăng xuất" → gọi `signOutAction()` via `startTransition` + `useTransition`
- [ ] Modify `apps/web/src/components/layout/Sidebar/Sidebar.module.css` (AC: 1)
  - [ ] `.profileWrapper`: `position: relative` (wrap button + popup)
  - [ ] `.profilePopup`: `position: absolute; bottom: calc(100% + 8px); left: 0; right: 0;`
  - [ ] Background `var(--card)` (dark context: fallback `#1f4d38`), border `var(--border)`, border-radius `var(--radius-md)`, `box-shadow: var(--shadow-md)`
  - [ ] `.profilePopupLink`: hover state, padding, text màu `#fff`
  - [ ] `.signOutBtn`: color `#ef4444` (red), hover `#dc2626`
- [ ] Verify middleware handles expired JWT (AC: 4)
  - [ ] ✅ Đã pass — `middleware.ts` line 23-27 handle đúng — không cần thay đổi

## Dev Notes

### Keycloak End-Session Pattern (auth.ts)

```typescript
// THÊM vào NextAuth({...}) config object:
events: {
  async signOut(message) {
    if ('token' in message && message.token?.idToken) {
      const issuer = process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/agrimarket"
      const logoutUrl = `${issuer}/protocol/openid-connect/logout`
      const redirectUri = encodeURIComponent(
        `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/login`
      )
      await fetch(`${logoutUrl}?id_token_hint=${message.token.idToken}&post_logout_redirect_uri=${redirectUri}`)
        .catch(() => {}) // best-effort
    }
  }
}
```

> **NextAuth v5 note:** `id_token` được lưu dưới key `idToken` (camelCase) trong token object.

### Server Action Pattern

```typescript
// apps/web/src/app/actions/signout-action.ts
'use server'
import { signOut } from '@/auth'

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
```

### Sidebar Profile Popup Pattern

```tsx
// Thêm vào Sidebar.tsx — wrapper quanh profile button:
const [profileOpen, setProfileOpen] = useState(false)
const [isPending, startTransition] = useTransition()
const profileRef = useRef<HTMLDivElement>(null)

// Click-outside:
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
      setProfileOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])

// JSX (wrap profile button):
<div className={styles.profileWrapper} ref={profileRef}>
  {profileOpen && (
    <div className={styles.profilePopup}>
      <div className={styles.roleLabel}>ĐĂNG NHẬP VỚI VAI TRÒ: {getRoleLabel(role)}</div>
      <Link href={`/${role}/profile`} className={styles.profilePopupLink} onClick={() => setProfileOpen(false)}>
        Hồ sơ tài khoản
      </Link>
      <button
        className={styles.signOutBtn}
        disabled={isPending}
        onClick={() => startTransition(async () => { await signOutAction() })}
      >
        {isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
      </button>
    </div>
  )}
  <button className={styles.profile} onClick={() => setProfileOpen(prev => !prev)}>
    {/* ...existing avatar content... */}
  </button>
</div>
```

### DO NOT

- KHÔNG tạo `TopBar/UserMenu.tsx` (đã bị xóa khỏi scope)
- KHÔNG thêm `'use client'` vào `TopBar.tsx`
- KHÔNG thay đổi `middleware.ts` (AC-4 pass sẵn)
- KHÔNG thay đổi `SidebarProps` interface — popup xây dựng từ `role` prop sẵn có

### Project Structure Notes

- `signout-action.ts` đặt trong `app/actions/` — folder có thể cần tạo mới nếu chưa có
- Sidebar đã là `'use client'` → không cần thêm directive
- `useTransition` để disable button trong lúc sign-out pending (UX)
- Story 8-8 (Profile page) cũng sẽ import `signOutAction` từ cùng file — **shared, không duplicate**

### References

- [Sidebar.tsx](file:///d:/MNM/OpenTea-DX-OS/apps/web/src/components/layout/Sidebar/Sidebar.tsx) — `.profile` button line 111–118
- [auth.ts](file:///d:/MNM/OpenTea-DX-OS/apps/web/src/auth.ts) — events section cần thêm
- [middleware.ts](file:///d:/MNM/OpenTea-DX-OS/apps/web/src/middleware.ts) — JWT expiry đã handled

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

### Completion Notes List

### File List

- `apps/web/src/auth.ts` (MODIFY — thêm events.signOut)
- `apps/web/src/app/actions/signout-action.ts` (NEW)
- `apps/web/src/components/layout/Sidebar/Sidebar.tsx` (MODIFY — gắn popup + signout)
- `apps/web/src/components/layout/Sidebar/Sidebar.module.css` (MODIFY — style popup)
