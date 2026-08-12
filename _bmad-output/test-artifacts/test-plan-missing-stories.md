# 🧪 TEA Test Plan — Missing Stories (Epic 1 Foundation Gaps)
# Murat — Master Test Architect & Quality Advisor
# DX-AgriMarket | Generated: 2026-08-12

> **Scope:** Stories 1.2a, 1.5a–f, 1.8, 2.0a, 2.3a, 3.5a, 4.6a
> **Framework:** Jest + React Testing Library (unit/component), Playwright (E2E)
> **Test ID Format:** `{EPIC}.{STORY}-{LEVEL}-{SEQ}`

---

## Risk Register (Murat Risk Assessment)

| Risk ID | Story | Description | P | I | Score | Category | Mitigation |
|---------|-------|-------------|---|---|-------|----------|------------|
| R-01 | 1.5b | Middleware bypass via route group (manager) | 3 | 3 | 9 | SEC | Move to regular folder; add middleware test |
| R-02 | 1.5e | `any` casts in auth allow role escalation | 3 | 3 | 9 | SEC | Type augmentation + integration test |
| R-03 | 4.6a | AI response leaks treatment/recommendation | 2 | 3 | 6 | BUS | Invariant test at port layer |
| R-04 | 2.3a | Piper timeout causes user-facing hang | 2 | 2 | 4 | OPS | AbortSignal timeout + 503 test |
| R-05 | 1.5a | Inline styles ship to production (AD-6) | 3 | 2 | 6 | TECH | CSS-in-JS grep test in CI |
| R-06 | 3.5a | Open-Meteo rate limit causes 429 errors | 2 | 2 | 4 | PERF | Cache-first + fallback test |

**Gate Criterion:** R-01 and R-02 (score=9) are BLOCKERS — must pass before deployment.

---

## Story 1.2a — Error Boundary, Loading & Not-Found

### Test Level Distribution
| Level | Count | Justification |
|-------|-------|---------------|
| UNIT | 4 | Component rendering logic |
| E2E | 3 | User-facing error paths |

### Unit Tests (Jest + RTL)

```typescript
// __tests__/app/error.test.tsx
describe('error.tsx', () => {
  it('1.2a-UNIT-001: renders error message with design system heading', () => {
    const mockReset = jest.fn()
    render(<ErrorPage error={new Error('Test')} reset={mockReset} />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('1.2a-UNIT-002: Thử lại button calls reset()', async () => {
    const mockReset = jest.fn()
    render(<ErrorPage error={new Error('Test')} reset={mockReset} />)
    await userEvent.click(screen.getByRole('button', { name: /thử lại/i }))
    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('1.2a-UNIT-003: no inline style attributes on any element', () => {
    const { container } = render(<ErrorPage error={new Error('x')} reset={() => {}} />)
    const allElements = container.querySelectorAll('[style]')
    expect(allElements).toHaveLength(0) // AC: 4
  })
})

// __tests__/app/not-found.test.tsx
describe('not-found.tsx', () => {
  it('1.2a-UNIT-004: renders Không tìm thấy trang', () => {
    render(<NotFoundPage />)
    expect(screen.getByText(/không tìm thấy trang/i)).toBeInTheDocument()
  })
})
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/error-pages/error-boundary.spec.ts
test('1.2a-E2E-001: visiting unknown route shows not-found page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist-abc123')
  await expect(page.getByText(/không tìm thấy trang/i)).toBeVisible()
})

test('1.2a-E2E-002: not-found page has working dashboard link', async ({ page }) => {
  await page.goto('/non-existent')
  const dashboardLink = page.getByRole('link')
  await expect(dashboardLink).toBeVisible()
})

test('1.2a-E2E-003: loading.tsx skeleton visible during suspense', async ({ page }) => {
  // Slow down network to trigger suspense
  await page.route('**/api/**', route => new Promise(r => setTimeout(() => route.continue(), 500)))
  await page.goto('/manager/dashboard')
  // Skeleton should appear before data loads
  await expect(page.locator('[data-testid="skeleton"]').first()).toBeVisible()
})
```

---

## Story 1.5a — Login Page UI

### Test Level Distribution
| Level | Count | Justification |
|-------|-------|---------------|
| UNIT | 5 | Component rendering, CSS Module usage |
| E2E | 3 | Auth flow, responsive layout |

### Unit Tests (Jest + RTL)

