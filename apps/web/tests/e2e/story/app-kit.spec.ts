// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// The app kit on the real stack (spec docs/specs/2026-11-13-app-kit-design.md §5, §6): overview, in-app tabs, a filtered and a second page
// of a list, a CSV download, a print page and the way back, an inline form error, inside the shell. Sample data is written through the
// apps (a run writes its own titles, so it can run twice on one stack). After `npm run seed`, `make platform-smoke`, and
//   business apps (leaf-purchase, tea-shop, farm-supply installed):
//     E2E_CORE=1 E2E_APP_KIT=business E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/story/app-kit.spec.ts --project=chromium --no-deps
//   tea-tour (installed):
//     the same with E2E_APP_KIT=tea-tour
import { test, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'
import { appFrame, downloadCsv, expectNoOverflow, optionValues, postForm, printAndGoBack } from '../helpers/app-kit'

test.skip(!process.env.E2E_CORE, 'Needs the real stack: set E2E_CORE=1')

const menuLink = (page: Page, label: string) => page.locator('nav a', { hasText: label })
const PAGE_ROWS = 25
const vnDate = (iso: string) => iso.split('-').reverse().join('/')

/** A past date unique to this run (a period closed on it cannot take tickets, and a run needs a day of its own). */
function runDay() {
  const back = (Math.floor(Date.now() / 1000) % 3000) + 30
  return new Date(Date.now() + 7 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)
}

const contexts: BrowserContext[] = []
const newPage = async (browser: Browser, options: BrowserContextOptions = { viewport: { width: 1280, height: 800 } }) => {
  const context = await browser.newContext(options)
  contexts.push(context)
  return context.newPage()
}

test.describe('app kit: business apps', () => {
  test.skip(process.env.E2E_APP_KIT !== 'business', 'Needs leaf-purchase, tea-shop and farm-supply installed and E2E_APP_KIT=business')
  // One worker, in order: the theme story pages through the orders the tea-shop story wrote.
  test.describe.configure({ retries: 0, mode: 'serial' })
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('leaf-purchase: overview, tabs, filtered and second page, CSV, print, inline error', async ({ browser }) => {
    const title = 'Thu mua búp tươi'
    const day = runDay()
    const grade = `Búp tươi loại 1 ngày ${day}`

    // The manager prices a grade; the officer writes 27 tickets for the day (the list pages by 25).
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    expect((await postForm(manager.request, '/apps/leaf-purchase/prices', [['name', grade], ['price_vnd', '9000']])).status()).toBe(303)
    const officer = await newPage(browser)
    await keycloakLogin(officer, 'smoke_officer_tc', SMOKE_PASSWORD, 'officer')
    const home = await (await officer.request.get('/apps/leaf-purchase/')).text()
    const households = optionValues(home, 'household')
    const gradeId = new RegExp(`<option value="([^"]+)"[^>]*>${grade}`).exec(home)?.[1]
    expect(households.length).toBeGreaterThan(0)
    expect(gradeId).toBeTruthy()
    for (let i = 0; i < 27; i++) {
      const response = await postForm(officer.request, '/apps/leaf-purchase/tickets', [
        ['household', households[i % households.length]], ['weighed_on', day], ['grade', gradeId!], ['kg', '1,5'],
      ])
      expect(response.status(), `ticket ${i}`).toBe(303)
    }

    // Overview: header, tabs, stats and the chart, in the frame.
    await manager.goto('/manager/apps/leaf-purchase/overview')
    const app = appFrame(manager, title)
    await expect(app.getByRole('heading', { name: 'Tổng quan', level: 1 }).or(app.getByRole('heading', { level: 1 }))).toBeVisible()
    await expect(app.locator('.stats li').first()).toBeVisible()
    await expect(app.locator('figure.chart')).toBeVisible()
    await expectNoOverflow(manager, title)

    // The in-app tab keeps the user in the frame (the shell page and its menu stay).
    await app.getByRole('navigation', { name: 'Điều hướng trong ứng dụng' }).getByRole('link', { name: 'Phiếu cân' }).click()
    await expect(app.getByRole('heading', { name: 'Phiếu cân', level: 1 })).toBeVisible()
    expect(new URL(manager.url()).pathname).toBe('/manager/apps/leaf-purchase/overview')
    await expect(menuLink(manager, 'Kỳ thanh toán').first()).toBeVisible()

    // The list: this day only, a search by household name, then the second page of the day.
    await app.locator('input[name=from]').fill(day)
    await app.locator('input[name=to]').fill(day)
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('tbody tr')).toHaveCount(PAGE_ROWS)
    await expect(app.locator('.pagination-status')).toContainText('Trang 1/2 · 27 dòng')
    await app.getByRole('link', { name: 'Sau ›' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 2/2')
    await expect(app.locator('tbody tr')).toHaveCount(2)
    await expect(app.locator('input[name=from]')).toHaveValue(day)
    await app.getByRole('link', { name: '‹ Trước' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 1/2')
    await app.locator('input[name=q]').fill('Household')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('input[name=q]')).toHaveValue('Household')
    await expect(app.locator('tbody tr').first()).toBeVisible()
    await app.locator('input[name=q]').fill('50%')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.getByText('Không có')).toBeVisible()

    // CSV: a download of this HTX's tickets, filters applied.
    await app.locator('form.toolbar').getByRole('link', { name: 'Xoá lọc' }).click()
    await expect(app.locator('input[name=q]')).toHaveValue('')
    await app.locator('input[name=from]').fill(day)
    await app.locator('input[name=to]').fill(day)
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('.pagination-status')).toContainText('27 dòng')
    const csv = await downloadCsv(manager, app.getByRole('link', { name: 'Tải CSV' }))
    expect(csv.name).toMatch(/^leaf-purchase-TC-/)
    const lines = csv.text.trim().split('\r\n')
    expect(lines).toHaveLength(1 + 27)
    expect(lines[0]).toContain('Loại chè')
    expect(lines.slice(1).every(line => line.includes(grade) && line.includes(vnDate(day)))).toBe(true)

    // Print: the weighing slip opens in the top window; the way back is the list inside the shell.
    await app.locator('tbody tr').first().getByRole('link', { name: 'Bản in' }).click()
    await manager.waitForURL(/\/apps\/leaf-purchase\/tickets\/.+\/print/)
    await expect(manager.locator('iframe')).toHaveCount(0)
    await expect(manager.getByRole('heading', { name: 'Phiếu cân chè búp tươi', level: 1 })).toBeVisible()
    await expect(manager.getByText('Dùng lệnh In của trình duyệt')).toBeVisible()
    await manager.getByRole('link', { name: 'Quay lại ứng dụng' }).click()
    await manager.waitForURL('**/manager/apps/leaf-purchase/tickets')
    await expect(appFrame(manager, title).getByRole('heading', { name: 'Phiếu cân', level: 1 })).toBeVisible()

    // Inline form error: the officer's form keeps what was typed and says what is wrong under the field.
    await officer.goto('/officer/apps/leaf-purchase')
    const officerApp = appFrame(officer, title)
    const form = officerApp.locator('form', { has: officerApp.getByRole('button', { name: 'Ghi phiếu' }) })
    await form.locator('select[name=household]').selectOption(households[0])
    await form.locator('input[name=weighed_on]').fill(day)
    await form.locator('select[name=grade]').selectOption(gradeId!)
    await form.locator('input[name=kg]').fill('abc')
    await form.getByRole('button', { name: 'Ghi phiếu' }).click()
    await expect(officerApp.locator('input[name=kg]')).toHaveValue('abc')
    await expect(officerApp.locator('input[name=kg]')).toHaveAttribute('aria-invalid', 'true')
    await expect(officerApp.locator('[role=alert]').first()).toBeVisible()
    await expectNoOverflow(officer, title)
  })
  test('tea-shop: overview, tabs, filtered and second page, CSV with a formula-looking name, print, error', async ({ browser }) => {
    const title = 'Cửa hàng chè'
    const stamp = Date.now()
    const product = `Chè Tân Cương móc câu ${stamp}`
    const customers = ['Nguyễn Văn An', 'Trần Thị Mai', 'Lê Quốc Bảo', 'Phạm Thị Lan', 'Đỗ Minh Tuấn']
    const formulaName = '=HYPERLINK("http://example.invalid","bấm vào đây")'

    // The manager adds a product; a guest places 27 orders of one pack each, one of them under a name that looks like a formula.
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    const added = await postForm(manager.request, '/apps/tea-shop/products', [
      ['name', product], ['pack', 'Gói 200g'], ['price_vnd', '180000'], ['stock', '500'], ['active', 'on'],
    ])
    expect(added.status()).toBe(303)
    const guest = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const shop = await (await guest.request.get('/apps/tea-shop/public/TC')).text()
    const ids = Array.from(shop.matchAll(/<h3 id="product-([^"]+)">([^<]*)<\/h3>/g), match => [match[1], match[2]] as const)
    expect(ids.map(([, name]) => name)).toContain(product)
    for (let i = 0; i < 27; i++) {
      const lines: [string, string][] = ids.flatMap(([id, name]) => [['product_id', id], ['quantity', name === product ? '1' : '0']] as [string, string][])
      const response = await postForm(guest.request, '/apps/tea-shop/public/TC/order', [
        ...lines,
        ['customer_name', i === 0 ? formulaName : customers[i % customers.length]], ['phone', `09${String(10000000 + i * 7919).slice(0, 8)}`],
        ['address', 'Xóm Hồng Thái, xã Tân Cương, Thái Nguyên'], ['note', ''],
      ])
      expect(response.status(), `order ${i}`).toBe(303)
    }

    // Overview with its stats and charts; the tab keeps the frame.
    await manager.goto('/manager/apps/tea-shop')
    const app = appFrame(manager, title)
    await expect(app.getByRole('heading', { name: /Cửa hàng chè HTX/, level: 1 })).toBeVisible()
    await expect(app.locator('.stats li', { hasText: 'Đơn chờ xác nhận' })).toBeVisible()
    await expect(app.locator('figure.chart').first()).toBeVisible()
    await expectNoOverflow(manager, title)
    await app.getByRole('navigation', { name: 'Điều hướng trong ứng dụng' }).getByRole('link', { name: 'Đơn hàng' }).click()
    await expect(app.getByRole('heading', { name: 'Đơn hàng', level: 1 })).toBeVisible()
    expect(new URL(manager.url()).pathname).toBe('/manager/apps/tea-shop')

    // Second page, then a search by customer name.
    await expect(app.locator('.pagination-status')).toContainText('Trang 1/')
    await app.getByRole('link', { name: 'Sau ›' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 2/')
    await app.getByRole('link', { name: '‹ Trước' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 1/')
    await app.locator('input[name=q]').fill('Trần Thị Mai')
    await app.locator('select[name=status]').selectOption('NEW')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect.poll(async () => {
      const rows = await app.locator('tbody tr').allInnerTexts()
      return rows.length > 0 && rows.every(row => row.includes('Trần Thị Mai'))
    }).toBe(true)
    await app.locator('input[name=q]').fill('100%')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('.empty')).toBeVisible()

    // CSV of the filtered list: only the searched customer; the whole list: the formula is neutralised.
    await app.locator('input[name=q]').fill('Trần Thị Mai')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('input[name=q]')).toHaveValue('Trần Thị Mai')
    await expect(app.locator('tbody tr').first()).toContainText('Trần Thị Mai')
    await expect.poll(async () => (await app.locator('tbody tr').allInnerTexts()).every(row => row.includes('Trần Thị Mai'))).toBe(true)
    const filtered = await downloadCsv(manager, app.getByRole('link', { name: 'Tải CSV' }))
    expect(filtered.name).toMatch(/^tea-shop-TC-/)
    const filteredLines = filtered.text.trim().split('\r\n')
    expect(filteredLines.length).toBeGreaterThan(1)
    expect(filteredLines.slice(1).every(line => line.includes('Trần Thị Mai'))).toBe(true)
    await app.locator('input[name=q]').fill('')
    await app.locator('select[name=status]').selectOption('')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('tbody tr')).toHaveCount(PAGE_ROWS)
    const all = await downloadCsv(manager, app.getByRole('link', { name: 'Tải CSV' }))
    expect(all.text).toContain(`'${formulaName.replace(/"/g, '""')}`.replace(/^'/, "\"'"))
    expect(all.text).not.toMatch(/(^|,|\r\n)=HYPERLINK/)
    expect(all.text.split('\r\n').length).toBeGreaterThanOrEqual(28)

    // Print the delivery note of an order; the way back is the order page inside the shell.
    await app.locator('tbody tr').first().getByRole('link', { name: 'In phiếu giao' }).click()
    await manager.waitForURL(/\/apps\/tea-shop\/orders\/.+\/print/)
    await expect(manager.locator('iframe')).toHaveCount(0)
    await expect(manager.getByText('Dùng lệnh In của trình duyệt')).toBeVisible()
    await expect(manager.getByRole('heading', { name: /Phiếu giao hàng/, level: 1 })).toBeVisible()
    await manager.getByRole('link', { name: 'Quay lại ứng dụng' }).click()
    await manager.waitForURL(/\/manager\/apps\/tea-shop\/orders\/[0-9a-f-]+$/)
    await expect(appFrame(manager, title).getByRole('heading', { name: /^Đơn /, level: 1 })).toBeVisible()

    // Products tab: search; a name of spaces is refused with the typed values kept and an alert.
    await manager.goto('/manager/apps/tea-shop/products')
    await app.locator('input[name=q]').fill(product)
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('tbody tr')).toHaveCount(1)
    await manager.goto('/manager/apps/tea-shop')
    const form = app.locator('form', { has: app.getByRole('button', { name: 'Thêm sản phẩm' }) })
    await form.locator('input[name=name]').fill('   ')
    await form.locator('input[name=pack]').fill('Gói 100g')
    await form.locator('input[name=price_vnd]').fill('50000')
    await form.locator('input[name=stock]').fill('5')
    await form.getByRole('button', { name: 'Thêm sản phẩm' }).click()
    await expect(app.locator('[role=alert]').first()).toBeVisible()
    await expect(app.locator('input[name=pack]').first()).toHaveValue('Gói 100g')
    await expectNoOverflow(manager, title)

    // The public page shows products and no personal data of the orders.
    await guest.goto('/apps/tea-shop/public/TC')
    await expect(guest.locator('li.card', { hasText: product })).toBeVisible()
    await expect(guest.locator('body')).not.toContainText('Trần Thị Mai')
    await expectNoOverflow(guest)
  })
  test('farm-supply: overview, rounds list in two pages, two CSV files, print, inline error, farmer cards', async ({ browser }) => {
    const title = 'Vật tư mua chung'
    const stamp = Date.now()
    const round = `Phân bón vụ thu ${stamp}`
    const deadline = `${new Date().getFullYear() + 1}-03-01T17:00`

    // The manager opens 26 plain rounds and one with two items (the list pages by 25).
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    for (let i = 0; i < 26; i++) {
      expect((await postForm(manager.request, '/apps/farm-supply/rounds', [['title', `Đợt thử ${stamp} số ${i}`], ['deadline', deadline]])).status()).toBe(303)
    }
    const created = await postForm(manager.request, '/apps/farm-supply/rounds', [['title', round], ['deadline', deadline]])
    expect(created.status()).toBe(303)
    const roundPath = new URL(created.headers().location, 'http://x').pathname
    for (const [name, unit, price] of [['Phân NPK', 'bao 50kg', '450000'], ['Thuốc trừ sâu sinh học', 'chai', '85000']]) {
      expect((await postForm(manager.request, `${roundPath}/items`, [['name', name], ['unit', unit], ['price_vnd', price]])).status()).toBe(303)
    }

    // The farmer registers 2 bags and 1,5 bottles from the card of the open round.
    const farmer = await newPage(browser)
    await keycloakLogin(farmer, 'smoke_farmer_tc', SMOKE_PASSWORD, 'farmer')
    await menuLink(farmer, 'Đăng ký vật tư').first().click()
    await farmer.waitForURL('**/farmer/apps/farm-supply/mine')
    const farmerApp = appFrame(farmer, title)
    const registration = farmerApp.getByRole('form', { name: `Đăng ký ${round}` })
    await registration.getByLabel('Phân NPK').fill('2')
    await registration.getByLabel('Thuốc trừ sâu sinh học').fill('1,5')
    await registration.getByRole('button', { name: 'Lưu đăng ký' }).click()
    await expect(farmerApp.locator('.notice')).toContainText('Đã lưu thay đổi.')
    await expect(farmerApp.locator('li.card', { hasText: round })).toContainText('1.027.500 ₫')
    await expectNoOverflow(farmer, title)

    // Overview and the rounds list: stats, filter, second page, tab.
    await manager.goto('/manager/apps/farm-supply')
    const app = appFrame(manager, title)
    await expect(app.getByRole('heading', { name: 'Vật tư mua chung', level: 1 })).toBeVisible()
    await expect(app.locator('.stat-label', { hasText: /^Đợt đang mở$/ })).toBeVisible()
    await expect(app.locator('tbody tr')).toHaveCount(PAGE_ROWS)
    await expect(app.locator('.pagination-status')).toContainText('Trang 1/')
    await app.getByRole('link', { name: 'Sau ›' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 2/')
    expect(new URL(manager.url()).pathname).toBe('/manager/apps/farm-supply')
    await app.locator('select[name=status]').selectOption('closed')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('select[name=status]')).toHaveValue('closed')
    await expect.poll(async () => (await app.locator('tbody tr').allInnerTexts()).every(row => row.includes('Đã đóng'))).toBe(true)
    await expectNoOverflow(manager, title)

    // The round: close it, mark one delivery, both CSV files, then the delivery sheet.
    await manager.goto(`/manager${roundPath.replace('/apps/farm-supply', '/apps/farm-supply')}`)
    await expect(app.getByRole('heading', { name: round, level: 1 })).toBeVisible()
    const items = await downloadCsv(manager, app.getByRole('link', { name: 'Tải CSV mặt hàng' }))
    expect(items.name).toMatch(/^farm-supply-TC-/)
    expect(items.text).toContain('Phân NPK')
    const households = await downloadCsv(manager, app.getByRole('link', { name: 'Tải CSV theo hộ' }))
    expect(households.text).toContain('1027500')
    await app.locator('summary', { hasText: 'Đóng đợt đăng ký này' }).click()
    await app.getByRole('button', { name: 'Đóng đợt này' }).click()
    await expect(app.locator('p > .pill').first()).toHaveText('Đã đóng')
    await app.getByRole('button', { name: /Đánh dấu đã giao/ }).click()
    await expect(app.locator('td[data-label="Giao hàng"]')).toContainText('Đã giao')
    await printAndGoBack(manager, app.getByRole('link', { name: 'In bảng kê giao hàng' }), { path: `/manager${roundPath}`, frameTitle: title, heading: round })

    // Inline error: a price that is not a number keeps what was typed and says so under the field (the round is closed, so use a new one).
    const second = await postForm(manager.request, '/apps/farm-supply/rounds', [['title', `Đợt có lỗi ${stamp}`], ['deadline', deadline]])
    await manager.goto(`/manager${new URL(second.headers().location, 'http://x').pathname}`)
    await app.locator('summary', { hasText: 'Thêm mặt hàng mới' }).click()
    const form = app.locator('form', { has: app.getByRole('button', { name: 'Thêm mặt hàng' }) })
    await form.locator('input[name=name]').fill('Phân hữu cơ vi sinh')
    await form.locator('input[name=unit]').fill('bao 25kg')
    await form.locator('input[name=price_vnd]').fill('abc')
    await form.getByRole('button', { name: 'Thêm mặt hàng' }).click()
    await expect(app.locator('input[name=price_vnd]').first()).toHaveValue('abc')
    await expect(app.locator('input[name=price_vnd]').first()).toHaveAttribute('aria-invalid', 'true')
    await expect(app.locator('[role=alert]').first()).toBeVisible()
    await expectNoOverflow(manager, title)
  })

  test('a stored dark theme follows in-app tabs, pagination and the print page', async ({ browser }) => {
    const title = 'Cửa hàng chè'
    // The system says light; the user chose dark in the shell (stored in the browser).
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
    contexts.push(context)
    await context.addInitScript(() => localStorage.setItem('opentea-theme', 'dark'))
    const page = await context.newPage()
    await keycloakLogin(page, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    const frameOf = async () => (await (await page.locator(`iframe[title="${title}"]`).elementHandle())!.contentFrame())!
    const dark = async () => {
      const frame = await frameOf()
      expect(frame.url()).toContain('theme=dark')
      expect(await frame.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark')
    }

    await page.goto('/manager/apps/tea-shop')
    const app = appFrame(page, title)
    await expect(app.getByRole('heading', { level: 1 })).toBeVisible()
    await dark()
    await app.getByRole('navigation', { name: 'Điều hướng trong ứng dụng' }).getByRole('link', { name: 'Đơn hàng' }).click()
    await expect(app.getByRole('heading', { name: 'Đơn hàng', level: 1 })).toBeVisible()
    await dark()
    await app.getByRole('link', { name: 'Sau ›' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 2/')
    await dark()
    await app.locator('input[name=q]').fill('Nguyễn')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('input[name=q]')).toHaveValue('Nguyễn')
    await expect.poll(async () => (await frameOf()).url()).toContain('theme=dark')
    // The print page keeps the choice, and so does the page it returns to.
    await app.locator('tbody tr').first().getByRole('link', { name: 'In phiếu giao' }).click()
    await page.waitForURL(/\/apps\/tea-shop\/orders\/.+\/print.*theme=dark/)
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark')
    await page.getByRole('link', { name: 'Quay lại ứng dụng' }).click()
    await expect(app.getByRole('heading', { level: 1 })).toBeVisible()
    await dark()
  })
})

test.describe('app kit: tea-tour', () => {
  test.skip(process.env.E2E_APP_KIT !== 'tea-tour', 'Needs ./dxos install miniapps/tea-tour and E2E_APP_KIT=tea-tour')
  test.describe.configure({ retries: 0 })
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('tea-tour: overview, tours in two pages, bookings list, guest CSV, group list, error, public page', async ({ browser }) => {
    const title = 'Đặt tour đồi chè'
    const stamp = Date.now()
    const main = `Tour hái chè sáng sớm ${stamp}`
    const guests = ['Nguyễn Văn An', 'Trần Thị Mai', 'Lê Quốc Bảo', 'Phạm Thị Lan', 'Đỗ Minh Tuấn']
    const formulaName = '=HYPERLINK("http://example.invalid","bấm vào đây")'
    const startsAt = (days: number) => `${new Date(Date.now() + 7 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)}T07:30`

    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    const guideOptions = await (await manager.request.get('/apps/tea-tour/')).text()
    const guide = optionValues(guideOptions, 'guide')[0]
    expect(guide).toBeTruthy()
    const tourForm = (name: string, seats: string, days: number): [string, string][] => [
      ['title', name], ['starts_at', startsAt(days)], ['meeting_point', 'Nhà văn hoá xóm Hồng Thái'], ['seats', seats],
      ['price_vnd', '250000'], ['guide', guide], ['description', ''],
    ]
    for (let i = 0; i < 26; i++) {
      expect((await postForm(manager.request, '/apps/tea-tour/tours', tourForm(`Tour thử ${stamp} số ${i}`, '5', 3 + i))).status()).toBe(303)
    }
    const created = await postForm(manager.request, '/apps/tea-tour/tours', tourForm(main, '50', 2))
    expect(created.status()).toBe(303)
    const tourPath = new URL(created.headers().location, 'http://x').pathname

    // A guest on a phone books 27 times (one seat each); the first name looks like a formula.
    const guest = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const tourId = tourPath.split('/').pop()
    for (let i = 0; i < 27; i++) {
      const response = await postForm(guest.request, `/apps/tea-tour/public/TC/tours/${tourId}/book`, [
        ['guest_name', i === 0 ? formulaName : guests[i % guests.length]], ['phone', `09${String(20000000 + i * 7919).slice(0, 8)}`],
        ['party_size', '1'], ['note', ''],
      ])
      expect(response.status(), `booking ${i}`).toBe(303)
    }

    // Overview: stats and the tours list, second page, show filter; the tab keeps the frame.
    await manager.goto('/manager/apps/tea-tour')
    const app = appFrame(manager, title)
    await expect(app.getByRole('heading', { name: 'Tour đồi chè HTX TC', level: 1 })).toBeVisible()
    await expect(app.locator('.stats li').first()).toBeVisible()
    await expect(app.locator('tbody tr')).toHaveCount(PAGE_ROWS)
    await app.getByRole('link', { name: 'Sau ›' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 2/')
    expect(new URL(manager.url()).pathname).toBe('/manager/apps/tea-tour')
    await app.locator('select[name=show]').selectOption('past')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('select[name=show]')).toHaveValue('past')
    await expectNoOverflow(manager, title)

    // Bookings tab: 27 pending bookings of the main tour in two pages; a search by guest name; wildcards are text.
    await app.getByRole('navigation', { name: 'Điều hướng trong ứng dụng' }).getByRole('link', { name: 'Lượt đặt chỗ' }).click()
    await expect(app.getByRole('heading', { name: 'Lượt đặt chỗ', level: 1 })).toBeVisible()
    await expect(app.locator('.pagination-status')).toContainText('Trang 1/')
    await app.getByRole('link', { name: 'Sau ›' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 2/')
    await app.getByRole('link', { name: '‹ Trước' }).click()
    await expect(app.locator('.pagination-status')).toContainText('Trang 1/')
    await app.locator('input[name=q]').fill('Lê Quốc Bảo')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect.poll(async () => {
      const rows = await app.locator('tbody tr').allInnerTexts()
      return rows.length > 0 && rows.every(row => row.includes('Lê Quốc Bảo'))
    }).toBe(true)
    await app.locator('input[name=q]').fill('100%')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expect(app.locator('.empty')).toBeVisible()

    // The tour: confirm one booking, download the guest list, print the group list and come back.
    await manager.goto(`/manager${tourPath}`)
    await expect(app.getByRole('heading', { name: main, level: 1 })).toBeVisible()
    await app.locator('tbody tr').filter({ hasText: guests[1] }).first().getByRole('button', { name: 'Xác nhận' }).click()
    await expect(app.locator('tbody tr').filter({ hasText: 'Đã xác nhận' }).first()).toBeVisible()
    const csv = await downloadCsv(manager, app.getByRole('link', { name: 'Tải CSV' }))
    expect(csv.name).toMatch(/^tea-tour-TC-/)
    expect(csv.text.trim().split('\r\n')).toHaveLength(1 + 27)
    expect(csv.text).toContain(`"'${formulaName.replace(/"/g, '""')}`)
    expect(csv.text).not.toMatch(/(^|,|\r\n)=HYPERLINK/)
    const printed = await printAndGoBack(manager, app.getByRole('link', { name: 'Danh sách đoàn' }), { path: `/manager${tourPath}`, frameTitle: title, heading: main })
    expect(printed).toContain(guests[1])

    // The form refuses a title of spaces; the alert opens the disclosure and the typed values stay.
    await manager.goto('/manager/apps/tea-tour')
    await app.locator('summary', { hasText: 'Tạo tour mới' }).click()
    const form = app.locator('form', { has: app.getByRole('button', { name: 'Tạo tour' }) })
    await form.locator('input[name=title]').fill('   ')
    await form.locator('input[name=starts_at]').fill(startsAt(5))
    await form.locator('input[name=meeting_point]').fill('Nhà văn hoá xóm Hồng Thái')
    await form.locator('input[name=seats]').fill('8')
    await form.locator('input[name=price_vnd]').fill('200000')
    await form.locator('select[name=guide]').selectOption(guide)
    await form.getByRole('button', { name: 'Tạo tour' }).click()
    await expect(app.locator('[role=alert]').first()).toBeVisible()
    await expect(app.locator('input[name=meeting_point]')).toHaveValue('Nhà văn hoá xóm Hồng Thái')
    await expectNoOverflow(manager, title)

    // The public page: cards, a booking form in a disclosure; no personal data of other guests.
    await guest.goto('/apps/tea-tour/public/TC')
    await expect(guest.locator('li.card', { hasText: main })).toBeVisible()
    await expect(guest.locator('body')).not.toContainText('Trần Thị Mai')
    await expectNoOverflow(guest)
  })
})
