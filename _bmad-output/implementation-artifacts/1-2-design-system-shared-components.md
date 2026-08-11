# Story 1.2: Design System — CSS Tokens & Shared UI Components

Status: done

## Story

As a developer,
I want the design token system and shared layout components in place,
so that all feature components reference consistent colors, typography, spacing, and layouts without any ad-hoc styles or duplication.

## Dependencies
- **Depends on:** 1.1
- **Blocks:** 1.3

## Acceptance Criteria

1. **Given** the Next.js app runs **When** any page renders **Then** `src/styles/globals.css` exports all CSS custom properties: primary (#16A34A), primary-hover (#15803D), primary-subtle (#DCFCE7), primary-foreground (#FFF), accent (#EA580C), accent-hover (#C2410C), accent-subtle (#FFF7ED), 4 parcel status colors (`--color-status-sowing/tending/harvest-approved/harvested`), 8 semantic feedback colors (success/warning/danger/info + subtle variants), 5 neutral surface/border/ink tokens, `--color-map-overlay`, `--color-badge-unread`
2. **Given** `globals.css` is loaded **When** Inter font is requested **Then** it is loaded from Google Fonts with `<link rel="preconnect" href="https://fonts.googleapis.com">` and `display=swap`; 9 typography scale variables are set: `--font-size-display` (2rem) through `--font-size-mono` (0.8125rem)
3. **Given** `[data-role="farmer"]` is set on layout root **When** any child text renders **Then** body font size is 1.0625rem (17px) inherited automatically — no per-component font override needed
4. **Given** the `Button` component is used **When** rendered with `variant="primary"` **Then** it shows green fill (#16A34A), 10px border-radius, min 44×44px tap target, hover darkens to #15803D; variants: `primary`, `accent`, `ghost`, `danger`
5. **Given** the `Badge` component is used **When** rendered with status props **Then** it shows the correct closed-set 5 variant styles: `sowing` (green), `tending` (amber), `harvest-approved` (orange), `harvested` (blue), `draft` (gray); pill shape (9999px radius); 12px text; 600 weight
6. **Given** the `Card` component is used **When** rendered **Then** it has white background, 10px border-radius, 1px subtle border, `0 1px 4px rgba(15,23,42,0.06)` shadow, 24px padding (desktop) / 16px (mobile)
7. **Given** the `Modal` component is used **When** it opens **Then** focus is trapped inside the modal; Tab/Shift+Tab cycles through modal interactive elements only; Escape closes; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` set
8. **Given** the `Skeleton` component is used **When** `prefers-reduced-motion: reduce` is set **Then** the pulsing animation is disabled; a static gray block is shown instead
9. **Given** `AppShell.tsx` is the layout **When** viewport is ≥ 1024px **Then** sidebar (240px fixed) + fluid content renders; **When** viewport is < 1024px **Then** bottom navigation replaces sidebar
10. **Given** `Sidebar.tsx` receives `navItems` **When** an item is active **Then** it shows `--color-primary-subtle` background + `--color-primary` text color + 600 font weight
11. **Given** `TopBar.tsx` renders **When** any page loads **Then** it shows: project logo/name, role label, notification bell placeholder (empty, wired in Story 2.7), user avatar
12. **Given** any component file **When** its CSS is inspected **Then** it uses a co-located `.module.css` file; no inline styles; no Tailwind classes; no `style={}` props

## Tasks / Subtasks

- [x] **T1: CSS Design Token System** (AC: 1, 2, 3)
  - [x] Write `src/styles/globals.css` with all 25+ color tokens as CSS custom properties
  - [x] Add 9-level typography scale variables (`--font-size-display` → `--font-size-mono`)
  - [x] Add spacing scale (`--spacing-1` = 4px → `--spacing-16` = 64px; `--spacing-gutter-mobile` = 16px; `--spacing-gutter-desktop` = 24px; `--sidebar-width` = 240px; `--topbar-height` = 56px)
  - [x] Add rounded scale (`--rounded-sm` = 6px; `--rounded-md` = 10px; `--rounded-lg` = 14px; `--rounded-xl` = 20px; `--rounded-full` = 9999px)
  - [x] Add `[data-role="farmer"] { font-size: var(--font-size-body-large); }` rule
  - [x] Add Inter font `@import` from Google Fonts in `globals.css` (preconnect in `app/layout.tsx`)

- [x] **T2: Button Component** (AC: 4)
  - [x] Create `src/components/ui/Button/Button.tsx`
  - [x] Create `src/components/ui/Button/Button.module.css`
  - [x] Create `src/components/ui/Button/index.ts` (re-export)
  - [x] Props: `variant: 'primary' | 'accent' | 'ghost' | 'danger'`, `size?: 'sm' | 'md' | 'lg'`, `disabled?`, `isLoading?`, all native button props
  - [x] `isLoading`: show spinner, disable click, keep width stable (no layout shift)
  - [x] Min tap target: 44×44px enforced via `min-height: 44px; min-width: 44px` in CSS (UX-DR16)
  - [x] Add `data-testid="button-{variant}"` for test selection

- [x] **T3: Badge Component** (AC: 5)
  - [x] Create `src/components/ui/Badge/Badge.tsx` + `.module.css` + `index.ts`
  - [x] Props: `status: 'sowing' | 'tending' | 'harvest-approved' | 'harvested' | 'draft'`
  - [x] ARIA: `role="status"` + `aria-label="Trạng thái: {status-label-vi}"`
  - [x] Vietnamese label map: sowing→"Gieo trồng", tending→"Chăm sóc", harvest-approved→"Chờ thu hoạch", harvested→"Đã thu hoạch", draft→"Nháp"
  - [x] Add `data-testid="badge-{status}"` for test selection

- [x] **T4: Card Component** (AC: 6)
  - [x] Create `src/components/ui/Card/Card.tsx` + `.module.css` + `index.ts`
  - [x] Props: `children`, `className?`, `padding?: 'default' | 'none'`
  - [x] Hover state: border-color darkens to `--color-border-default`; shadow increases to `0 4px 16px rgba(15,23,42,0.10)`
  - [x] No card-in-card nesting — documented in JSDoc comment on component

- [x] **T5: Modal Component** (AC: 7)
  - [x] Create `src/components/ui/Modal/Modal.tsx` + `.module.css` + `index.ts`
  - [x] Implement focus trap using `focus-trap-react` library OR native `inert` attribute approach (check browser support — use polyfill if needed)
  - [x] Props: `isOpen`, `onClose`, `title`, `children`, `size?: 'sm' | 'md' | 'lg'`
  - [x] Backdrop click calls `onClose`; Escape key calls `onClose`
  - [x] `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}` (auto-generated ID)
  - [x] Focus returns to trigger element on close (store ref before open)

- [x] **T6: Skeleton Component** (AC: 8)
  - [x] Create `src/components/ui/Skeleton/Skeleton.tsx` + `.module.css` + `index.ts`
  - [x] Props: `width?`, `height?`, `className?`, `variant?: 'text' | 'rect' | 'circle'`
  - [x] CSS animation: `@keyframes skeleton-pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`
  - [x] `@media (prefers-reduced-motion: reduce)` block disables animation entirely (UX-DR18)
  - [x] Parent container: `aria-busy="true"` + `aria-label="Đang tải..."` — documented in usage comment

- [x] **T7: AppShell Layout** (AC: 9)
  - [x] Create `src/components/layout/AppShell/AppShell.tsx` + `.module.css` + `index.ts`
  - [x] Desktop (≥1024px): CSS Grid `grid-template-columns: var(--sidebar-width) 1fr`
  - [x] Mobile (<1024px): single column; `Sidebar` hidden; `BottomNav` shown
  - [x] `BottomNav.tsx`: renders role-scoped nav items from props; height 64px; 44px tap targets
  - [x] `data-role` attribute is set on `<div>` root of AppShell from session role

- [x] **T8: Sidebar Component** (AC: 10)
  - [x] Create `src/components/layout/Sidebar/Sidebar.tsx` + `.module.css` + `index.ts`
  - [x] Props: `navItems: { label: string; href: string; icon: React.ReactNode; }[]`
  - [x] Uses `usePathname()` from Next.js to determine active state
  - [x] Active item: `background: var(--color-primary-subtle)`, `color: var(--color-primary)`, `font-weight: 600`
  - [x] Icons: use `lucide-react` (install as dependency — open source, tree-shakeable)
  - [x] Item height: 36px; border-radius: `var(--rounded-sm)`

- [x] **T9: TopBar Component** (AC: 11)
  - [x] Create `src/components/layout/TopBar/TopBar.tsx` + `.module.css` + `index.ts`
  - [x] Props: `roleName: string`, `userName: string`, `notificationSlot?: React.ReactNode`
  - [x] Height: `var(--topbar-height)` = 56px
  - [x] Left: DX-AgriMarket logo/wordmark + role label badge
  - [x] Right: notification bell placeholder (`<div data-slot="notification-bell" />`) + user avatar circle (initials)
  - [x] TopBar is a Server Component — notification bell slot filled by Client Component in Stories 2.7+

- [x] **T10: Barrel Exports & Index** (AC: 12)
  - [x] Create `src/components/ui/index.ts` — re-exports all UI components
  - [x] Create `src/components/layout/index.ts` — re-exports AppShell, Sidebar, TopBar, BottomNav
  - [x] Verify all components: no inline styles, no Tailwind, only `.module.css` classes
  - [x] Run `npx tsc --noEmit` to confirm no TypeScript errors across all new files

- [x] **T11: Commit** (all AC)
  - [x] `feat(design-system): add CSS tokens, shared UI components, and layout shells`

## Dev Notes

### Architecture Constraints (MUST FOLLOW)

```
AD-6: CSS Modules only — no Tailwind, no inline styles
AD-18: Feature components in _components/ co-located with page.tsx
        Shared components (used 2+ features) → components/ui/ or components/layout/
AD-3: Server Components by default; add 'use client' only when needed

'use client' is REQUIRED for:
  - Modal (useEffect for focus trap, event listeners)
  - Sidebar (usePathname hook)
  - BottomNav (usePathname hook)
  - Button (onClick event — actually NOT required if using form action; but for general use: add 'use client')
  - Skeleton (no hooks needed — can be Server Component)
  - AppShell (passes role data from session — can be Server Component with Client children)

'use client' NOT required for:
  - Badge (pure render, no hooks)
  - Card (pure render, no hooks)
  - TopBar (if notification slot is a Client Component passed as children)
```

### File Structure to Create

```
src/
  styles/
    globals.css          ← Full token system (T1)
  components/
    ui/
      index.ts           ← Barrel export
      Button/
        Button.tsx
        Button.module.css
        index.ts
      Badge/
        Badge.tsx
        Badge.module.css
        index.ts
      Card/
        Card.tsx
        Card.module.css
        index.ts
      Modal/
        Modal.tsx
        Modal.module.css
        index.ts
      Skeleton/
        Skeleton.tsx
        Skeleton.module.css
        index.ts
    layout/
      index.ts           ← Barrel export
      AppShell/
        AppShell.tsx
        AppShell.module.css
        index.ts
      Sidebar/
        Sidebar.tsx
        Sidebar.module.css
        index.ts
      TopBar/
        TopBar.tsx
        TopBar.module.css
        index.ts
      BottomNav/
        BottomNav.tsx
        BottomNav.module.css
        index.ts
```

### CSS Token Reference (globals.css exact values)

```css
:root {
  /* Primary */
  --color-primary: #16A34A;
  --color-primary-hover: #15803D;
  --color-primary-subtle: #DCFCE7;
  --color-primary-foreground: #FFFFFF;

  /* Accent */
  --color-accent: #EA580C;
  --color-accent-hover: #C2410C;
  --color-accent-subtle: #FFF7ED;
  --color-accent-foreground: #FFFFFF;

  /* Parcel Status (CLOSED SET — do not use for other purposes) */
  --color-status-sowing: #16A34A;
  --color-status-tending: #CA8A04;
  --color-status-harvest-approved: #EA580C;
  --color-status-harvested: #2563EB;
  --color-status-draft: #6B7280;

  /* Semantic Feedback */
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --color-info: #2563EB;
  --color-success-subtle: #DCFCE7;
  --color-warning-subtle: #FEF3C7;
  --color-danger-subtle: #FEE2E2;
  --color-info-subtle: #DBEAFE;

  /* Neutral Surfaces */
  --color-surface-page: #F8FAFC;
  --color-surface-card: #FFFFFF;
  --color-surface-sunken: #F1F5F9;
  --color-surface-overlay: #FFFFFF;

  /* Borders */
  --color-border-subtle: #E2E8F0;
  --color-border-default: #CBD5E1;
  --color-border-focus: #16A34A;

  /* Text */
  --color-ink-primary: #0F172A;
  --color-ink-secondary: #475569;
  --color-ink-tertiary: #94A3B8;
  --color-ink-inverse: #FFFFFF;

  /* Special */
  --color-map-overlay: rgba(15, 23, 42, 0.55);
  --color-badge-unread: #DC2626;

  /* Typography Scale */
  --font-size-display: 2rem;        /* 32px */
  --font-size-h1: 1.5rem;           /* 24px */
  --font-size-h2: 1.25rem;          /* 20px */
  --font-size-h3: 1rem;             /* 16px */
  --font-size-body: 0.9375rem;      /* 15px */
  --font-size-body-large: 1.0625rem;/* 17px — farmer role */
  --font-size-label: 0.875rem;      /* 14px */
  --font-size-meta: 0.75rem;        /* 12px */
  --font-size-mono: 0.8125rem;      /* 13px */

  --font-family-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing Scale (4px base unit) */
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-10: 40px;
  --spacing-12: 48px;
  --spacing-16: 64px;
  --spacing-gutter-mobile: 16px;
  --spacing-gutter-desktop: 24px;
  --sidebar-width: 240px;
  --topbar-height: 56px;

  /* Border Radius */
  --rounded-sm: 6px;
  --rounded-md: 10px;
  --rounded-lg: 14px;
  --rounded-xl: 20px;
  --rounded-full: 9999px;
}

/* Farmer role typography override */
[data-role="farmer"] {
  font-size: var(--font-size-body-large);
}
```

### Inter Font Setup in `app/layout.tsx`

```tsx
// app/layout.tsx — Root layout
import { Inter } from 'next/font/google'
import '../styles/globals.css'

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-inter',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body style={{ fontFamily: 'var(--font-family-sans)' }}>
        {children}
      </body>
    </html>
  )
}
```

**Note:** Use `next/font/google` (built-in Next.js font optimization) instead of a raw Google Fonts `<link>`. This downloads fonts at build time, avoiding runtime requests to Google servers. Set `subsets: ['latin', 'vietnamese']` to include full Vietnamese character set.

### Focus Trap for Modal

Recommended approach — use `focus-trap-react` (MIT license):
```bash
npm install focus-trap-react
```
```tsx
import FocusTrap from 'focus-trap-react'
// ...
<FocusTrap active={isOpen}>
  <div role="dialog" aria-modal="true" aria-labelledby={titleId}>
    {/* modal content */}
  </div>