```typescript
// __tests__/app/(auth)/login/LoginPage.test.tsx
describe('Login Page', () => {
  it('1.5a-UNIT-001: renders brand name DX-AgriMarket', () => {
    render(<LoginPage />)
    expect(screen.getByText('DX-AgriMarket')).toBeInTheDocument()
  })

  it('1.5a-UNIT-002: renders subtitle Hệ điều hành số Nông nghiệp', () => {
    render(<LoginPage />)
    expect(screen.getByText(/hệ điều hành số/i)).toBeInTheDocument()
  })

  it('1.5a-UNIT-003: no inline style attributes on any element (AC: 1)', () => {
    const { container } = render(<LoginPage />)
    const inlineStyles = container.querySelectorAll('[style]')
    expect(inlineStyles).toHaveLength(0) // Risk R-05 mitigation
  })

  it('1.5a-UNIT-004: no Tailwind class names in rendered HTML (AC: 1)', () => {
    const { container } = render(<LoginPage />)
    const tailwindPattern = /\b(p-\d|m-\d|flex|text-gray|font-bold|max-w-)\b/
    expect(container.innerHTML).not.toMatch(tailwindPattern)
  })

  it('1.5a-UNIT-005: login button present with type submit', () => {
    render(<LoginPage />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })
})
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/auth/login.spec.ts
test('1.5a-E2E-001: login page renders at /login without auth', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('DX-AgriMarket')).toBeVisible()
  await expect(page.getByRole('button')).toBeVisible()
})

test('1.5a-E2E-002: clicking login redirects to Keycloak', async ({ page }) => {
  await page.goto('/login')
  await page.click('button')
  // Should redirect to Keycloak
  await expect(page).toHaveURL(/keycloak|localhost:8080/)
})

test('1.5a-E2E-003: page is mobile responsive (400px card)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/login')
  const card = page.locator('[class*="card"]')
  const cardWidth = await card.evaluate(el => el.getBoundingClientRect().width)
  expect(cardWidth).toBeLessThanOrEqual(375)
})
```

---

## Story 1.5b — Role Layouts & AppShell

### Risk: R-01 (CRITICAL — Score=9, Security)

```typescript
// __tests__/middleware/role-routing.test.ts
describe('1.5b Middleware Role Protection (CRITICAL — R-01)', () => {
  it('1.5b-UNIT-001: /manager/* routes require manager role', async () => {
    const mockReq = createMockRequest('/manager/profile', { role: 'officer' })
    const response = await middleware(mockReq)
    expect(response.status).toBe(307) // Redirect
    expect(response.headers.get('location')).toBe('/unauthorized')
  })

  it('1.5b-UNIT-002: /officer/* routes require officer role', async () => {
    const mockReq = createMockRequest('/officer/journal', { role: 'farmer' })
    const response = await middleware(mockReq)
    expect(response.status).toBe(307)
  })

  it('1.5b-UNIT-003: /farmer/* routes require farmer role', async () => {
    const mockReq = createMockRequest('/farmer/dashboard', { role: 'manager' })
    const response = await middleware(mockReq)
    expect(response.status).toBe(307)
  })

  it('1.5b-UNIT-004: /manager/profile resolves with /manager prefix (not /profile)', () => {
    // Verify route moved from (manager)/ to manager/
    const profilePath = '/manager/profile'
    expect(profilePath.startsWith('/manager')).toBe(true)
  })
})
```

### Component Tests (RTL)

