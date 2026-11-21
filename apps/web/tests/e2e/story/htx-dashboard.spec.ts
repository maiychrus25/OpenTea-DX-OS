// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// The cooperative dashboard end to end on the real stack (spec docs/specs/2026-11-20-htx-dashboard-design.md §9): the manager opens
// Tổng quan from the menu, goes to Vùng trồng, opens a parcel that has readings and finds the newest figure and the daily charts of the
// seeded data; the silent sensor shows in Dữ liệu; CSV and print work; a parcel of another cooperative is not found; the other roles
// get no menu entry. After `npm run seed`, `make platform-up`, `make platform-smoke` (smoke_ users), `make web-up`,
// `./dxos install miniapps/htx-dashboard` and the readings of platform/tests/fixtures/htx-dashboard-readings.sql:
//   E2E_CORE=1 E2E_HTX_DASHBOARD=installed E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/story/htx-dashboard.spec.ts --project=chromium --no-deps
// The figures are those of the seed: TC-A1's newest soil moisture is 47,3 and 40 readings of it lie in the last 10 days; the rainfall sensor
// of TC-B2 has been silent for 24 hours. The spec never installs or removes the app: CI and the operator run ./dxos around it.
import { test, expect, Browser, BrowserContext, BrowserContextOptions, FrameLocator, Page } from '@playwright/test'
import { SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'
import { appFrame, downloadCsv, expectFrameUrl, expectNoOverflow, printAndGoBack } from '../helpers/app-kit'

test.skip(!process.env.E2E_CORE || process.env.E2E_HTX_DASHBOARD !== 'installed', 'Needs the real stack, the installed app and its seed: set E2E_CORE=1 and E2E_HTX_DASHBOARD=installed')

const APP_NAME = 'Bảng điều hành HTX'
const MENU_ITEM = 'Bảng điều hành'
const BASE = '/manager/apps/htx-dashboard'
const BLOCK_ERROR = 'Chưa lấy được dữ liệu'

const menuLink = (page: Page, label: string) => page.locator('nav a', { hasText: label })
const tab = (app: FrameLocator, name: string) => app.getByRole('navigation', { name: 'Điều hướng trong ứng dụng' }).getByRole('link', { name, exact: true })
const heading = (app: FrameLocator, name: string | RegExp) => expect(app.getByRole('heading', { name, level: 1 })).toBeVisible()
/** The page has loaded its blocks: none of them shows the error text that stands in for a block the core did not answer. */
const noBlockError = (app: FrameLocator) => expect(app.locator('body')).not.toContainText(BLOCK_ERROR)

test.describe('htx-dashboard installed', () => {
  test.describe.configure({ retries: 0, mode: 'serial', timeout: 180_000 })
  test.use({ actionTimeout: 15_000 })

  const contexts: BrowserContext[] = []
  const newPage = async (browser: Browser, options: BrowserContextOptions) => {
    const context = await browser.newContext(options)
    contexts.push(context)
    return context.newPage()
  }
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('the manager reads the cooperative: overview, a parcel with readings and charts, the silent sensor, CSV, print', async ({ browser }) => {
    const manager = await newPage(browser, { viewport: { width: 1280, height: 800 } })
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, MENU_ITEM).first().click()
    await manager.waitForURL(`**${BASE}`)
    const app = appFrame(manager, APP_NAME)

    // Tổng quan: the silent sensor of the seed is among the things to watch, and no block failed.
    await heading(app, 'Tổng quan HTX TC')
    await expect(app.locator('li[data-attention="sensor"]')).toBeVisible()
    await expect(app.locator('.stats').first()).toBeVisible()
    await noBlockError(app)
    await expectNoOverflow(manager, APP_NAME)

    // Vùng trồng, filtered to the parcel: its newest soil moisture is on the row.
    await tab(app, 'Vùng trồng').click()
    await heading(app, 'Vùng trồng')
    await app.locator('input[name=q]').fill('TC-A1')
    await app.getByRole('button', { name: 'Lọc' }).click()
    await expectFrameUrl(manager, APP_NAME, 'q=TC-A1')  // the frame has navigated before anything is read
    await heading(app, 'Vùng trồng')
    const row = app.locator('tbody tr', { hasText: 'TC-A1' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('47,3')
    await noBlockError(app)

    // The digital twin of the parcel: one card and one chart for each of the five sensors, the figures of the seed.
    await row.getByRole('link', { name: 'TC-A1', exact: true }).click()
    await heading(app, 'Thửa TC-A1')
    const soil = app.locator('article.sensor-card', { hasText: 'Độ ẩm đất' })
    await expect(soil).toContainText('47,3')
    await expect(soil).toContainText('Trong 30 ngày qua, 40 số đo')
    await expect(app.locator('article.sensor-card')).toHaveCount(5)
    await expect(app.locator('svg.line-chart')).toHaveCount(5)
    await expect(app.getByRole('heading', { name: 'Nhiệt độ không khí', level: 3 })).toBeVisible()
    await noBlockError(app)
    await expectNoOverflow(manager, APP_NAME)

    // Dữ liệu: the silent sensor of TC-B2 is listed, and its parcel page says so.
    await manager.goto(`${BASE}/data`)
    await heading(app, 'Dữ liệu cảm biến')
    // Scoped to the list of silent sensors: the freshness matrix of 0.2.0 has a row for TC-B2 as well.
    const silent = app.locator('section[aria-labelledby="silent-title"] tbody tr', { hasText: 'TC-B2' }).filter({ hasText: 'Lượng mưa' })
    await expect(silent).toHaveCount(1)
    await noBlockError(app)
    await silent.getByRole('link', { name: 'TC-B2', exact: true }).click()
    await heading(app, 'Thửa TC-B2')
    await expect(app.locator('article.sensor-card.silent', { hasText: 'Lượng mưa' })).toContainText('Không gửi số đo quá 6 giờ')

    // A parcel of the other cooperative is not found, and the page leaks nothing of it.
    await manager.goto(`${BASE}/parcels/LB-A1`)
    await expect(app.getByText('Không tìm thấy thửa LB-A1')).toBeVisible()
    await expect(app.locator('body')).not.toContainText('11,1')

    // CSV and the print page of the parcel list; the way back lands on the list inside the shell.
    await manager.goto(`${BASE}/parcels`)
    await heading(app, 'Vùng trồng')
    const csv = await downloadCsv(manager, app.getByRole('link', { name: 'Tải CSV' }))
    expect(csv.name).toMatch(/^htx-dashboard-TC-vung-trong-/)
    expect(csv.text).toContain('Mã thửa')
    expect(csv.text).toContain('TC-A1')
    expect(csv.text).toContain('Độ ẩm đất: 47,3')
    await printAndGoBack(manager, app.getByRole('link', { name: 'Bản in' }), { path: `${BASE}/parcels`, frameTitle: APP_NAME, heading: 'Vùng trồng' })
  })

  test('on a phone every tab fits the screen and shows no block error', async ({ browser }) => {
    const phone = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await keycloakLogin(phone, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    const app = appFrame(phone, APP_NAME)
    const tabs: [string, string][] = [['', 'Tổng quan HTX TC'], ['/production', 'Sản xuất'], ['/parcels', 'Vùng trồng'], ['/parcels/TC-A1', 'Thửa TC-A1'],
      ['/health', 'Sức khoẻ cây'], ['/lots', 'Lô chè'], ['/data', 'Dữ liệu cảm biến']]
    for (const [path, title] of tabs) {
      await phone.goto(`${BASE}${path}`)
      await heading(app, title)
      await noBlockError(app)
      await expectNoOverflow(phone, APP_NAME)
    }
  })

  test('the officer and the farmer get no menu entry', async ({ browser }) => {
    for (const [user, role] of [['smoke_officer_tc', 'officer'], ['smoke_farmer_tc', 'farmer']] as const) {
      const page = await newPage(browser, { viewport: { width: 1280, height: 800 } })
      await keycloakLogin(page, user, SMOKE_PASSWORD, role)
      await expect(page.locator('nav').first()).toBeVisible()
      await expect(menuLink(page, MENU_ITEM)).toHaveCount(0)
      await expect(page.locator('a[href*="htx-dashboard"]')).toHaveCount(0)
    }
  })
})
