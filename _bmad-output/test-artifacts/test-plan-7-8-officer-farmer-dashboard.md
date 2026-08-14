# 🧪 Test Plan — Story 7.8: Officer & Farmer Dashboard Today Views

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.8 — Officer & Farmer Dashboard Today Views
**Date:** 2026-08-14
**Risk Level:** 🟡 MEDIUM — 2 role dashboards riêng biệt. Rủi ro: role routing sai (officer thấy farmer view), weather query fail.

---

## Test Cases

### TC-7.8-01: Officer Dashboard Hero Renders (E2E)

```typescript
test('officer dashboard shows hero with amber pill', async ({ page }) => {
  await loginAsOfficer(page)
  await page.goto('/officer/dashboard')
  await expect(page.getByText(/Chào buổi/)).toBeVisible()
  await expect(page.getByText(/việc cần ưu tiên/)).toBeVisible()
})
```
**Priority:** P1

---

### TC-7.8-02: Farmer Dashboard Shows 2 CTA Buttons (E2E)

```typescript
test('farmer dashboard has Ghi nhật ký and Chẩn đoán bệnh buttons', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/farmer/dashboard')
  await expect(page.getByRole('link', { name: /Ghi nhật ký/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Chẩn đoán/ })).toBeVisible()
})
```
**Priority:** P0

---

### TC-7.8-03: Officer Layout Has 8 NavItems (E2E)

```typescript
test('officer sidebar has 8 nav items', async ({ page }) => {
  await loginAsOfficer(page)
  await page.goto('/officer/dashboard')
  const navItems = page.locator('[data-testid="sidebar"] nav a, [data-testid="sidebar"] nav button')
  await expect(navItems).toHaveCount(8)
})
```
**Priority:** P1

---

### TC-7.8-04: Farmer Layout Has 6 NavItems (E2E)

```typescript
test('farmer sidebar has 6 nav items', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/farmer/dashboard')
  const navItems = page.locator('[data-testid="sidebar"] nav a, [data-testid="sidebar"] nav button')
  await expect(navItems).toHaveCount(6)
})
```
**Priority:** P1

---

### TC-7.8-05: Role Routing — Officer Cannot Access Farmer Route (E2E)

```typescript
test('officer cannot access farmer dashboard', async ({ page }) => {
  await loginAsOfficer(page)
  await page.goto('/farmer/dashboard')
  // Should redirect to unauthorized or officer dashboard
  await expect(page).not.toHaveURL('/farmer/dashboard')
})
```
**Priority:** P0 — Security

---

### TC-7.8-06: Weather Widget Renders Without Crash (E2E)

```typescript
test('farmer dashboard renders weather widget', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/farmer/dashboard')
  // Weather section exists (may show placeholder if no data)
  await expect(page.locator('[data-testid="weather-widget"]')).toBeVisible()
  // No JS errors
})
```
**Priority:** P1

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.8-02: Farmer CTA buttons
  TC-7.8-05: Role security routing

P1 (important):
  TC-7.8-01: Officer hero
  TC-7.8-03: Officer 8 navItems
  TC-7.8-04: Farmer 6 navItems
  TC-7.8-06: Weather widget
```

---

## Definition of Done for Story 7.8

- [ ] `TC-7.8-01` PASS: Officer hero renders
- [ ] `TC-7.8-02` PASS: Farmer CTA buttons visible
- [ ] `TC-7.8-03` PASS: Officer 8 nav items
- [ ] `TC-7.8-04` PASS: Farmer 6 nav items
- [ ] `TC-7.8-05` PASS: Role routing security
- [ ] `TC-7.8-06` PASS: Weather widget no crash
- [ ] `npm run build` pass
- [ ] Committed với: `feat(dashboard): implement officer and farmer today views`
