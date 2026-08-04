# 🧪 Test Plan — Story 1.2: Design System — CSS Tokens & Shared UI Components

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 1.2 — Design System — CSS Tokens & Shared UI Components
**Date:** 2026-08-05
**Risk Level:** 🟠 HIGH — Design system is the visual foundation used by ALL 38 remaining stories. Regressions here cause cascading failures across the entire codebase.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| CSS custom property typo (wrong hex or name) | HIGH | HIGH | Snapshot test token values; visual regression |
| Inter font subsets missing Vietnamese chars | MEDIUM | HIGH | Render test with Vietnamese text; check `ữ`, `ắ`, `ọ` |
| Farmer role 17px not applied correctly | MEDIUM | HIGH | Unit test `[data-role="farmer"]` computed style |
| Modal focus trap breaking Tab cycle | MEDIUM | HIGH | Automated Playwright keyboard navigation test |
| Skeleton pulse ignores prefers-reduced-motion | MEDIUM | MEDIUM | CSS media query test |
| Button tap target < 44px on mobile | MEDIUM | HIGH | CSS dimension assertion; UX-DR16 compliance |
| Inline styles slipping through code review | LOW | MEDIUM | Grep-based static scan |
| 'use client' missing on interactive components | LOW | HIGH | TypeScript will error on server-render hooks |

---

## Test Strategy for Story 1.2

### Approach

Design system testing mixes **unit tests** (component render + props), **CSS assertions** (computed styles), and **visual snapshot** (prevent token drift). No E2E needed at this layer — component isolation is sufficient.

**Tools:**
- **Unit/Component:** Jest + React Testing Library (RTL)
- **CSS Snapshot:** Jest `toMatchSnapshot()` on rendered className strings
- **Accessibility:** `@testing-library/jest-dom` + manual ARIA verification
- **Keyboard:** Playwright (focused tests for Modal focus trap only)
- **Static analysis:** `grep` script for inline style / Tailwind violations

**Test files location:** `apps/web/src/__tests__/design-system/`

---

## Test Cases

### TC-1.2-01: CSS Custom Property Token Coverage

**Type:** Unit / Static
**Tool:** Jest + `getComputedStyle` against a mounted `<html>` element, OR direct CSS parsing
**Priority:** P0

**Test:**
```typescript
// __tests__/design-system/tokens.test.ts
import '@testing-library/jest-dom'

const REQUIRED_TOKENS = [
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-subtle',
  '--color-primary-foreground',
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-subtle',
  '--color-status-sowing',
  '--color-status-tending',
  '--color-status-harvest-approved',
  '--color-status-harvested',
  '--color-status-draft',
  '--color-success',
  '--color-warning',
  '--color-danger',
  '--color-info',
  '--color-surface-page',
  '--color-surface-card',
  '--color-border-subtle',
  '--color-border-default',
  '--color-border-focus',
  '--color-ink-primary',
  '--color-ink-secondary',
  '--color-map-overlay',
  '--color-badge-unread',
  '--font-size-display',
  '--font-size-body-large',
  '--sidebar-width',
  '--topbar-height',
]

describe('Design Token Coverage', () => {
  it('globals.css contains all required tokens', () => {
    const fs = require('fs')
    const css = fs.readFileSync('src/styles/globals.css', 'utf-8')
    REQUIRED_TOKENS.forEach(token => {
      expect(css).toContain(token)
    })
  })

  it('--color-primary value is #16A34A', () => {
    const fs = require('fs')
    const css = fs.readFileSync('src/styles/globals.css', 'utf-8')
    expect(css).toMatch(/--color-primary:\s*#16A34A/i)
  })

  it('--color-accent value is #EA580C', () => {
    const fs = require('fs')
    const css = fs.readFileSync('src/styles/globals.css', 'utf-8')
    expect(css).toMatch(/--color-accent:\s*#EA580C/i)
  })

  it('--font-size-body-large value is 1.0625rem', () => {
    const fs = require('fs')
    const css = fs.readFileSync('src/styles/globals.css', 'utf-8')
    expect(css).toMatch(/--font-size-body-large:\s*1\.0625rem/)
  })
})
```

**Pass Criteria:** All 30+ tokens found in `globals.css` with correct values
**Fail Criteria:** Any missing token or wrong value

---

### TC-1.2-02: Farmer Role Typography Override

**Type:** Unit / CSS
**Tool:** Jest + RTL + `jsdom` `getComputedStyle`
**Priority:** P0

```typescript
// __tests__/design-system/farmer-role.test.ts
import { render } from '@testing-library/react'

it('[data-role="farmer"] applies 17px font size to children', () => {
  // Note: jsdom doesn't compute CSS vars — test that the attribute is applied correctly
  // and that the CSS rule exists in globals.css
  const { container } = render(
    <div data-role="farmer">
      <p>Văn bản tiếng Việt</p>
    </div>
  )
  expect(container.firstChild).toHaveAttribute('data-role', 'farmer')

  // Separately verify CSS rule exists in globals.css
  const fs = require('fs')
  const css = fs.readFileSync('src/styles/globals.css', 'utf-8')
  expect(css).toContain('[data-role="farmer"]')
  expect(css).toContain('--font-size-body-large')
})
```