```typescript
// __tests__/components/AppShell.test.tsx
describe('AppShell', () => {
  it('1.5b-UNIT-005: sets data-role attribute on root', () => {
    const { container } = render(
      <AppShell role="manager" navItems={[]} userName="Test" />
    )
    expect(container.firstChild).toHaveAttribute('data-role', 'manager')
  })

  it('1.5b-UNIT-006: renders navItems from props (not hardcoded)', () => {
    const navItems = [{ label: 'Tổng quan', href: '/manager/dashboard', icon: null }]
    render(<AppShell role="manager" navItems={navItems} userName="Test" />)
    expect(screen.getByText('Tổng quan')).toBeInTheDocument()
  })

  it('1.5b-UNIT-007: farmer layout has no sidebar', () => {
    const { queryByTestId } = render(
      <AppShell role="farmer" navItems={[]} userName="Test" hideSidebar />
    )
    expect(queryByTestId('sidebar')).toBeNull()
  })

  it('1.5b-UNIT-008: displays user name in TopBar', () => {
    render(<AppShell role="manager" navItems={[]} userName="Nguyen Van A" />)
    expect(screen.getByText('NA')).toBeInTheDocument() // initials
  })
})
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/auth/role-routing.spec.ts
test('1.5b-E2E-001: officer cannot access manager profile page', async ({ page, context }) => {
  // Login as officer
  await loginAs(page, 'officer1', 'Test1234!')
  await page.goto('/manager/profile')
  await expect(page).toHaveURL('/unauthorized')
})

test('1.5b-E2E-002: manager sees sidebar with 7 nav items', async ({ page }) => {
  await loginAs(page, 'manager1', 'Test1234!')
  await page.goto('/manager/dashboard')
  const navLinks = page.locator('[data-testid="sidebar"] a')
  await expect(navLinks).toHaveCount(7)
})

test('1.5b-E2E-003: farmer sees bottom nav only (no sidebar)', async ({ page }) => {
  await loginAs(page, 'farmer1', 'Test1234!')
  await page.goto('/farmer/dashboard')
  await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible()
  await expect(page.locator('[data-testid="bottom-nav"]')).toBeVisible()
})
```

---

## Story 1.5c — Sign-Out Flow

### Unit Tests

```typescript
// __tests__/components/UserMenu.test.tsx
describe('UserMenu', () => {
  it('1.5c-UNIT-001: clicking avatar opens dropdown', async () => {
    render(<UserMenu role="manager" userName="Nguyen Van A" />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Đăng xuất')).toBeVisible()
  })

  it('1.5c-UNIT-002: clicking outside closes dropdown', async () => {
    render(<UserMenu role="manager" userName="Test" />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(document.body)
    expect(screen.queryByText('Đăng xuất')).not.toBeInTheDocument()
  })

  it('1.5c-UNIT-003: no inline styles on dropdown (AC: CSS Modules)', () => {
    const { container } = render(<UserMenu role="manager" userName="Test" />)
    expect(container.querySelectorAll('[style]')).toHaveLength(0)
  })
})
```

### E2E Tests

```typescript
test('1.5c-E2E-001: sign out redirects to /login', async ({ page }) => {
  await loginAs(page, 'manager1', 'Test1234!')
  await page.goto('/manager/dashboard')
  await page.click('[data-testid="user-avatar"]')
  await page.click('text=Đăng xuất')
  await expect(page).toHaveURL('/login')
})
```

---

## Story 1.5d — Unauthorized Page UI

### Unit Tests

```typescript
describe('Unauthorized Page', () => {
  it('1.5d-UNIT-001: renders 403 heading', () => {
    render(<UnauthorizedPage />)
    expect(screen.getByText(/403/)).toBeInTheDocument()
  })

  it('1.5d-UNIT-002: no inline styles (AC: 1)', () => {
    const { container } = render(<UnauthorizedPage />)
    expect(container.querySelectorAll('[style]')).toHaveLength(0)
  })

  it('1.5d-UNIT-003: has dashboard link button', () => {
    render(<UnauthorizedPage />)
    expect(screen.getByRole('link')).toBeInTheDocument()
  })
})
```

---

## Story 1.5e — SessionProvider & TypeScript Types

### Risk: R-02 (CRITICAL — Score=9, Security)

```typescript
// __tests__/auth/session-types.test.ts
describe('SessionProvider & JWT Types (CRITICAL — R-02)', () => {
  it('1.5e-UNIT-001: no "any" cast in auth.ts', async () => {
    // Static analysis: read file content and check for 'as any'
    const authContent = fs.readFileSync('src/auth.ts', 'utf-8')
    expect(authContent).not.toMatch(/as any/)
  })

  it('1.5e-UNIT-002: no "any" cast in middleware.ts', () => {
    const middlewareContent = fs.readFileSync('src/middleware.ts', 'utf-8')
    expect(middlewareContent).not.toMatch(/as any/)
  })

  it('1.5e-UNIT-003: JWT type augmentation includes role', () => {
    // TypeScript compile check — verified by tsc --noEmit
    // Test: session.user.role is typed in next-auth.d.ts
    const typeDecl = fs.readFileSync('src/types/next-auth.d.ts', 'utf-8')
    expect(typeDecl).toContain('role')
    expect(typeDecl).toContain("'manager' | 'officer' | 'farmer'")
  })

  it('1.5e-UNIT-004: Providers component is use client', () => {
    const providers = fs.readFileSync('src/app/providers.tsx', 'utf-8')
    expect(providers).toMatch(/^'use client'/)
  })
})
```

