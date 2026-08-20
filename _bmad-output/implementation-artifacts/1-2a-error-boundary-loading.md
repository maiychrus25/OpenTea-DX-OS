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
4. All three pages use **Tailwind CSS v4 utilities** as primary styling method — no `.module.css` files needed for these simple layout pages
5. `error.tsx` is a `'use client'` component (Next.js 14 App Router requirement)
6. Error is captured with proper error handling (no `console.log` / `console.error` in source files)
7. `npm run build` passes with 0 TypeScript errors after adding these files

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/error.tsx` (AC: 1, 4, 5, 6)
  - [ ] `'use client'` directive at top
  - [ ] Accept `{ error, reset }` props from Next.js
  - [ ] Import `Button` from `@/components/ui` with `variant="primary"`
  - [ ] Style using Tailwind utilities: `bg-background`, `text-foreground`, `min-h-screen`, `flex`, `items-center`, `justify-center`, etc.
  - [ ] Render error message + "Thử lại" button calling `reset()`
  - [ ] Use `useEffect` to log error to a proper error handler (NOT `console.error`)
- [ ] Create `apps/web/src/app/loading.tsx` (AC: 2, 4)
  - [ ] Import `Skeleton` component from `@/components/ui`
  - [ ] Server Component (no `'use client'`)
  - [ ] Full-page skeleton shell using Tailwind utilities
- [ ] Create `apps/web/src/app/not-found.tsx` (AC: 3, 4)
  - [ ] Import `Button` from `@/components/ui` with `variant="text"`
  - [ ] Style using Tailwind utilities
  - [ ] "Không tìm thấy trang" heading + description text
  - [ ] Link to `/` (role-aware redirect handled by middleware)
- [ ] Verify `npm run build` passes (AC: 7)

## Dev Notes

### Architecture Pattern
- `error.tsx` → `not-found.tsx` → `loading.tsx` all live directly in `apps/web/src/app/`
- They apply globally to all routes in the App Router
- `error.tsx` MUST be `'use client'` — this is a Next.js 14 hard requirement
- `loading.tsx` and `not-found.tsx` are Server Components by default

### Styling Rules (Epic 7 compliant — updated from original spec)
- **Primary method:** Tailwind CSS v4 utility classes
- **Design tokens** available as Tailwind colors via `@theme inline` in `globals.css`:
  - `bg-background` → `var(--background)` (#f5f7f3)
  - `bg-card` → `var(--card)` (#ffffff)
  - `text-foreground` → `var(--foreground)` (#19231e)
  - `text-muted-foreground` → `var(--muted-foreground)` (#66736c)
  - `border-border` → `var(--border)` (#dce3dd)
- **No `.module.css` files** for this story — Tailwind is sufficient for these simple pages
- **No inline styles** (`style={{}}`) — zero exceptions per AGENTS.md
- For error color: use `text-red-600` or check if `--danger` token is defined in `globals.css`; if present use `text-[var(--danger)]`

### Button Component (from Story 7-4 — done)
```tsx
import { Button } from '@/components/ui'

// error.tsx — primary CTA:
<Button variant="primary" onClick={reset}>Thử lại</Button>

// not-found.tsx — navigation link:
<Button variant="text" onClick={() => router.push('/')}>Về trang chủ</Button>
```
Note: `variant` prop is required per 7-4 refactor. Default is `'primary'` for backward-compat.

### Skeleton Component
```tsx
import { Skeleton } from '@/components/ui'

// loading.tsx — full-page skeleton shell:
<div className="min-h-screen bg-background p-6">
  <Skeleton className="h-8 w-48 mb-4" />
  <Skeleton className="h-4 w-full mb-2" />
  <Skeleton className="h-4 w-3/4" />
</div>
```

### License Header (bắt buộc — AGENTS.md §License Comment Header)
Every new `.tsx` file MUST start with:
```tsx
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
```

### References
- [Source: apps/web/src/styles/globals.css — CSS custom properties + @theme inline block]
- [Source: apps/web/src/components/ui/Button/Button.tsx — variant prop interface]
- [Source: apps/web/src/components/ui/Skeleton/Skeleton.tsx]
- [Source: _bmad-output/implementation-artifacts/7-4-shared-ui-pill-button.md — Button variant API]
- [Source: _bmad-output/implementation-artifacts/7-1-tailwind-design-token-setup.md — token mapping]

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/error.tsx` (NEW)
- `apps/web/src/app/loading.tsx` (NEW)
- `apps/web/src/app/not-found.tsx` (NEW)
