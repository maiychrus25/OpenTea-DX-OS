// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// The tea tour story (Tier 3 spec §10) on the real stack, after `npm run seed`, `make platform-smoke` (it links smoke_farmer_tc
// to household hh_tc_1) and `./dxos install miniapps/tea-tour`:
//   E2E_CORE=1 E2E_TEA_TOUR=installed E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/story/tea-tour.spec.ts --project=chromium --no-deps
// After `./dxos remove tea-tour`, the same command with E2E_TEA_TOUR=removed checks that the app is gone. The spec never
// installs or removes the app itself: CI and the operator run ./dxos between the two runs.
import { test, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'

test.skip(!process.env.E2E_CORE, 'Needs the real stack: set E2E_CORE=1')

const MENU_ITEM = 'Tour đồi chè'
const GUIDE_MENU_ITEM = 'Lịch dẫn tour'
const GUIDE_HOUSEHOLD = 'hh_tc_1' // linked to smoke_farmer_tc by smoke-platform.sh

const appFrame = (page: Page) => page.frameLocator('iframe[title="Đặt tour đồi chè"]')
const menuLink = (page: Page, label: string) => page.locator('nav a', { hasText: label })

/** The datetime-local value two days ahead, in Vietnam time (UTC+7), which the app reads its form in. */
const inTwoDays = () => `${new Date(Date.now() + 7 * 3600e3 + 2 * 86400e3).toISOString().slice(0, 10)}T07:30`

test.describe('tea-tour installed', () => {
  test.skip(process.env.E2E_TEA_TOUR !== 'installed', 'Needs ./dxos install miniapps/tea-tour and E2E_TEA_TOUR=installed')

  // Each role gets its own context; all are closed after the test, also when it fails.
  const contexts: BrowserContext[] = []
  const newPage = async (browser: Browser, options: BrowserContextOptions) => {
    const context = await browser.newContext(options)
    contexts.push(context)
    return context.newPage()
  }
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('manager creates a tour, a guest books on a phone, the manager confirms, the guide sees 2 guests', async ({ browser }) => {
    const title = `Tour hái chè sáng sớm ${Date.now()}`

    // The manager opens the app from the menu and creates a tour with a TC household as guide.
    const manager = await newPage(browser, { viewport: { width: 1280, height: 800 } })
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, MENU_ITEM).first().click()
    await manager.waitForURL('**/manager/apps/tea-tour')
    const managerApp = appFrame(manager)
    await managerApp.locator('input[name=title]').fill(title)
    await managerApp.locator('input[name=starts_at]').fill(inTwoDays())
    await managerApp.locator('input[name=meeting_point]').fill('Nhà văn hoá xóm Hồng Thái')
    await managerApp.locator('input[name=seats]').fill('10')
    await managerApp.locator('input[name=price_vnd]').fill('250000')
    await managerApp.locator('select[name=guide]').selectOption(GUIDE_HOUSEHOLD)
    await managerApp.getByRole('button', { name: 'Tạo tour' }).click()
    await expect(managerApp.locator('h1')).toContainText(title)

    // A guest on a phone books 2 seats on the public page, with no account, and sees the booking code.
    const guest = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await guest.goto('/apps/tea-tour/public/TC')
    const tour = guest.getByRole('form', { name: `Đặt chỗ ${title}` })
    await tour.locator('input[name=guest_name]').fill('Nguyễn Thị Hoa')
    await tour.locator('input[name=phone]').fill('0912 345 678')
    await tour.locator('input[name=party_size]').fill('2')
    await tour.getByRole('button', { name: 'Đặt chỗ' }).click()
    await guest.waitForURL('**/apps/tea-tour/public/TC/booking?code=*')
    const code = new URL(guest.url()).searchParams.get('code') ?? ''
    expect(code).toMatch(/^[A-Z2-9]{8}$/)
    await expect(guest.locator('.notice')).toContainText(code)
    const widths = await guest.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
    expect(widths.scroll, `page-level horizontal overflow: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(widths.inner)

    // The manager confirms the booking.
    await manager.goto('/manager/apps/tea-tour')
    await managerApp.getByRole('link', { name: title }).click()
    const booking = managerApp.getByRole('form', { name: `Lượt đặt ${code}` })
    await booking.getByRole('button', { name: 'Xác nhận' }).click()
    await expect(booking.locator('.pill')).toHaveText('Đã xác nhận')
    await expect(managerApp.locator('main')).toContainText('Đã xác nhận 2 khách')

    // The guide farmer sees the tour with its 2 confirmed guests.
    const farmer = await newPage(browser, { viewport: { width: 1280, height: 800 } })
    await keycloakLogin(farmer, 'smoke_farmer_tc', SMOKE_PASSWORD, 'farmer')
    await menuLink(farmer, GUIDE_MENU_ITEM).first().click()
    await farmer.waitForURL('**/farmer/apps/tea-tour/guide')
    const row = appFrame(farmer).locator('tbody tr', { hasText: title })
    await expect(row.locator('td[data-label="Khách đã xác nhận"]')).toHaveText('2')
    await expect(row.locator('td[data-label="Trạng thái"]')).toHaveText('Đang nhận khách')
  })
})

test.describe('tea-tour removed', () => {
  test.skip(process.env.E2E_TEA_TOUR !== 'removed', 'Needs ./dxos remove tea-tour and E2E_TEA_TOUR=removed')

  test('the menu no longer shows the app and its public page answers 404', async ({ page }) => {
    await keycloakLogin(page, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await page.reload()
    await expect(menuLink(page, 'Tổng quan').first()).toBeVisible()
    await expect(menuLink(page, MENU_ITEM)).toHaveCount(0)
    expect((await page.request.get('/apps/tea-tour/public/TC')).status()).toBe(404)
  })
})