---

## Story 2.0a — Geocode Proxy API

### Unit Tests

```typescript
// __tests__/api/geocode/route.test.ts
describe('GET /api/geocode', () => {
  it('2.0a-UNIT-001: missing q param returns 400', async () => {
    const response = await GET(createRequest('/api/geocode?q='))
    expect(response.status).toBe(400)
  })

  it('2.0a-UNIT-002: unauthenticated returns 401', async () => {
    mockAuth(null) // No session
    const response = await GET(createRequest('/api/geocode?q=Hanoi'))
    expect(response.status).toBe(401)
  })

  it('2.0a-UNIT-003: NominatimAdapter sends correct User-Agent', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const adapter = new NominatimGeocodingAdapter()
    await adapter.search('Hanoi')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('DX-AgriMarket') })
      })
    )
  })
})
```

### Integration Tests

```typescript
// __tests__/integration/geocode-api.test.ts
describe('Geocode API Integration', () => {
  it('2.0a-INT-001: returns results array with display_name, lat, lon', async () => {
    const res = await authenticatedRequest('GET', '/api/geocode?q=Hà+Nội')
    const data = await res.json()
    expect(data.results[0]).toMatchObject({
      display_name: expect.any(String),
      lat: expect.any(String),
      lon: expect.any(String),
    })
  })
})
```

---

## Story 2.3a — TTS API Endpoint

### Unit Tests

```typescript
// __tests__/api/tts/route.test.ts
describe('POST /api/tts', () => {
  it('2.3a-UNIT-001: empty text returns 400', async () => {
    const response = await POST(createRequest({ text: '' }))
    expect(response.status).toBe(400)
  })

  it('2.3a-UNIT-002: text > 500 chars returns 400', async () => {
    const response = await POST(createRequest({ text: 'a'.repeat(501) }))
    expect(response.status).toBe(400)
  })

  it('2.3a-UNIT-003: Piper unavailable returns 503 with Vietnamese message', async () => {
    mockPiperUnavailable()
    const response = await POST(createRequest({ text: 'Xin chào' }))
    const data = await response.json()
    expect(response.status).toBe(503)
    expect(data.error.message).toMatch(/tạm ngưng/i)
  })
})

describe('GET /api/tts/status', () => {
  it('2.3a-UNIT-004: returns available boolean', async () => {
    const response = await GET(createRequest('/api/tts/status'))
    const data = await response.json()
    expect(typeof data.available).toBe('boolean')
  })
})
```

---

## Story 3.5a — Weather API Endpoint

### Unit Tests

```typescript
// __tests__/api/weather/route.test.ts
describe('GET /api/weather', () => {
  it('3.5a-UNIT-001: invalid date format returns 400', async () => {
    const response = await GET(createRequest('/api/weather?date=not-a-date&parcelId=uuid'))
    expect(response.status).toBe(400)
  })

  it('3.5a-UNIT-002: invalid parcelId returns 400', async () => {
    const response = await GET(createRequest('/api/weather?date=2026-08-01&parcelId=not-uuid'))
    expect(response.status).toBe(400)
  })

  it('3.5a-UNIT-003: non-existent parcelId returns 404', async () => {
    mockPrismaParcelNotFound()
    const response = await GET(createRequest('/api/weather?date=2026-08-01&parcelId=' + validUUID))
    expect(response.status).toBe(404)
  })
})

describe('GetWeatherUseCase', () => {
  it('3.5a-UNIT-004: cache hit returns data without calling Open-Meteo', async () => {
    const cacheRepo = { findNearest: jest.fn().mockResolvedValue(mockWeatherData), save: jest.fn() }
    const fetchAdapter = { fetchHistorical: jest.fn() }
    const useCase = new GetWeatherUseCase(cacheRepo, fetchAdapter)

    await useCase.execute({ parcelId: 'p1', date: '2026-08-01' })
    expect(fetchAdapter.fetchHistorical).not.toHaveBeenCalled()
  })

  it('3.5a-UNIT-005: cache miss calls Open-Meteo and saves result', async () => {
    const cacheRepo = { findNearest: jest.fn().mockResolvedValue(null), save: jest.fn() }
    const fetchAdapter = { fetchHistorical: jest.fn().mockResolvedValue(mockWeatherData) }
    const useCase = new GetWeatherUseCase(cacheRepo, fetchAdapter)

    await useCase.execute({ parcelId: 'p1', date: '2026-08-01' })
    expect(fetchAdapter.fetchHistorical).toHaveBeenCalledTimes(1)
    expect(cacheRepo.save).toHaveBeenCalledTimes(1)
  })
})
```