**Pass Criteria:** `data-role="farmer"` attribute applied; CSS rule exists
**Fail Criteria:** Attribute missing or CSS rule absent

---

### TC-1.2-03: Button Component — Variants & Tap Target

**Type:** Unit / Component
**Tool:** Jest + RTL
**Priority:** P0

```typescript
// __tests__/design-system/Button.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui'

describe('Button', () => {
  it('renders with primary variant', () => {
    render(<Button variant="primary">Lưu</Button>)
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument()
  })

  it('renders all 4 variants without errors', () => {
    const variants = ['primary', 'accent', 'ghost', 'danger'] as const
    variants.forEach(v => {
      const { unmount } = render(<Button variant={v}>Test</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-testid', `button-${v}`)
      unmount()
    })
  })

  it('is disabled and not clickable when disabled prop is set', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button variant="primary" disabled onClick={onClick}>Lưu</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows loading state without layout shift', () => {
    const { rerender } = render(<Button variant="primary">Lưu</Button>)
    const initial = screen.getByRole('button').clientWidth
    rerender(<Button variant="primary" isLoading>Lưu</Button>)
    // Width should not change
    expect(screen.getByRole('button').clientWidth).toBe(initial)
  })

  it('CSS: min-height is 44px', () => {
    // Test via CSS file content (jsdom doesn't apply module CSS)
    const fs = require('fs')
    const css = fs.readFileSync('src/components/ui/Button/Button.module.css', 'utf-8')
    expect(css).toMatch(/min-height:\s*44px/)
  })
})
```

**Pass Criteria:** All button variants render; disabled works; 44px enforced in CSS
**Fail Criteria:** Any variant crashes; disabled doesn't block clicks; tap target < 44px

---

### TC-1.2-04: Badge Component — Closed Status Set

**Type:** Unit / Component
**Tool:** Jest + RTL
**Priority:** P1

```typescript
// __tests__/design-system/Badge.test.tsx
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui'

describe('Badge', () => {
  const statuses = [
    { status: 'sowing', label: 'Gieo trồng' },
    { status: 'tending', label: 'Chăm sóc' },
    { status: 'harvest-approved', label: 'Chờ thu hoạch' },
    { status: 'harvested', label: 'Đã thu hoạch' },
    { status: 'draft', label: 'Nháp' },
  ] as const

  statuses.forEach(({ status, label }) => {
    it(`renders "${status}" with Vietnamese label "${label}"`, () => {
      render(<Badge status={status} />)
      expect(screen.getByRole('status')).toHaveTextContent(label)
      expect(screen.getByTestId(`badge-${status}`)).toBeInTheDocument()
    })
  })

  it('has correct ARIA attributes', () => {
    render(<Badge status="sowing" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('Gieo trồng'))
  })
})
```

**Pass Criteria:** All 5 statuses render with correct Vietnamese labels + ARIA
**Fail Criteria:** Any status missing; wrong label; missing role="status"

---

### TC-1.2-05: Modal — Focus Trap & Accessibility

**Type:** Integration / Accessibility
**Tool:** Playwright (keyboard simulation)
**Priority:** P0

```typescript
// tests/e2e/modal-focus-trap.spec.ts
import { test, expect } from '@playwright/test'

test('Modal traps focus when open', async ({ page }) => {
  await page.goto('/design-system-test')  // test page exposing Modal
  await page.click('[data-testid="open-modal"]')

  // Modal should be visible
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await expect(modal).toHaveAttribute('aria-modal', 'true')

  // Tab should cycle within modal
  await page.keyboard.press('Tab')
  const focusedInModal = await page.evaluate(() =>
    document.activeElement?.closest('[role="dialog"]') !== null
  )
  expect(focusedInModal).toBe(true)

  // Escape should close
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
})
```

**Pass Criteria:** Focus stays inside modal; Escape closes; ARIA attributes correct
**Fail Criteria:** Focus escapes to page behind; Escape doesn't close; aria-modal missing

---

### TC-1.2-06: Skeleton — Reduced Motion Media Query

**Type:** CSS / Static
**Tool:** Jest + CSS file parse
**Priority:** P1

```typescript
// __tests__/design-system/Skeleton.test.ts
it('Skeleton CSS has prefers-reduced-motion rule', () => {
  const fs = require('fs')
  const css = fs.readFileSync('src/components/ui/Skeleton/Skeleton.module.css', 'utf-8')
  expect(css).toContain('prefers-reduced-motion: reduce')
  // Animation should be disabled or none
  expect(css).toMatch(/animation:\s*none/)
})
```

**Pass Criteria:** CSS file contains `prefers-reduced-motion` media query disabling animation
**Fail Criteria:** Rule absent

---

### TC-1.2-07: No Inline Styles Violation Scan

**Type:** Static Analysis
**Tool:** Grep script
**Priority:** P1

