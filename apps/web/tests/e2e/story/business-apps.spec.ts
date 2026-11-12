// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// The business mini-app stories (spec §5) on the real stack, after `npm run seed`, `make platform-smoke` (it creates the smoke_ users and
// links smoke_farmer_tc to household hh_tc_1), `./dxos install miniapps/leaf-purchase` and `./dxos install miniapps/farm-supply`:
//   E2E_CORE=1 E2E_BUSINESS_APPS=installed E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/story/business-apps.spec.ts --project=chromium --no-deps
// The tea-shop story is in app-store.spec.ts. Each run writes to its own date and round title, so it can run twice on one stack.
import { test, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'

test.skip(!process.env.E2E_CORE, 'Needs the real stack: set E2E_CORE=1')
test.skip(process.env.E2E_BUSINESS_APPS !== 'installed', 'Needs ./dxos install of leaf-purchase and farm-supply and E2E_BUSINESS_APPS=installed')

const FARMER_HOUSEHOLD = 'hh_tc_1' // linked to smoke_farmer_tc by smoke-platform.sh

const appFrame = (page: Page, title: string) => page.frameLocator(`iframe[title="${title}"]`)
const menuLink = (page: Page, label: string) => page.locator('nav a', { hasText: label })

/** A past date unique to this run (the app refuses to write into a closed period, so a run needs a day of its own). */
function runDay() {
  const back = (Math.floor(Date.now() / 1000) % 3000) + 30
  return new Date(Date.now() + 7 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)
}
const vnDate = (iso: string) => iso.split('-').reverse().join('/')

test.describe('business apps', () => {
  // Writes into periods and rounds that cannot be written twice.
  test.describe.configure({ retries: 0 })

  const contexts: BrowserContext[] = []
  const newPage = async (browser: Browser, options: BrowserContextOptions = { viewport: { width: 1280, height: 800 } }) => {
    const context = await browser.newContext(options)
    contexts.push(context)
    return context.newPage()
  }
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('leaf-purchase: the officer writes two tickets, the manager closes a period, the farmer sees the payout', async ({ browser }) => {
    const title = 'Thu mua búp tươi'
    const day = runDay()
    const grade = `Búp tươi loại 1 ${Date.now()}`

    // The manager sets a price for a grade.
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, 'Kỳ thanh toán').first().click()
    await manager.waitForURL('**/manager/apps/leaf-purchase/periods')
    const managerApp = appFrame(manager, title)
    await managerApp.getByRole('link', { name: 'Giá thu mua' }).click()
    await managerApp.locator('input[name=name]').fill(grade)
    await managerApp.locator('input[name=price_vnd]').last().fill('9000')
    await managerApp.getByRole('button', { name: 'Thêm loại chè' }).click()
    await expect(managerApp.locator('td[data-label="Loại chè"]', { hasText: grade })).toBeVisible()

    // The officer writes two tickets for the same household: 12,5 kg and 8 kg at 9.000 ₫.
    const officer = await newPage(browser)
    await keycloakLogin(officer, 'smoke_officer_tc', SMOKE_PASSWORD, 'officer')
    await menuLink(officer, title).first().click()
    await officer.waitForURL('**/officer/apps/leaf-purchase')
    const officerApp = appFrame(officer, title)
    for (const kg of ['12,5', '8']) {
      const form = officerApp.locator('form', { has: officerApp.getByRole('button', { name: 'Ghi phiếu' }) })
      await form.locator('select[name=household]').selectOption(FARMER_HOUSEHOLD)
      await form.locator('input[name=weighed_on]').fill(day)
      await form.locator('select[name=grade]').selectOption({ label: `${grade} (9.000 ₫/kg)` })
      await form.locator('input[name=kg]').fill(kg)
      await form.getByRole('button', { name: 'Ghi phiếu' }).click()
      await expect(officerApp.locator('.notice')).toContainText('Đã lưu phiếu cân.')
    }
    await expect(officerApp.locator('tbody tr')).toHaveCount(2)
    await expect(officerApp.locator('p', { hasText: 'Tổng ngày' })).toContainText('20,5 kg')

    // The manager closes a period of that day.
    await manager.goto('/manager/apps/leaf-purchase/periods')
    const closing = managerApp.locator('form', { has: managerApp.getByRole('button', { name: 'Chốt kỳ' }) })
    await closing.locator('input[name=date_from]').fill(day)
    await closing.locator('input[name=date_to]').fill(day)
    await closing.getByRole('button', { name: 'Chốt kỳ' }).click()
    await expect(managerApp.locator('h1')).toContainText(vnDate(day))
    const payout = managerApp.locator('tr', { hasText: 'Chưa trả' })
    await expect(payout.locator('td[data-label="Số tiền"]')).toHaveText('184.500 ₫')

    // The farmer sees the payout of the household, then sees it paid.
    const farmer = await newPage(browser)
    await keycloakLogin(farmer, 'smoke_farmer_tc', SMOKE_PASSWORD, 'farmer')
    await menuLink(farmer, 'Phiếu cân của tôi').first().click()
    await farmer.waitForURL('**/farmer/apps/leaf-purchase/mine')
    const farmerApp = appFrame(farmer, title)
    const row = farmerApp.locator('tr', { hasText: vnDate(day) }).first()
    await expect(row.locator('td[data-label="Số tiền"]')).toHaveText('184.500 ₫')
    await expect(row.locator('td[data-label="Trạng thái"]')).toHaveText('Chưa trả')

    await payout.getByRole('button', { name: 'Đã trả' }).click()
    await expect(managerApp.locator('.pill').first()).toHaveText('Đã trả')
    await farmer.reload()
    await expect(farmerApp.locator('tr', { hasText: vnDate(day) }).first().locator('td[data-label="Trạng thái"]')).toHaveText('Đã trả')
  })

  test('farm-supply: the manager opens a round, the farmer registers, the manager closes it and marks it delivered', async ({ browser }) => {
    const title = 'Vật tư mua chung'
    const round = `Phân bón vụ xuân ${Date.now()}`

    // The manager opens a round with two items.
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, title).first().click()
    await manager.waitForURL('**/manager/apps/farm-supply')
    const managerApp = appFrame(manager, title)
    await managerApp.locator('input[name=title]').fill(round)
    await managerApp.locator('input[name=deadline]').fill(`${new Date().getFullYear() + 1}-03-01T17:00`)
    await managerApp.getByRole('button', { name: 'Mở đợt' }).click()
    await expect(managerApp.locator('h1')).toContainText(round)
    const items: [string, string, string][] = [['Phân NPK', 'bao 50kg', '450000'], ['Thuốc trừ sâu sinh học', 'chai', '85000']]
    for (const [name, unit, price] of items) {
      const form = managerApp.locator('form', { has: managerApp.getByRole('button', { name: 'Thêm mặt hàng' }) })
      await form.locator('input[name=name]').fill(name)
      await form.locator('input[name=unit]').fill(unit)
      await form.locator('input[name=price_vnd]').fill(price)
      await form.getByRole('button', { name: 'Thêm mặt hàng' }).click()
      await expect(managerApp.locator('td[data-label="Mặt hàng"]', { hasText: name })).toBeVisible()
    }

    // The farmer registers 2 bags and 1,5 bottles.
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

    // The manager sees the household total, closes the round and marks the delivery.
    await manager.goto('/manager/apps/farm-supply')
    await managerApp.getByRole('link', { name: round }).click()
    await expect(managerApp.locator('td[data-label="Phải trả"]')).toHaveText('1.027.500 ₫')
    await managerApp.getByRole('button', { name: 'Đóng đợt này' }).click()
    await expect(managerApp.locator('h1 .pill')).toHaveText('Đã đóng')
    await managerApp.getByRole('button', { name: /Đánh dấu đã giao/ }).click()
    await expect(managerApp.locator('td[data-label="Giao hàng"]')).toContainText('Đã giao')

    // After the close the farmer sees the round among the past ones, waiting for payment.
    await farmer.reload()
    await expect(farmerApp.locator('tr', { hasText: round }).locator('td[data-label="Trạng thái"]')).toHaveText('Đã giao, chờ thanh toán')
  })
})
