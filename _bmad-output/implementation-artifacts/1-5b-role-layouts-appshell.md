# Story 1.5b: Role-Specific Layout Shells with AppShell

Status: ready-for-dev

## Story

As any authenticated user (Manager / Officer / Farmer),
I want to see a consistent navigation shell (sidebar on desktop, bottom nav on mobile) tailored to my role,
so that I can navigate between features without confusion and the interface adapts to my role's needs.

## Acceptance Criteria

1. **Given** a Manager is authenticated and on any `/manager/*` page → `app/manager/layout.tsx` wraps children in `AppShell` with `role="manager"`, `data-role="manager"`, sidebar nav: Tổng quan, Bản tin, Chatbot, Bản đồ đối tác, Vùng trồng, Lô hàng, Hồ sơ HTX
2. **Given** an Officer is authenticated → `app/officer/layout.tsx` wraps with `role="officer"`, sidebar nav: Tổng quan, Vùng trồng, Nhật ký, Chẩn đoán bệnh, Thông báo, Tài liệu
3. **Given** a Farmer is authenticated → `app/farmer/layout.tsx` wraps with `role="farmer"`, BottomNav only (NO sidebar, UX-DR3), nav: Hôm nay, Nhật ký, Chẩn đoán; `data-role="farmer"` triggers 17px body text from globals.css
4. Viewport < 1024px → sidebar hidden, BottomNav shown (for manager/officer); Farmer always BottomNav
5. TopBar displays session user name in avatar
6. All middleware role checks work: `/manager/*` routes require manager role, etc.

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/manager/layout.tsx` (AC: 1, 4, 5)
  - [ ] Server Component; call `auth()` to get session
  - [ ] Instantiate `AppShell` with manager navItems and user info
  - [ ] Define manager navItems array with proper hrefs and icons
- [ ] Create `apps/web/src/app/officer/layout.tsx` (AC: 2, 4, 5)
- [ ] Create `apps/web/src/app/farmer/layout.tsx` (AC: 3, 5)
  - [ ] Pass `hideSidebar={true}` or use role-based logic in AppShell
- [ ] Move `app/(manager)/profile/` → `app/manager/profile/` (AC: 6)
  - [ ] Update all imports referencing the old path
  - [ ] Delete `app/(manager)/` route group entirely
- [ ] Update `AppShell.tsx` to remove dummy `getNavItemsForRole()` (AC: 1, 2, 3)
  - [ ] Accept `navItems: NavItem[]` prop instead of computing internally
  - [ ] Accept `role: string` prop and set `data-role` accordingly
- [ ] Add icons for nav items (AC: 1, 2, 3)
  - [ ] Check if `lucide-react` is in package.json — if not, ASK before adding
  - [ ] Use SVG inline icons if lucide-react not available

## Dev Notes

### Critical Route Fix (Must Do)
```
CURRENT (broken):
  app/(manager)/profile/page.tsx → resolves to /profile (NO /manager prefix)
  middleware checks startsWith('/manager') → BYPASSED for profile page!

AFTER FIX (correct):
  app/manager/profile/page.tsx → resolves to /manager/profile
  middleware check works correctly
```

### Current AppShell State (Read Before Modifying)
```tsx
// AppShell.tsx currently has hardcoded dummy nav:
function getNavItemsForRole(role: string) {
  return [
    { label: 'Tổng quan', href: `/${role}/dashboard`, icon: <span /> },
    { label: 'Hồ sơ', href: '/profile', icon: <span /> },
  ]
}
```
This function should be **removed** — navItems must come from props.

### SessionProvider Dependency
- These layouts are Server Components — they use `auth()` directly (no useSession hook needed)
- Client components within these layouts can use `useSession()` ONLY if SessionProvider is set up (Story 1.5e)
- If 1.5e not done yet: keep everything in Server Components; don't use useSession in children

### CSS Tokens for Responsive Breakpoint
```css
/* In globals.css or media query inline in AppShell.module.css */
@media (max-width: 1024px) { /* hide sidebar, show bottom-nav */ }
```

### Project Structure Notes
- `app/manager/layout.tsx` is a regular folder, not a route group
- Auth check in layout: `const session = await auth(); if (!session) redirect('/login')`
- Role check in layout: `if (session.user.role !== 'manager') redirect('/unauthorized')`

### References
- [Source: apps/web/src/components/layout/AppShell/AppShell.tsx — current implementation]
- [Source: apps/web/src/middleware.ts — role-based routing logic]
- [Source: apps/web/src/auth.ts — auth() function]
- [Source: apps/web/src/components/layout/Sidebar/Sidebar.tsx]
- [Source: apps/web/src/components/layout/TopBar/TopBar.tsx]
- [Source: apps/web/src/components/layout/BottomNav/BottomNav.tsx]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/manager/layout.tsx` (NEW)
- `apps/web/src/app/officer/layout.tsx` (NEW)
- `apps/web/src/app/farmer/layout.tsx` (NEW)
- `apps/web/src/app/manager/profile/page.tsx` (MOVED from `(manager)/profile/`)
- `apps/web/src/app/manager/profile/_components/ProfileForm.tsx` (MOVED)
- `apps/web/src/app/manager/profile/_components/ProfileForm.module.css` (MOVED)
- `apps/web/src/components/layout/AppShell/AppShell.tsx` (MODIFY)