**Script (`scripts/check-no-inline-styles.sh`):**
```bash
#!/bin/bash
# Checks for inline styles, Tailwind classes, and style={} props in component files
echo "=== Checking for inline style violations ==="

VIOLATIONS=0

# Check for style={{ in tsx files
INLINE=$(grep -rn "style={{" src/components/ --include="*.tsx" | grep -v "//.*style={{")
if [ -n "$INLINE" ]; then
  echo "❌ Inline styles found:"
  echo "$INLINE"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for Tailwind class patterns (bg-, text-, p-, m-, flex, grid-)
TAILWIND=$(grep -rn 'className="[^"]*\(bg-\|text-\|p-\|m-\|flex\b\|grid\b\)' src/components/ --include="*.tsx")
if [ -n "$TAILWIND" ]; then
  echo "❌ Possible Tailwind classes found:"
  echo "$TAILWIND"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ $VIOLATIONS -eq 0 ]; then
  echo "✅ No inline style violations found"
  exit 0
else
  exit 1
fi
```

**Pass Criteria:** Script exits 0 — no inline styles, no Tailwind classes
**Fail Criteria:** Any `style={{` or Tailwind class pattern found in component files

---

### TC-1.2-08: AppShell Layout Breakpoint

**Type:** Visual / Integration
**Tool:** Playwright (viewport resize)
**Priority:** P1

```typescript
test('AppShell shows sidebar at 1024px+', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/manager/dashboard')
  await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
  await expect(page.locator('[data-testid="bottom-nav"]')).not.toBeVisible()
})

test('AppShell shows bottom nav below 1024px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })  // iPhone SE
  await page.goto('/manager/dashboard')
  await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible()
  await expect(page.locator('[data-testid="bottom-nav"]')).toBeVisible()
})
```

**Pass Criteria:** Correct layout at each breakpoint
**Fail Criteria:** Sidebar visible on mobile; bottom nav visible on desktop

---

### TC-1.2-09: Sidebar Active State

**Type:** Unit / Component
**Tool:** Jest + RTL + mocked `usePathname`
**Priority:** P1

```typescript
// __tests__/design-system/Sidebar.test.tsx
jest.mock('next/navigation', () => ({
  usePathname: () => '/manager/dashboard',
}))

import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/layout'

const navItems = [
  { label: 'Tổng quan', href: '/manager/dashboard', icon: null },
  { label: 'Bản tin', href: '/manager/bulletin', icon: null },
]

it('marks active item based on current pathname', () => {
  render(<Sidebar navItems={navItems} />)
  const activeItem = screen.getByText('Tổng quan').closest('a')
  expect(activeItem).toHaveClass(/active/) // or check aria-current
})

it('non-active items do not have active class', () => {
  render(<Sidebar navItems={navItems} />)
  const inactiveItem = screen.getByText('Bản tin').closest('a')
  expect(inactiveItem).not.toHaveClass(/active/)
})
```

**Pass Criteria:** Active item highlighted; others not
**Fail Criteria:** All items active or none active

---

### TC-1.2-10: TypeScript Compilation Clean

**Type:** Build / Static
**Tool:** `tsc --noEmit`
**Priority:** P0

```bash
cd apps/web && npx tsc --noEmit
```

**Pass Criteria:** Exit 0, no errors
**Fail Criteria:** Any TypeScript error

---

## Test Execution Plan

```
P0 (blocking):
  TC-1.2-01 → TC-1.2-02 → TC-1.2-03 → TC-1.2-05 → TC-1.2-10

P1 (important):
  TC-1.2-04 → TC-1.2-06 → TC-1.2-07 → TC-1.2-08 → TC-1.2-09
```

**CI Integration:** Add to `apps/web/package.json`:
```json
"test": "jest",
"test:e2e": "playwright test"
```

---

## Definition of Done for Story 1.2

- [ ] `TC-1.2-01` PASS: all 30+ CSS tokens present with correct values
- [ ] `TC-1.2-02` PASS: `[data-role="farmer"]` applies 17px body font
- [ ] `TC-1.2-03` PASS: Button 4 variants + disabled + 44px tap target
- [ ] `TC-1.2-04` PASS: Badge 5 statuses with Vietnamese labels + ARIA
- [ ] `TC-1.2-05` PASS: Modal focus trap + Escape + aria-modal
- [ ] `TC-1.2-06` PASS: Skeleton respects prefers-reduced-motion
- [ ] `TC-1.2-07` PASS: No inline styles in any component file
- [ ] `TC-1.2-08` PASS: AppShell breakpoint layout correct
- [ ] `TC-1.2-09` PASS: Sidebar active state based on pathname
- [ ] `TC-1.2-10` PASS: TypeScript compiles clean
- [ ] `scripts/check-no-inline-styles.sh` created and committed
- [ ] All components have co-located `.module.css` files
- [ ] Committed with: `feat(design-system): add CSS tokens, shared UI components, and layout shells`

---

*🧪 Murat notes: Story 1.2 is the highest-leverage story in Epic 1 from a quality perspective. Every future story inherits these components. A single wrong hex value in globals.css will cascade across all 38 remaining stories. Invest in TC-1.2-01 snapshot testing now — it will save hours of debugging later.*
