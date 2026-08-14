# 🧪 Test Plan — Story 7.4: Shared UI Components — Pill, Button Variants

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.4 — Shared UI: Pill & Button Variants
**Date:** 2026-08-14
**Risk Level:** 🟡 MEDIUM — Rủi ro chính là Button refactor break login form hiện tại. Pill là component mới nên ít rủi ro regression.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Button default variant change breaks login | MEDIUM | HIGH | Unit test: Button without variant renders as primary |
| Pill tone màu sai | LOW | MEDIUM | Unit test: snapshot hoặc class assertion |
| `isLoading` prop bị mất trong Button refactor | LOW | HIGH | Unit test: isLoading renders spinner/disabled |
| Button.module.css class collision | LOW | MEDIUM | Code review + build check |

---

## Test Cases

### TC-7.4-01: Pill Renders Correct Tone Classes (Unit)

**Type:** Unit
**Tool:** Jest + React Testing Library
**Priority:** P0

```typescript
// __tests__/components/ui/Pill.test.tsx
import { render, screen } from '@testing-library/react'
import { Pill } from '@/components/ui'

describe('Pill component', () => {
  it('renders green tone', () => {
    const { container } = render(<Pill tone="green">Đang chăm sóc</Pill>)
    expect(container.firstChild).toHaveClass('green')
    expect(screen.getByText('Đang chăm sóc')).toBeInTheDocument()
  })

  it('renders amber tone', () => {
    const { container } = render(<Pill tone="amber">Chờ duyệt</Pill>)
    expect(container.firstChild).toHaveClass('amber')
  })

  it('renders blue tone', () => {
    const { container } = render(<Pill tone="blue">Đã xuất QR</Pill>)
    expect(container.firstChild).toHaveClass('blue')
  })

  it('renders neutral tone', () => {
    const { container } = render(<Pill tone="neutral">Nội bộ</Pill>)
    expect(container.firstChild).toHaveClass('neutral')
  })

  it('defaults to size sm', () => {
    const { container } = render(<Pill tone="green">Test</Pill>)
    expect(container.firstChild).toHaveClass('sm')
  })

  it('accepts size md', () => {
    const { container } = render(<Pill tone="green" size="md">Test</Pill>)
    expect(container.firstChild).toHaveClass('md')
  })
})
```

**Pass Criteria:** Tất cả 6 assertions pass.

---

### TC-7.4-02: Button Default Variant is Primary (Unit — Backward Compat)

**Type:** Unit
**Tool:** Jest + React Testing Library
**Priority:** P0 — BLOCKING (backward-compat)

```typescript
// __tests__/components/ui/Button.test.tsx
describe('Button backward compatibility', () => {
  it('renders as primary when no variant is specified', () => {
    const { container } = render(<Button>Đăng nhập</Button>)
    expect(container.firstChild).toHaveClass('primary')
  })

  it('isLoading prop disables button and shows loading state', () => {
    render(<Button isLoading>Đang tải</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

**Pass Criteria:** Default variant = primary, isLoading disables button.
**Fail Criteria:** Login form break.

---

### TC-7.4-03: Button Variant Classes (Unit)

**Type:** Unit
**Tool:** Jest + React Testing Library
**Priority:** P1

```typescript
describe('Button variants', () => {
  it('variant=primary has primary class', () => {
    const { container } = render(<Button variant="primary">CTA</Button>)
    expect(container.firstChild).toHaveClass('primary')
  })

  it('variant=secondary has secondary class', () => {
    const { container } = render(<Button variant="secondary">Hủy</Button>)
    expect(container.firstChild).toHaveClass('secondary')
  })

  it('variant=text has text class', () => {
    const { container } = render(<Button variant="text">Xem tất cả</Button>)
    expect(container.firstChild).toHaveClass('text')
  })

  it('variant=icon has icon class', () => {
    const { container } = render(<Button variant="icon"><span>X</span></Button>)
    expect(container.firstChild).toHaveClass('icon')
  })
})
```

---

### TC-7.4-04: LoginForm Still Works After Button Refactor (E2E Regression)

**Type:** E2E / Regression
**Tool:** Playwright
**Priority:** P0

```typescript
test('login form renders and submit button is clickable', async ({ page }) => {
  await page.goto('/login')
  const btn = page.getByRole('button', { name: /keycloak/i })
  await expect(btn).toBeVisible()
  await expect(btn).not.toBeDisabled()
})
```

**Pass Criteria:** Login button vẫn visible và enabled.

---

### TC-7.4-05: Pill and Button Exported from ui/index.ts (Unit)

**Type:** Static / Import check
**Tool:** Jest
**Priority:** P1

```typescript
import * as UI from '@/components/ui'

test('Pill is exported from ui index', () => {
  expect(UI.Pill).toBeDefined()
})

test('Button is still exported', () => {
  expect(UI.Button).toBeDefined()
})
```

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.4-02: Button backward compat
  TC-7.4-04: Login form regression
  TC-7.4-01: Pill tone classes

P1 (important):
  TC-7.4-03: Button variants
  TC-7.4-05: Exports check
```

---

## Definition of Done for Story 7.4

- [ ] `TC-7.4-01` PASS: Pill tones render correctly
- [ ] `TC-7.4-02` PASS: Button backward compat (no variant = primary)
- [ ] `TC-7.4-03` PASS: All 4 Button variants have correct classes
- [ ] `TC-7.4-04` PASS: Login form không bị regression
- [ ] `TC-7.4-05` PASS: Exports intact
- [ ] `npm run build` pass
- [ ] Committed với: `feat(ui): add Pill component and Button variant system`

---

*🧪 Murat notes: TC-7.4-02 và TC-7.4-04 là P0 absolute gates. Nếu Button default không còn là primary, login form sẽ trông sai ngay sau deploy. Test này phải run trước khi PR merge.*
