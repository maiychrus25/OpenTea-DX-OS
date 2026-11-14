// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Tool, not a test: captures the store screenshots of the four apps that have them into miniapps/<id>/store/ (spec §8). It writes sample
// data through the apps (Vietnamese sample names, no real people) and takes the page of each app at 1280x800, light theme, without the shell.
// Needs a fresh stack after `npm run seed`, `make platform-smoke`, `./dxos worker` running, leaf-purchase, farm-supply and tea-tour installed with
// `./dxos install`, and tea-shop installed for TC (from the App Store page). Run from apps/web:
//   E2E_CORE=1 E2E_STORE_SHOTS=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/tools/store-screenshots.spec.ts --project=chromium --no-deps
import { test, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'

test.skip(!process.env.E2E_CORE || !process.env.E2E_STORE_SHOTS, 'Tool: set E2E_CORE=1 and E2E_STORE_SHOTS=1')

const MAX_BYTES = 409_600
const DESKTOP = { width: 1280, height: 800 }
const menuLink = (page: Page, label: string) => page.locator('nav a', { hasText: label })
const appFrame = (page: Page, title: string) => page.frameLocator(`iframe[title="${title}"]`)

/** Saves miniapps/<app>/store/<name>.png: the frame filling the whole window (the app page only), or the page itself. */
async function capture(page: Page, app: string, name: string, frameTitle?: string, scrollTo?: string) {
  if (frameTitle) {
    await page.evaluate(title => {
      const frame = document.querySelector<HTMLElement>(`iframe[title="${title}"]`)!
      frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;border:0;background:#fff'
    }, frameTitle)
    await appFrame(page, frameTitle).locator('html').evaluate(root => root.ownerDocument.defaultView?.scrollTo(0, 0))
    // A long page can show the part that matters: the element goes to the top of the window.
    if (scrollTo) await appFrame(page, frameTitle).locator(scrollTo).first().evaluate(el => el.scrollIntoView({ block: 'start' }))
  }
  const dir = resolve(process.cwd(), '../../miniapps', app, 'store')
  mkdirSync(dir, { recursive: true })
  const path = resolve(dir, `${name}.png`)
  await page.screenshot({ path })
  expect(statSync(path).size, `${path} is over 400 KB`).toBeLessThanOrEqual(MAX_BYTES)
}

/** A past date (Vietnam time) the apps accept for a weighing. */
const daysAgo = (n: number) => new Date(Date.now() + 7 * 3600e3 - n * 86400e3).toISOString().slice(0, 10)

test.describe('store screenshots', () => {
  test.describe.configure({ retries: 0 })
  const contexts: BrowserContext[] = []
  const newPage = async (browser: Browser, options: BrowserContextOptions = { viewport: DESKTOP }) => {
    const context = await browser.newContext({ colorScheme: 'light', ...options })
    contexts.push(context)
    return context.newPage()
  }
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('leaf-purchase', async ({ browser }) => {
    const title = 'Thu mua búp tươi'
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, 'Kỳ thanh toán').first().click()
    await manager.waitForURL('**/manager/apps/leaf-purchase/periods')
    const managerApp = appFrame(manager, title)
    await managerApp.getByRole('link', { name: 'Giá thu mua' }).click()
    for (const [name, price] of [['Búp tươi loại 1', '9000'], ['Búp tươi loại 2', '7500']]) {
      // The form is open while there is no grade yet, closed after that.
      const add = managerApp.locator('details.disclosure', { has: managerApp.locator('summary', { hasText: 'Thêm loại chè' }) })
      if ((await add.getAttribute('open')) === null) await add.locator('summary').click()
      await managerApp.locator('input[name=name]').fill(name)
      await managerApp.locator('input[name=price_vnd]').last().fill(price)
      await managerApp.getByRole('button', { name: 'Thêm loại chè' }).click()
      await expect(managerApp.locator('td[data-label="Loại chè"]', { hasText: name })).toBeVisible()
    }

    const officer = await newPage(browser)
    await keycloakLogin(officer, 'smoke_officer_tc', SMOKE_PASSWORD, 'officer')
    await menuLink(officer, title).first().click()
    await officer.waitForURL('**/officer/apps/leaf-purchase')
    const officerApp = appFrame(officer, title)
    // [household option, grade option, kg]; option 0 is the placeholder. The households with real-looking names come after the two demo ones.
    await expect(officerApp.locator('select[name=household]')).toBeVisible()
    const options = await officerApp.locator('select[name=household] option').evaluateAll(all => all.map(option => option.textContent ?? ''))
    const named = options.flatMap((label, index) => (index > 0 && !label.startsWith('Household') ? [index] : []))
    expect(named.length, 'households with real-looking names in the seed').toBeGreaterThan(1)
    const tickets: [number, number, string][] = [[named[0], 1, '14,5'], [named[1], 1, '9'], [named[named.length - 1], 2, '11,5'], [named[0], 2, '6']]
    for (const [count, [household, grade, kg]] of Array.from(tickets.entries())) {
      const form = officerApp.locator('form', { has: officerApp.getByRole('button', { name: 'Ghi phiếu' }) })
      await form.locator('select[name=household]').selectOption({ index: household })
      await form.locator('input[name=weighed_on]').fill(daysAgo(3))
      await form.locator('select[name=grade]').selectOption({ index: grade })
      await form.locator('input[name=kg]').fill(kg)
      await form.getByRole('button', { name: 'Ghi phiếu' }).click()
      // The previous notice is still on the page until the reload, so wait for the new row instead.
      await expect(officerApp.locator('tbody tr')).toHaveCount(count + 1)
    }
    await officer.goto('/officer/apps/leaf-purchase/tickets')
    await expect(officerApp.locator('tbody tr')).toHaveCount(4)
    await capture(officer, 'leaf-purchase', 'officer-tickets', title)

    await manager.goto('/manager/apps/leaf-purchase/periods')
    await managerApp.locator('summary', { hasText: 'Chốt kỳ mới' }).click()
    const closing = managerApp.locator('form', { has: managerApp.getByRole('button', { name: 'Chốt kỳ' }) })
    await closing.locator('input[name=date_from]').fill(daysAgo(3))
    await closing.locator('input[name=date_to]').fill(daysAgo(3))
    await closing.getByRole('button', { name: 'Chốt kỳ' }).click()
    await expect(managerApp.locator('tr', { hasText: 'Chưa trả' }).first()).toBeVisible()
    await managerApp.getByRole('button', { name: 'Đã trả' }).first().click()
    await expect(managerApp.locator('.pill', { hasText: 'Đã trả' }).first()).toBeVisible()
    await capture(manager, 'leaf-purchase', 'manager-period', title)
  })

  test('tea-shop', async ({ browser }) => {
    const title = 'Cửa hàng chè'
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, title).first().click()
    await manager.waitForURL('**/manager/apps/tea-shop')
    const managerApp = appFrame(manager, title)
    const products: [string, string, string, string][] = [
      ['Chè Tân Cương móc câu', 'Gói 200g', '180000', '40'],
      ['Chè Shan tuyết cổ thụ', 'Hộp 100g', '350000', '20'],
      ['Trà xanh túi lọc', 'Hộp 25 túi', '65000', '60'],
    ]
    for (const [name, pack, price, stock] of products) {
      await managerApp.locator('input[name=name]').fill(name)
      await managerApp.locator('input[name=pack]').fill(pack)
      await managerApp.locator('input[name=price_vnd]').fill(price)
      await managerApp.locator('input[name=stock]').fill(stock)
      await managerApp.locator('input[name=active]').check()
      await managerApp.getByRole('button', { name: 'Thêm sản phẩm' }).click()
      await expect(managerApp.getByRole('link', { name })).toBeVisible()
    }

    const guest = await newPage(browser)
    const customers: [string, string, string, string][] = [
      ['Nguyễn Văn An', '0912 345 678', 'Xóm Hồng Thái, xã Tân Cương, Thái Nguyên', '2'],
      ['Trần Thị Mai', '0987 654 321', 'Số 12 đường Hoàng Văn Thụ, Thái Nguyên', '1'],
    ]
    for (const [name, phone, address, quantity] of customers) {
      await guest.goto('/apps/tea-shop/public/TC')
      const order = guest.getByRole('form', { name: 'Đặt hàng' })
      await order.locator('li.card', { hasText: products[0][0] }).locator('input[name=quantity]').fill(quantity)
      await order.locator('input[name=customer_name]').fill(name)
      await order.locator('input[name=phone]').fill(phone)
      await order.locator('input[name=address]').fill(address)
      await order.getByRole('button', { name: 'Đặt hàng' }).click()
      await guest.waitForURL('**/apps/tea-shop/public/TC/order?code=*')
    }
    await guest.goto('/apps/tea-shop/public/TC')
    await expect(guest.getByRole('form', { name: 'Đặt hàng' })).toBeVisible()
    await capture(guest, 'tea-shop', 'public-order')

    await manager.goto('/manager/apps/tea-shop/orders')
    await expect(managerApp.locator('tbody tr')).toHaveCount(customers.length)
    await capture(manager, 'tea-shop', 'manager-orders', title)
  })

  test('farm-supply', async ({ browser }) => {
    const title = 'Vật tư mua chung'
    const round = 'Phân bón vụ xuân'
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, title).first().click()
    await manager.waitForURL('**/manager/apps/farm-supply')
    const managerApp = appFrame(manager, title)
    await managerApp.locator('summary', { hasText: 'Mở đợt đăng ký mới' }).click()
    await managerApp.locator('input[name=title]').fill(round)
    await managerApp.locator('input[name=deadline]').fill(`${new Date().getFullYear() + 1}-03-01T17:00`)
    await managerApp.getByRole('button', { name: 'Mở đợt' }).click()
    await expect(managerApp.locator('h1')).toContainText(round)
    const items: [string, string, string][] = [['Phân NPK', 'bao 50kg', '450000'], ['Phân hữu cơ vi sinh', 'bao 25kg', '180000'], ['Thuốc trừ sâu sinh học', 'chai', '85000']]
    for (const [name, unit, price] of items) {
      await managerApp.locator('summary', { hasText: 'Thêm mặt hàng mới' }).click()
      const form = managerApp.locator('form', { has: managerApp.getByRole('button', { name: 'Thêm mặt hàng' }) })
      await form.locator('input[name=name]').fill(name)
      await form.locator('input[name=unit]').fill(unit)
      await form.locator('input[name=price_vnd]').fill(price)
      await form.getByRole('button', { name: 'Thêm mặt hàng' }).click()
      await expect(managerApp.locator('td[data-label="Mặt hàng"]', { hasText: name })).toBeVisible()
    }

    const farmer = await newPage(browser)
    await keycloakLogin(farmer, 'smoke_farmer_tc', SMOKE_PASSWORD, 'farmer')
    await menuLink(farmer, 'Đăng ký vật tư').first().click()
    await farmer.waitForURL('**/farmer/apps/farm-supply/mine')
    const farmerApp = appFrame(farmer, title)
    const registration = farmerApp.getByRole('form', { name: `Đăng ký ${round}` })
    await registration.getByLabel('Phân NPK').fill('3')
    await registration.getByLabel('Phân hữu cơ vi sinh').fill('2')
    await registration.getByLabel('Thuốc trừ sâu sinh học').fill('1,5')
    await registration.getByRole('button', { name: 'Lưu đăng ký' }).click()
    await expect(farmerApp.locator('.notice')).toContainText('Đã lưu thay đổi.')
    await capture(farmer, 'farm-supply', 'farmer-register', title)

    await manager.goto('/manager/apps/farm-supply')
    await managerApp.getByRole('link', { name: round }).click()
    await expect(managerApp.locator('td[data-label="Phải trả"]')).toBeVisible()
    await capture(manager, 'farm-supply', 'manager-round', title)
  })

  test('tea-tour', async ({ browser }) => {
    const title = 'Tour hái chè sáng sớm'
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, 'Tour đồi chè').first().click()
    await manager.waitForURL('**/manager/apps/tea-tour')
    const managerApp = appFrame(manager, 'Đặt tour đồi chè')
    await managerApp.locator('summary', { hasText: 'Tạo tour mới' }).click()
    await managerApp.locator('input[name=title]').fill(title)
    await managerApp.locator('input[name=starts_at]').fill(`${new Date(Date.now() + 7 * 3600e3 + 4 * 86400e3).toISOString().slice(0, 10)}T07:30`)
    await managerApp.locator('input[name=meeting_point]').fill('Nhà văn hoá xóm Hồng Thái')
    await managerApp.locator('input[name=seats]').fill('12')
    await managerApp.locator('input[name=price_vnd]').fill('250000')
    await managerApp.locator('select[name=guide]').selectOption({ label: 'Hoàng Văn Tâm' })
    await managerApp.getByRole('button', { name: 'Tạo tour' }).click()
    await expect(managerApp.locator('h1')).toContainText(title)

    const guest = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const bookings: [string, string, string][] = [['Nguyễn Văn An', '0912 345 678', '3'], ['Trần Thị Mai', '0987 654 321', '2'], ['Lê Quốc Bảo', '0903 112 233', '4']]
    for (const [name, phone, size] of bookings) {
      await guest.goto('/apps/tea-tour/public/TC')
      await guest.locator('li.card', { hasText: title }).locator('summary', { hasText: 'Đặt chỗ' }).click()
      const form = guest.getByRole('form', { name: `Đặt chỗ ${title}` })
      await form.locator('input[name=guest_name]').fill(name)
      await form.locator('input[name=phone]').fill(phone)
      await form.locator('input[name=party_size]').fill(size)
      await form.getByRole('button', { name: 'Đặt chỗ' }).click()
      await guest.waitForURL('**/apps/tea-tour/public/TC/booking?code=*')
    }

    await manager.goto('/manager/apps/tea-tour')
    await managerApp.getByRole('link', { name: title }).click()
    // Two of the three are confirmed; the third stays pending, so the page shows both tones.
    for (const [name] of bookings.slice(0, 2)) {
      await managerApp.locator('tbody tr', { hasText: name }).getByRole('button', { name: 'Xác nhận' }).click()
      await expect(managerApp.locator('tbody tr', { hasText: name })).toContainText('Đã xác nhận')
    }
    await expect(managerApp.locator('.stats li', { hasText: 'Khách đã xác nhận' })).toContainText('5')
    await capture(manager, 'tea-tour', 'manager-tour', 'Đặt tour đồi chè')
  })

  test('custom-books', async ({ browser }) => {
    const title = 'Sổ tự tạo'
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await manager.goto('/manager/apps/custom-books/books/new')
    const managerApp = appFrame(manager, title)
    await managerApp.locator('li.card', { hasText: 'Chấm công hái chè' }).getByRole('button', { name: 'Dùng mẫu này' }).click()
    await expect(managerApp.getByRole('heading', { name: 'Thiết kế sổ', level: 1 })).toBeVisible()
    const bookId = /books\/([0-9a-f-]{36})\/design/.exec((await managerApp.locator('form[action*="/design"]').getAttribute('action'))!)![1]
    await capture(manager, 'custom-books', 'designer', title, 'table.form-table')

    await manager.goto(`/manager/apps/custom-books/books/${bookId}/design`)
    await managerApp.getByRole('button', { name: 'Phát hành', exact: true }).click()
    await expect(managerApp.getByRole('heading', { name: 'Chấm công hái chè', level: 1 })).toBeVisible()

    // The officer writes four rows for different households (the seed's real-looking names come after the two demo ones).
    const officer = await newPage(browser)
    await keycloakLogin(officer, 'smoke_officer_tc', SMOKE_PASSWORD, 'officer')
    const form = await (await officer.request.get(`/apps/custom-books/b/${bookId}/new`)).text()
    const households = Array.from((/<select[^>]*name="f2"[^>]*>([\s\S]*?)<\/select>/.exec(form)?.[1] ?? '').matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)</g))
      .filter(match => !match[2].startsWith('Household'))
    expect(households.length, 'households with real-looking names in the seed').toBeGreaterThan(1)
    const rows: [number, string, string, string][] = [[0, daysAgo(0), '18,5', 'Chè búp tươi'], [1, daysAgo(1), '12', 'Một tôm hai lá'], [households.length - 1, daysAgo(1), '9,5', 'Chè búp tươi'], [0, daysAgo(2), '21', 'Chè già']]
    for (const [household, day, kg, kind] of rows) {
      const response = await officer.request.post(`/apps/custom-books/b/${bookId}/records`, {
        data: new URLSearchParams([['f1', day], ['f2', households[household][1]], ['f3', kg], ['f4', kind]]).toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        maxRedirects: 0,
      })
      expect(response.status()).toBe(303)
    }
    await manager.goto(`/manager/apps/custom-books/b/${bookId}`)
    await expect(managerApp.locator('tbody tr')).toHaveCount(4)
    // Three of the four are approved; the last stays pending, so the page shows both tones.
    const awaiting = managerApp.locator('tbody tr', { has: managerApp.getByRole('button', { name: 'Duyệt' }) })
    for (let i = 0; i < 3; i++) {
      await expect(awaiting).toHaveCount(4 - i)
      await awaiting.last().getByRole('button', { name: 'Duyệt' }).click()
    }
    await expect(awaiting).toHaveCount(1)
    await expect(managerApp.locator('tbody tr', { hasText: 'Chờ duyệt' })).toHaveCount(1)
    await manager.goto(`/manager/apps/custom-books/b/${bookId}`)
    await expect(managerApp.locator('tbody tr')).toHaveCount(4)
    await capture(manager, 'custom-books', 'book-in-use', title)
  })
})
