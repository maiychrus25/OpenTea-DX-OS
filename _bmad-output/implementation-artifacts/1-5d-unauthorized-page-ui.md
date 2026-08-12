# Story 1.5d: Unauthorized Page — Proper Design

Status: ready-for-dev

## Story

As a user who navigates to a page they don't have permission to access,
I want to see a clear, well-designed error page,
so that I understand why I can't access the page and know how to proceed.

## Acceptance Criteria

1. **Given** a user is redirected to `/unauthorized` → page renders with CSS Modules (NO inline styles)
2. Warning icon + "403 — Không có quyền truy cập" heading using design system typography tokens
3. Descriptive message: "Bạn không có quyền truy cập trang này."
4. `Button` (variant: primary) links back to user's role-appropriate dashboard
5. Page is centered and responsive

## Tasks / Subtasks

- [ ] Rewrite `apps/web/src/app/unauthorized/page.tsx` (AC: 1, 2, 3, 4, 5)
  - [ ] Remove ALL inline `style={{}}` (currently entire page uses inline styles)
  - [ ] Import `Card`, `Button` from `@/components/ui`
  - [ ] Import `Unauthorized.module.css`
  - [ ] Add warning icon (SVG inline or lucide-react if available)
  - [ ] "403 — Không có quyền truy cập" heading
  - [ ] Button links to `/` (root — middleware redirects to role dashboard)
- [ ] Create `apps/web/src/app/unauthorized/Unauthorized.module.css` (AC: 1, 5)
  - [ ] Centered layout, responsive card
  - [ ] Use design tokens for colors and spacing

## Dev Notes

### Current State (Read Before Implementing)
The current `unauthorized/page.tsx` is entirely built with inline styles:
```tsx
// CURRENT — violates AD-6:
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
  <div style={{ textAlign: 'center', padding: '2rem' }}>
```
This entire file must be rewritten.

### Role-Aware Dashboard Link
Since this is a Server Component and can read session:
```tsx
import { auth } from '@/auth'
const session = await auth()
const dashboardHref = session?.user?.role ? `/${session.user.role}/dashboard` : '/'
```

### Project Structure Notes
- Unauthorized page is at `app/unauthorized/page.tsx` — top-level route `/unauthorized`
- It's NOT inside any role route group, so it has no layout shell by default (good — no sidebar on 403 page)

### References
- [Source: apps/web/src/app/unauthorized/page.tsx — current inline-style implementation]
- [Source: apps/web/src/components/ui/Button/Button.tsx]
- [Source: apps/web/src/components/ui/Card/Card.tsx]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/unauthorized/page.tsx` (MODIFY)
- `apps/web/src/app/unauthorized/Unauthorized.module.css` (NEW)
