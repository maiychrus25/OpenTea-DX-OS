# 🧪 Test Plan — Story 7.1: Tailwind CSS v4 Setup & Design Token Consolidation

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.1 — Tailwind CSS v4 Setup & Design Token Consolidation
**Date:** 2026-08-14
**Risk Level:** 🟡 MEDIUM — Thay đổi global CSS ảnh hưởng toàn bộ app. Rủi ro chính là backward-compat aliases bị thiếu làm vỡ component cũ, hoặc PostCSS config sai làm build fail.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Backward-compat alias thiếu → CSS Module cũ dùng `--color-primary` bị mất | MEDIUM | HIGH | Unit test: check CSS token resolution |
| PostCSS config sai → build fail | LOW | HIGH | `npm run build` là AC bắt buộc |
| Be Vietnam Pro không load → fallback font | LOW | MEDIUM | Visual check + font-family assertion |
| `@theme inline` xung đột Tailwind v4 syntax | LOW | HIGH | Reference Tailwind v4 docs trước khi implement |
| Existing Login page visual regression | MEDIUM | MEDIUM | Screenshot comparison login page |

---

## Test Strategy

1. **Build check:** `npm run build` phải pass 0 errors — đây là gate bắt buộc
2. **CSS variable presence:** Jest kiểm tra globals.css chứa đúng tokens
3. **Font check:** E2E kiểm tra `--font-be-vietnam` được apply
4. **Visual regression:** Login page không bị vỡ layout

**Test files location:**
- `apps/web/src/__tests__/styles/globals-tokens.test.ts`
- `apps/web/tests/e2e/foundation/design-tokens.spec.ts`

---

## Test Cases

### TC-7.1-01: Build Passes After Changes (Build Gate)

**Type:** Build
**Tool:** `npm run build`
**Priority:** P0 — BLOCKING

**Steps:**
1. Run `npm run build` từ `apps/web/`
2. Assert: exit code 0, no TypeScript errors, no PostCSS errors

**Pass Criteria:** Build thành công hoàn toàn.
**Fail Criteria:** Bất kỳ lỗi TypeScript hoặc PostCSS nào.

---

### TC-7.1-02: Prototype Tokens Present in globals.css (Unit)

**Type:** Unit / Static analysis
**Tool:** Jest (fs.readFileSync)
**Priority:** P0

```typescript
// __tests__/styles/globals-tokens.test.ts
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(
  join(process.cwd(), 'src/styles/globals.css'),
  'utf-8'
)

describe('globals.css design tokens', () => {
  it('imports tailwindcss', () => {
    expect(css).toContain("@import 'tailwindcss'")
  })

  it('contains prototype primary color', () => {
    expect(css).toContain('--primary:')
    expect(css).toContain('#176c4b')
  })

  it('contains sidebar-bg token', () => {
    expect(css).toContain('--sidebar-bg:')
    expect(css).toContain('#143c2d')
  })

  it('contains accent-lime token', () => {
    expect(css).toContain('--accent-lime:')
    expect(css).toContain('#d6f05c')
  })

  it('contains backward-compat alias for --color-primary', () => {
    expect(css).toContain('--color-primary:')
    expect(css).toContain('var(--primary)')
  })
})
```

**Pass Criteria:** Tất cả tokens hiện diện và đúng giá trị.
**Fail Criteria:** Thiếu token hoặc sai giá trị hex.

---

### TC-7.1-03: Be Vietnam Pro Font Applied (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

```typescript
// tests/e2e/foundation/design-tokens.spec.ts
test('Be Vietnam Pro font is loaded', async ({ page }) => {
  await page.goto('/login')
  const fontFamily = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--font-be-vietnam').trim()
  )
  expect(fontFamily).not.toBe('')
  // Font should be applied to body
  const bodyFont = await page.evaluate(() =>
    getComputedStyle(document.body).fontFamily
  )
  expect(bodyFont).toContain('Be Vietnam Pro')
})
```

**Pass Criteria:** Font variable tồn tại và được apply vào body.
**Fail Criteria:** Font variable rỗng hoặc body dùng fallback font.

---

### TC-7.1-04: Login Page No Visual Regression (E2E)

**Type:** E2E / Visual
**Tool:** Playwright
**Priority:** P1

**Steps:**
1. Navigate to `/login`
2. Assert page renders (không có JS error)
3. Assert card container visible
4. Assert "Đăng nhập qua Keycloak" button present
5. Assert page background color matches design (không trắng thuần)

```typescript
test('login page renders without regression', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('form')).toBeVisible()
  await expect(page.getByRole('button', { name: /keycloak/i })).toBeVisible()
  // No console errors
  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  expect(errors).toHaveLength(0)
})
```

**Pass Criteria:** Login page renders đúng, không có console errors.
**Fail Criteria:** Page trắng, JS error, hoặc button bị ẩn.

---

### TC-7.1-05: postcss.config.mjs Valid (Unit)

**Type:** Static check
**Tool:** Node.js require/import
**Priority:** P0

**Steps:**
1. Import `postcss.config.mjs`
2. Assert `plugins['@tailwindcss/postcss']` exists

**Pass Criteria:** Config file exportable và chứa đúng plugin.
**Fail Criteria:** Syntax error hoặc missing plugin key.

---

## Test Execution Plan

```
P0 (blocking — phải pass trước khi merge):
  TC-7.1-01: Build gate
  TC-7.1-02: Token presence
  TC-7.1-05: PostCSS config

P1 (important — phải pass trong sprint):
  TC-7.1-03: Font check
  TC-7.1-04: Login page regression
```

---

## Definition of Done for Story 7.1

- [ ] `TC-7.1-01` PASS: `npm run build` exit 0
- [ ] `TC-7.1-02` PASS: Tất cả design tokens hiện diện trong globals.css
- [ ] `TC-7.1-03` PASS: Be Vietnam Pro được load và apply
- [ ] `TC-7.1-04` PASS: Login page không bị regression
- [ ] `TC-7.1-05` PASS: PostCSS config valid
- [ ] Committed với: `chore(design-system): setup tailwind v4 and merge prototype design tokens`

---

*🧪 Murat notes: Story này là foundation — nếu fail thì tất cả stories 7.2+ sẽ build trên nền sai. TC-7.1-01 và TC-7.1-02 là absolute gates. Run chúng đầu tiên trước khi viết bất kỳ story nào tiếp theo.*
