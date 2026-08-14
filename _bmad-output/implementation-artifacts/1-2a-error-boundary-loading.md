# Story 1.2a: Global Error Boundary, Loading & Not Found Pages

Status: ready-for-dev

## Story

As any user (Manager / Officer / Farmer),
I want consistent error, loading, and not-found experiences across the entire app,
so that unexpected situations are handled gracefully without breaking the user experience.

## Acceptance Criteria

1. **Given** a runtime error occurs in any page → `app/error.tsx` renders user-friendly error page with "Thử lại" button using Button component from design system; no `console.error` present
2. **Given** a Suspense boundary triggers during page loading → `app/loading.tsx` renders Skeleton component per UX-DR15 (no raw spinners)
3. **Given** a URL doesn't match any route → `app/not-found.tsx` renders "Không tìm thấy trang" (404) with role-aware dashboard link
4. All three pages use CSS Modules only — zero inline styles
5. `error.tsx` is a `'use client'` component (Next.js 14 App Router requirement)
6. Error is captured with proper error handling (no `console.log` / `console.error` in source files)

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/error.tsx` (AC: 1, 4, 5, 6)
  - [ ] `'use client'` directive at top
  - [ ] Accept `{ error, reset }` props from Next.js
  - [ ] Import `Button` from `@/components/ui`
  - [ ] Import `error.module.css` (no inline styles)
  - [ ] Render error message + "Thử lại" button calling `reset()`
- [ ] Create `apps/web/src/app/error.module.css` (AC: 4)
  - [ ] Use CSS custom properties from globals.css (Epic 7): `var(--danger)`, `var(--foreground)`, `var(--card)`
- [ ] Create `apps/web/src/app/loading.tsx` (AC: 2, 4)
  - [ ] Import `Skeleton` component from `@/components/ui`
  - [ ] Server Component (no `'use client'`)
- [ ] Create `apps/web/src/app/not-found.tsx` (AC: 3, 4)
  - [ ] Import `Button` from `@/components/ui`
  - [ ] Import `not-found.module.css`
  - [ ] "Không tìm thấy trang" heading + description
  - [ ] Link to dashboard (use `/` redirect — role-aware redirect in middleware)
- [ ] Create `apps/web/src/app/not-found.module.css` (AC: 4)

## Dev Notes

### Architecture Pattern
- `error.tsx` → `not-found.tsx` → `loading.tsx` all live directly in `apps/web/src/app/`
- They apply globally to all routes in the App Router
- `error.tsx` MUST be `'use client'` — this is a Next.js 14 hard requirement
- `loading.tsx` and `not-found.tsx` are Server Components by default

### Project Structure Notes
- CSS custom properties: use tokens from `apps/web/src/app/globals.css` (Epic 7 updated)
  - USE: `var(--border)`, `var(--foreground)`, `var(--muted)`, `var(--card)`
- Shared UI components: import from `@/components/ui` (Button from 7-4, Skeleton)

### References
- [Source: docs/project-context.md — Design System section]
- [Source: apps/web/src/app/globals.css — CSS custom properties]
- [Source: apps/web/src/components/ui/Button/Button.tsx]
- [Source: apps/web/src/components/ui/Skeleton/Skeleton.tsx]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/error.tsx`
- `apps/web/src/app/error.module.css`
- `apps/web/src/app/loading.tsx`
- `apps/web/src/app/not-found.tsx`
- `apps/web/src/app/not-found.module.css`