</FocusTrap>
```
If adding a new npm package is blocked by project policy — flag it and use a manual focus trap implementation instead (document the choice in completion notes).

### lucide-react for Icons

```bash
npm install lucide-react
```
Use in Sidebar for nav icons (Home, Map, BookOpen, QrCode, Bell, ChevronRight, etc.). Tree-shakeable — only imported icons are bundled.

### AppShell Role-Based Layout

```tsx
// AppShell.tsx (Server Component)
import { auth } from '@/lib/auth'  // NextAuth.js v5 server-side

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const role = session?.user?.role ?? 'farmer'

  return (
    <div className={styles.shell} data-role={role}>
      <Sidebar navItems={navItemsForRole(role)} />
      <main className={styles.content}>
        <TopBar roleName={roleLabel(role)} userName={session?.user?.name ?? ''} />
        {children}
      </main>
      {/* BottomNav rendered client-side for mobile */}
    </div>
  )
}
```

`navItemsForRole()` is a pure function that returns role-scoped nav config — no auth logic inside Sidebar/BottomNav components.

### Previous Story Intelligence (Story 1.1)

Story 1.1 created:
- `apps/web/src/styles/globals.css` — **STUB ONLY** (this story fills it with actual tokens)
- `apps/web/src/app/layout.tsx` — has Inter font import (verify it used `next/font/google` not raw link; update if not)
- `apps/web/tsconfig.json` — has `@/*` alias pointing to `./src/*`
- `apps/web/next.config.js` — standalone output
- DO NOT recreate these files from scratch — UPDATE them

### Regression Prevention

This story modifies `globals.css` and `layout.tsx` which are shared by ALL pages.

**Before touching `layout.tsx`:** Read its current content to understand what Story 1.1 already wrote.
**Before touching `globals.css`:** Story 1.1 wrote a stub — check what's there and extend, don't replace.

### References

- [Source: DESIGN.md#Colors] — Exact hex values for all tokens
- [Source: DESIGN.md#Typography] — Font scale rationale
- [Source: DESIGN.md#Components] — Component visual specs
- [Source: EXPERIENCE.md#Foundation] — Role differentiation patterns
- [Source: EXPERIENCE.md#Accessibility-Floor] — ARIA + tap target requirements
- [Source: ARCHITECTURE-SPINE.md#AD-6] — CSS Modules rule
- [Source: ARCHITECTURE-SPINE.md#AD-18] — Component folder structure

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE (new):**
- `src/components/ui/Button/Button.tsx` + `Button.module.css` + `index.ts`
- `src/components/ui/Badge/Badge.tsx` + `Badge.module.css` + `index.ts`
- `src/components/ui/Card/Card.tsx` + `Card.module.css` + `index.ts`
- `src/components/ui/Modal/Modal.tsx` + `Modal.module.css` + `index.ts`
- `src/components/ui/Skeleton/Skeleton.tsx` + `Skeleton.module.css` + `index.ts`
- `src/components/ui/index.ts`
- `src/components/layout/AppShell/AppShell.tsx` + `AppShell.module.css` + `index.ts`
- `src/components/layout/Sidebar/Sidebar.tsx` + `Sidebar.module.css` + `index.ts`
- `src/components/layout/TopBar/TopBar.tsx` + `TopBar.module.css` + `index.ts`
- `src/components/layout/BottomNav/BottomNav.tsx` + `BottomNav.module.css` + `index.ts`
- `src/components/layout/index.ts`

**Files to UPDATE (existing from Story 1.1):**
- `src/styles/globals.css` — replace stub with full token system
- `src/app/layout.tsx` — ensure `next/font/google` pattern; add `data-role` mechanism
- `package.json` — add `focus-trap-react`, `lucide-react` dependencies
### Review Findings
- [x] [Review][Decision] Skeleton component retains inline styles — Should we allow dynamic inline styles for Skeleton width/height, or refactor to use CSS custom properties?
- [x] [Review][Patch] Modal Escape key behavior broken [Modal.tsx:430]
- [x] [Review][Patch] Sidebar & BottomNav active styling missing on SSR [Sidebar.tsx:205]
- [x] [Review][Patch] Skeleton CSS Dimension Type Blindness [Skeleton.tsx]
- [x] [Review][Patch] Destructive aria-label Loading Override [Button.tsx]
- [x] [Review][Patch] Empty Heading Element Semantic Violation [Modal.tsx]
- [x] [Review][Patch] Fragile Modal Viewport Height Calculation [Modal.module.css]
- [x] [Review][Patch] Farmer role typography CSS deviates from spec [globals.css:522]
- [x] [Review][Defer] Hardcoded Locale Strings in Primitives [Modal.tsx] — deferred, pre-existing
- [x] [Review][Defer] Duplicate Navigation DOM Accessibility Risk [BottomNav.tsx] — deferred, pre-existing
