# Story 7.1: Tailwind CSS v4 Setup & Design Token Consolidation

Status: backlog

## Story

As a developer working on the DX-AgriMarket frontend,
I want Tailwind CSS v4 installed and the design tokens from the approved prototype UI merged into globals.css,
so that all subsequent UI migration stories can use the correct design system foundation.

## Acceptance Criteria

1. **Given** the project runs `npm install` → `tailwindcss@^4`, `tw-animate-css`, `@tailwindcss/postcss`, `postcss` are present in `package.json`
2. `apps/web/postcss.config.mjs` exists and configures `@tailwindcss/postcss`
3. `apps/web/src/styles/globals.css` starts with `@import 'tailwindcss'` and `@import 'tw-animate-css'`
4. `@theme inline` block in globals.css maps Tailwind color tokens to CSS custom properties
5. **Prototype color tokens** are present in `:root`: `--background: #f5f7f3`, `--primary: #176c4b`, `--accent-lime: #d6f05c`, `--sidebar-bg: #143c2d`, `--border: #dce3dd`
6. **Backward-compat aliases** exist: `--color-primary` aliases to `var(--primary)` so existing CSS Modules continue to work
7. Be Vietnam Pro font imported in `apps/web/src/app/layout.tsx` via `next/font/google`; CSS variable `--font-be-vietnam` applied to `<html>`
8. `npm run build` passes with 0 TypeScript errors after changes
9. Existing Login page renders correctly (no visual regression introduced by token rename)

## Tasks / Subtasks

- [ ] Install Tailwind v4 dependencies (AC: 1)
  - Add to `package.json`: `tailwindcss@^4.3.3`, `tw-animate-css@^1.4.0`, `@tailwindcss/postcss@^4.3.3`, `postcss@^8.5`
- [ ] Create `apps/web/postcss.config.mjs` (AC: 2)
  - Export config with `@tailwindcss/postcss` plugin
- [ ] Rewrite `apps/web/src/styles/globals.css` (AC: 3, 4, 5, 6)
  - Add `@import 'tailwindcss'` at top
  - Add `@import 'tw-animate-css'`
  - Add `@theme inline` block mapping CSS vars to Tailwind colors/radii/fonts
  - Merge prototype tokens into `:root` (see Dev Notes for full token list)
  - Add backward-compat aliases for old `--color-*` tokens
  - Keep existing semantic tokens (status colors, shadows, spacing scale)
- [ ] Update `apps/web/src/app/layout.tsx` (AC: 7)
  - Import `Be_Vietnam_Pro` from `next/font/google`
  - Apply `beVietnam.variable` to `<html>` className
  - Set `--font-be-vietnam` in `@theme inline`
- [ ] Verify build passes (AC: 8)
  - Run `npm run build` — fix any TypeScript/PostCSS errors
- [ ] Visual check login page (AC: 9)
  - Confirm existing `.module.css` token references still resolve correctly

## Dev Notes

### Why This Story Exists
The project currently uses `Inter` font + `--color-primary: #16A34A` (green-500) and CSS Modules only.
The approved prototype uses `Be Vietnam Pro` + `--primary: #176c4b` (darker forest green) + Tailwind v4.
This story unifies both systems before any visual components are touched.

### New tokens to ADD to `:root` (from prototype globals.css)

```css
/* Prototype tokens — ADD these */
--background:         #f5f7f3;
--foreground:         #19231e;
--card:               #ffffff;
--primary:            #176c4b;
--primary-foreground: #ffffff;
--accent-lime:        #d6f05c;
--secondary:          #e7f0ea;
--muted:              #eef1ed;
--muted-foreground:   #66736c;
--border:             #dce3dd;
--sidebar-bg:         #143c2d;
--sidebar-darker:     #0d3023;

/* Backward-compat aliases — KEEP old names pointing to new values */
--color-primary:      var(--primary);
--color-primary-hover: #125c3f;
--color-primary-subtle: var(--secondary);
--color-surface-page: var(--background);
--color-surface-card: var(--card);
--color-border-default: var(--border);
--color-ink-primary:  var(--foreground);
```

### `@theme inline` block structure

```css
@theme inline {
  --font-sans: var(--font-be-vietnam);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-card: var(--card);
  --radius-sm: .5rem;
  --radius-md: .75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.25rem;
}
```

### Be Vietnam Pro font setup

```tsx
// apps/web/src/app/layout.tsx
import { Be_Vietnam_Pro } from 'next/font/google'

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-be-vietnam',
  weight: ['400', '500', '600', '700'],
})

// Apply to <html>:
<html lang="vi" className={`${beVietnam.variable}`}>
```

### postcss.config.mjs

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

### Key Files

- `apps/web/package.json` (MODIFY — add Tailwind v4 deps)
- `apps/web/postcss.config.mjs` (NEW)
- `apps/web/src/styles/globals.css` (MODIFY — merge tokens)
- `apps/web/src/app/layout.tsx` (MODIFY — add Be Vietnam Pro)

### DO NOT

- Do NOT remove existing `.module.css` files (other stories will handle each component)
- Do NOT add `tailwind.config.js` — Tailwind v4 uses CSS-first config
- Do NOT break existing CSS Module token references (backward-compat aliases prevent this)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `apps/web/package.json` (MODIFY)
- `apps/web/postcss.config.mjs` (NEW)
- `apps/web/src/styles/globals.css` (MODIFY)
- `apps/web/src/app/layout.tsx` (MODIFY)