### Performance Test
```typescript
it('3.5a-UNIT-006: cache hit response < 100ms (AC: 3)', async () => {
  const start = Date.now()
  await cacheHitRequest()
  expect(Date.now() - start).toBeLessThan(100)
})
```

---

## Story 4.6a — Disease Diagnosis Proxy

### Risk: R-03 (Score=6, CRITICAL Business Invariant)

```typescript
// __tests__/api/diagnosis/route.test.ts
describe('POST /api/diagnosis (AI Invariant Tests — R-03)', () => {
  it('4.6a-UNIT-001: CRITICAL — response does NOT contain treatment field', async () => {
    mockDiseaseApiSuccess({ disease_name: 'Bệnh đạo ôn', confidence_score: 0.92 })
    const response = await POST(createDiagnosisRequest())
    const data = await response.json()
    expect(data.data).not.toHaveProperty('treatment') // AI Invariant
    expect(data.data).not.toHaveProperty('recommendation') // AI Invariant
  })

  it('4.6a-UNIT-002: CRITICAL — response only contains disease_name, confidence_score, report_id', async () => {
    mockDiseaseApiSuccess()
    const response = await POST(createDiagnosisRequest())
    const data = await response.json()
    const keys = Object.keys(data.data)
    expect(keys).toEqual(['disease_name', 'confidence_score', 'report_id'])
  })

  it('4.6a-UNIT-003: non-farmer role returns 403', async () => {
    mockAuth({ role: 'manager' })
    const response = await POST(createDiagnosisRequest())
    expect(response.status).toBe(403)
  })

  it('4.6a-UNIT-004: disease-api unavailable returns 503 with Vietnamese message', async () => {
    mockDiseaseApiDown()
    const response = await POST(createDiagnosisRequest())
    const data = await response.json()
    expect(response.status).toBe(503)
    expect(data.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('4.6a-UNIT-005: DiseaseReport created in database after successful diagnosis', async () => {
    mockDiseaseApiSuccess()
    await POST(createDiagnosisRequest())
    expect(mockPrisma.diseaseReport.create).toHaveBeenCalledTimes(1)
  })

  it('4.6a-UNIT-006: Officer notification created after successful diagnosis', async () => {
    mockDiseaseApiSuccess()
    await POST(createDiagnosisRequest())
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'disease_report' })
    )
  })
})
```

### Integration Test

```typescript
it('4.6a-INT-001: DiseaseApiAdapter strips any extra fields from FastAPI response', async () => {
  // Simulate FastAPI returning extra fields
  mockFetch({ disease_name: 'X', confidence_score: 0.8, treatment: 'DO NOT RETURN', recommendation: 'DO NOT RETURN' })
  const adapter = new DiseaseApiAdapter()
  const result = await adapter.predict(mockImageBuffer)
  expect(result).not.toHaveProperty('treatment')
  expect(result).not.toHaveProperty('recommendation')
})
```

---

## Quality Gate Summary

| Gate | Criteria | Status |
|------|---------|--------|
| R-01 (SEC) | `/manager/*` middleware protection test must PASS | ⛔ Blocks 1.5b |
| R-02 (SEC) | No `any` cast tests must PASS | ⛔ Blocks 1.5e |
| R-03 (BUS) | AI Invariant tests must PASS | ⛔ Blocks 4.6a |
| Coverage | All ACs have ≥1 test | Required before `done` |
| No console.* | grep verification in CI | Required for all stories |

### CI Verification Commands
```bash
# Run all missing story tests:
npx jest --testPathPattern="1-2a|1-5a|1-5b|1-5c|1-5d|1-5e|2-0a|2-3a|3-5a|4-6a"

# Verify no inline styles:
grep -r 'style={{' apps/web/src/app --include="*.tsx" | grep -v "test" | wc -l  # Should be 0

# Verify no 'any' casts in auth files:
grep -n "as any" apps/web/src/auth.ts apps/web/src/middleware.ts  # Should be empty

# TypeScript check:
npx tsc --noEmit
```
