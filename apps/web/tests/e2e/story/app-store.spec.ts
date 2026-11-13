// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// The App Store story (spec §4, §6) on the real stack, after `npm run seed`, `make platform-smoke` (it creates the smoke_ users) and with
// `./dxos worker` running. tea-shop must not be installed when it starts; it is installed for TC when it ends:
//   E2E_CORE=1 E2E_APP_STORE=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/story/app-store.spec.ts --project=chromium --no-deps
// The spec drives the worker through the page only: it never runs ./dxos itself.
import { test, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'

test.skip(!process.env.E2E_CORE || !process.env.E2E_APP_STORE, 'Needs the real stack and ./dxos worker: set E2E_CORE=1 and E2E_APP_STORE=1')

const APP_NAME = 'Cửa hàng chè'
// A reinstall that has to build the image can take minutes on a cold runner.
const INSTALL_MS = 240_000

const appFrame = (page: Page) => page.frameLocator(`iframe[title="${APP_NAME}"]`)
const menuLink = (page: Page, label: string) => page.locator('nav a', { hasText: label })
const card = (page: Page) => page.locator('li', { has: page.getByRole('heading', { name: APP_NAME, level: 2 }) })

async function openStore(page: Page) {
  await menuLink(page, 'Kho ứng dụng').first().click()
  await page.waitForURL('**/manager/app-store')
  await expect(page.getByRole('heading', { name: 'Kho ứng dụng', level: 1 })).toBeVisible()
}

async function installFromStore(page: Page) {
  await card(page).getByRole('button', { name: 'Cài', exact: true }).click()
  await expect(card(page).getByText('Đã cài', { exact: true })).toBeVisible({ timeout: INSTALL_MS })
}

test.describe('App Store', () => {
  // The story changes what is installed, so a retry would start from a different state.
  test.describe.configure({ retries: 0 })

  const contexts: BrowserContext[] = []
  const newPage = async (browser: Browser, options: BrowserContextOptions) => {
    const context = await browser.newContext(options)
    contexts.push(context)
    return context.newPage()
  }
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('TC installs the shop, LB does not see it, a guest orders, TC removes and reinstalls it', async ({ browser }) => {
    const product = `Chè Shan Tuyết ${Date.now()}`

    // TC's manager installs the shop and sees the pill change while the worker runs.
    const manager = await newPage(browser, { viewport: { width: 1280, height: 800 } })
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await openStore(manager)
    await expect(card(manager).getByText('Chưa cài', { exact: true })).toBeVisible()
    await card(manager).getByRole('button', { name: 'Cài', exact: true }).click()
    await expect(card(manager).getByText('Đang cài…', { exact: true })).toBeVisible()
    await expect(card(manager).getByText('Đã cài', { exact: true })).toBeVisible({ timeout: INSTALL_MS })
    // The page refreshes the menu on its own when the install ends.
    await expect(menuLink(manager, APP_NAME).first()).toBeVisible()

    // LB's manager has not installed it: not in the menu, card says so, the public page answers 404.
    const other = await newPage(browser, { viewport: { width: 1280, height: 800 } })
    await keycloakLogin(other, 'smoke_manager_lb', SMOKE_PASSWORD, 'manager')
    await expect(menuLink(other, APP_NAME)).toHaveCount(0)
    await openStore(other)
    await expect(card(other).getByText('Chưa cài', { exact: true })).toBeVisible()
    expect((await other.request.get('/apps/tea-shop/public/LB')).status()).toBe(404)

    // TC's manager adds a product in the app.
    await menuLink(manager, APP_NAME).first().click()
    await manager.waitForURL('**/manager/apps/tea-shop')
    const managerApp = appFrame(manager)
    await managerApp.locator('input[name=name]').fill(product)
    await managerApp.locator('input[name=pack]').fill('Gói 200g')
    await managerApp.locator('input[name=price_vnd]').fill('95000')
    await managerApp.locator('input[name=stock]').fill('10')
    await managerApp.locator('input[name=active]').check()
    await managerApp.getByRole('button', { name: 'Thêm sản phẩm' }).click()
    await expect(managerApp.getByRole('link', { name: product })).toBeVisible()

    // A guest on a phone orders 2 packs on the public page, with no account.
    const guest = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await guest.goto('/apps/tea-shop/public/TC')
    const order = guest.getByRole('form', { name: 'Đặt hàng' })
    await order.locator('section', { hasText: product }).locator('input[name=quantity]').fill('2')
    await order.locator('input[name=customer_name]').fill('Nguyễn Thị Hoa')
    await order.locator('input[name=phone]').fill('0912 345 678')
    await order.locator('input[name=address]').fill('Xóm Hồng Thái, xã Tân Cương')
    await order.getByRole('button', { name: 'Đặt hàng' }).click()
    await guest.waitForURL('**/apps/tea-shop/public/TC/order?code=*')
    const code = new URL(guest.url()).searchParams.get('code') ?? ''
    expect(code).toMatch(/^[A-Z2-9]{8}$/)
    await expect(guest.locator('.notice')).toContainText(code)
    const widths = await guest.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
    expect(widths.scroll, `page-level horizontal overflow: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(widths.inner)

    // The manager moves the order along.
    await manager.goto('/manager/apps/tea-shop')
    await managerApp.getByRole('link', { name: code }).click()
    await managerApp.getByRole('button', { name: 'Xác nhận đơn' }).click()
    await expect(managerApp.locator('h1 .pill')).toHaveText('Đã xác nhận')

    // Removing keeps the data: the menu item goes, the order is there again after the reinstall.
    await openStore(manager)
    manager.once('dialog', dialog => dialog.accept())
    await card(manager).getByRole('button', { name: 'Gỡ', exact: true }).click()
    await expect(card(manager).getByText('Chưa cài', { exact: true })).toBeVisible({ timeout: INSTALL_MS })
    await expect(menuLink(manager, 'Tổng quan').first()).toBeVisible()
    await expect(menuLink(manager, APP_NAME)).toHaveCount(0)

    await installFromStore(manager)
    await manager.goto('/manager/apps/tea-shop')
    await expect(managerApp.getByRole('link', { name: code })).toBeVisible({ timeout: 60_000 })
    await expect(managerApp.locator('tr', { hasText: code }).locator('td[data-label="Trạng thái"]')).toHaveText('Đã xác nhận')
  })
})
