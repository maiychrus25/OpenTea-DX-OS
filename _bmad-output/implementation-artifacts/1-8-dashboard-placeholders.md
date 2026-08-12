# Story 1.8: Dashboard Placeholder Pages for All Roles

Status: ready-for-dev

## Story

As any authenticated user (Manager / Officer / Farmer),
I want to land on my role-specific dashboard after login,
so that I have a clear starting point for navigation even before the full dashboard features are built in Epic 5.

## Acceptance Criteria

1. **Given** Manager is authenticated → `/manager/dashboard` renders: role label "Trưởng HTX", list of available features as navigation links, "Tính năng đang phát triển" placeholder for upcoming sections
2. **Given** Officer is authenticated → `/officer/dashboard` renders similarly for officer role
3. **Given** Farmer is authenticated → `/farmer/dashboard` renders in single-column layout (UX-DR3)
4. All pages wrapped in AppShell (depends on Story 1.5b)
5. All pages use CSS Modules (no inline styles)
6. Middleware protects each dashboard: manager can't access `/officer/dashboard`

## Tasks / Subtasks

- [ ] Create/update `apps/web/src/app/manager/dashboard/page.tsx` (AC: 1, 4, 5)
  - [ ] Server Component; check session via `auth()`
  - [ ] Import `Dashboard.module.css`
  - [ ] Display: role badge, available feature links (Hồ sơ HTX → `/manager/profile`), upcoming section placeholders
- [ ] Create `apps/web/src/app/manager/dashboard/Dashboard.module.css` (AC: 5)
- [ ] Create/update `apps/web/src/app/officer/dashboard/page.tsx` (AC: 2, 4, 5)
  - [ ] Available links: Vùng trồng, Nhật ký (will be built in Epic 3)
- [ ] Create `apps/web/src/app/officer/dashboard/Dashboard.module.css` (AC: 5)
- [ ] Create/update `apps/web/src/app/farmer/dashboard/page.tsx` (AC: 3, 4, 5)
  - [ ] Single-column layout; `data-role="farmer"` on parent div
- [ ] Create `apps/web/src/app/farmer/dashboard/Dashboard.module.css` (AC: 5)

## Dev Notes

### Placeholder vs Full Dashboard
Epic 5 (Story 5.1) will replace these placeholder pages with the real Today Dashboard. This story creates the minimal viable page to avoid a blank landing.

### Pattern per Page
```tsx
// Each dashboard page:
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import styles from './Dashboard.module.css'

export default async function ManagerDashboard() {
  const session = await auth()
  if (!session) redirect('/login')
  
  return (
    <main className={styles.container}>
      <h1 className={styles.heading}>Tổng quan — Trưởng HTX</h1>
      {/* Feature links, placeholders */}
    </main>
  )
}
```

### CSS Tokens
- Use `--color-ink-primary`, `--font-size-heading-1`, `--spacing-*` from globals.css
- DO NOT use Tailwind classes or inline styles

### Project Structure Notes
- Layouts handle auth via Story 1.5b — dashboards should NOT re-check auth (layout handles it)
- However, if 1.5b not yet done: add auth check in each page as fallback

### References
- [Source: apps/web/src/app/manager/dashboard/ — existing placeholder]
- [Source: apps/web/src/app/officer/dashboard/ — existing placeholder]
- [Source: apps/web/src/app/farmer/dashboard/ — existing placeholder]
- [Source: apps/web/src/app/globals.css — CSS tokens]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/manager/dashboard/page.tsx` (MODIFY)
- `apps/web/src/app/manager/dashboard/Dashboard.module.css` (NEW)
- `apps/web/src/app/officer/dashboard/page.tsx` (MODIFY)
- `apps/web/src/app/officer/dashboard/Dashboard.module.css` (NEW)
- `apps/web/src/app/farmer/dashboard/page.tsx` (MODIFY)
- `apps/web/src/app/farmer/dashboard/Dashboard.module.css` (NEW)
