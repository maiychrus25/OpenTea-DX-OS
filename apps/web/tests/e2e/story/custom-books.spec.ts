// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// "Sổ tự tạo" end to end on the real stack (spec docs/specs/2026-11-14-custom-books-design.md): the manager installs the app from the App
// Store, designs a book from a template, publishes it, and the menu of the other roles gains the entry on its own (the web app's feed);
// the farmer writes a row on a phone, the manager rejects, the farmer corrects, the manager approves, the summary counts it; CSV, print,
// archive and publish again. After `npm run seed`, `make platform-up`, `make platform-smoke` (smoke_ users), `make web-up`, and with
// `./dxos worker` running and custom-books NOT installed:
//   E2E_CORE=1 E2E_CUSTOM_BOOKS=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/story/custom-books.spec.ts --project=chromium --no-deps
// With E2E_CUSTOM_BOOKS=down (the app's container stopped, `docker stop` on the clean project only) the second test checks that the web
// app still renders every page with its static menu and is not slowed by more than the feed's timeout once per five seconds.
import { test, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'
import { appFrame, downloadCsv, expectNoOverflow, printAndGoBack } from '../helpers/app-kit'

test.skip(!process.env.E2E_CORE || !process.env.E2E_CUSTOM_BOOKS, 'Needs the real stack and ./dxos worker: set E2E_CORE=1 and E2E_CUSTOM_BOOKS=1')

const APP_NAME = 'Sổ tự tạo'
const INSTALL_MS = 240_000
// The web app caches a feed for 15 s per role; a poll reloads until the entry shows.
const FEED_MS = 60_000
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true }
const DESKTOP = { width: 1280, height: 800 }

const menuLink = (page: Page, label: string) => page.locator('nav a', { hasText: label })
const card = (page: Page) => page.locator('li', { has: page.getByRole('heading', { name: APP_NAME, level: 2 }) })
const frameOf = (page: Page) => appFrame(page, APP_NAME)
/** Links inside the frame do not change the shell's URL, so the book's id is read from the designer's own form. */
const designedBookId = async (app: ReturnType<typeof frameOf>) =>
  /books\/([0-9a-f-]{36})\/design/.exec((await app.locator('form[action*="/design"]').getAttribute('action'))!)![1]

/** The screens the report looks at: full-page PNGs under test-results/custom-books/. */
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/custom-books/${name}.png`, fullPage: true })

const contexts: BrowserContext[] = []
const newPage = async (browser: Browser, options: BrowserContextOptions = { viewport: DESKTOP }) => {
  const context = await browser.newContext(options)
  contexts.push(context)
  return context.newPage()
}

/** Reloads until a link to the book is in the sidebar (the page is rendered by the server, so only a reload shows a new entry). */
async function expectEntry(page: Page, role: string, bookId: string, present: boolean, label?: string) {
  const link = page.locator(`nav a[href="/${role}/apps/custom-books/b/${bookId}"]`)
  await expect
    .poll(async () => {
      await page.reload()
      return await link.count()
    }, { timeout: FEED_MS, intervals: [1000, 2000, 3000] })
    .toBe(present ? 1 : 0)
  if (present && label) await expect(link).toContainText(label)
}

test.describe('Sổ tự tạo', () => {
  test.describe.configure({ retries: 0, mode: 'serial', timeout: 480_000 })
  test.use({ actionTimeout: 15_000 })
  test.skip(process.env.E2E_CUSTOM_BOOKS === 'down', 'This run is the feed-down check')
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('the manager installs, designs and publishes; the other roles get the book on their own; rows, approval, summary, CSV, print, archive', async ({ browser }) => {
    // ---- Install from the store; the section for books made by the HTX appears with its empty state.
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    await menuLink(manager, 'Kho ứng dụng').first().click()
    await manager.waitForURL('**/manager/app-store')
    await manager.getByPlaceholder('Tìm ứng dụng').fill('so tu tao')
    // A rerun on the same stack finds it installed already (the worker only installs; `./dxos remove custom-books --purge` starts afresh).
    if (await card(manager).getByRole('button', { name: 'Cài', exact: true }).count()) {
      await card(manager).getByRole('button', { name: 'Cài', exact: true }).click()
      await expect(card(manager).getByText('Đã cài', { exact: true })).toBeVisible({ timeout: INSTALL_MS })
    }
    await manager.getByPlaceholder('Tìm ứng dụng').fill('')
    const section = manager.getByRole('region', { name: 'Ứng dụng do HTX tự tạo' })
    await expect.poll(async () => {
      await manager.reload()
      return await section.count()
    }, { timeout: FEED_MS }).toBe(1)
    // A rerun finds the books of the earlier run; on a fresh stack the section shows its empty state.
    if ((await section.locator('li').count()) === 0) await expect(section.getByText('Chưa có ứng dụng nào. Bấm "Tạo sổ mới" để bắt đầu.')).toBeVisible()
    await shot(manager, 'store-section')

    // ---- "Tạo sổ mới" opens the template chooser inside the shell.
    await section.getByRole('link', { name: 'Tạo sổ mới' }).click()
    await manager.waitForURL('**/manager/apps/custom-books/books/new')
    const app = frameOf(manager)
    await expect(app.getByRole('heading', { name: 'Tạo sổ mới', level: 1 })).toBeVisible()
    await expectNoOverflow(manager, APP_NAME)
    await app.locator('li.card', { hasText: 'Chấm công hái chè' }).getByRole('button', { name: 'Dùng mẫu này' }).click()
    await expect(app.getByRole('heading', { name: 'Thiết kế sổ', level: 1 })).toBeVisible()
    const bookId = await designedBookId(app)

    // ---- Design: rename a field, add a choice field (a blank row at the end); a mistake keeps everything else.
    await app.getByLabel('Tên ô 2', { exact: true }).fill('Hộ hái chè')
    const blank = app.locator('input[name^="label_"][placeholder^="Thêm ô mới"]').first()
    const blankIndex = (await blank.getAttribute('name'))!.replace('label_', '')
    // At 1280 px a 30-character field name is readable in full and the table stays inside its card.
    const spare = app.locator('input[name^="label_"][placeholder^="Thêm ô mới"]').nth(1)
    await spare.fill('Số ký chè búp tươi hái buổi sáng'.slice(0, 30))
    expect(await spare.evaluate(input => (input as HTMLInputElement).scrollWidth <= (input as HTMLInputElement).clientWidth), 'a 30-character name is cut off').toBe(true)
    expect(await app.locator('table.form-table').evaluate(table => table.scrollWidth <= table.parentElement!.clientWidth), 'the designer table overflows its card').toBe(true)
    await spare.fill('')
    await blank.fill('Ca hái')
    await app.locator(`select[name="type_${blankIndex}"]`).selectOption('choice')
    await app.locator(`input[name="options_${blankIndex}"]`).fill('Sáng')
    await app.getByRole('button', { name: 'Lưu thiết kế' }).click()
    const optionsError = app.locator(`input[name="options_${blankIndex}"]`)
    await expect(optionsError).toHaveAttribute('aria-invalid', 'true')
    await expect(app.getByRole('alert').first()).toBeVisible()
    await expect(app.getByLabel('Tên ô 2', { exact: true })).toHaveValue('Hộ hái chè')
    await expect(app.locator(`input[name="label_${blankIndex}"]`)).toHaveValue('Ca hái')
    await expect(app.locator('input[name="name"]')).toHaveValue('Chấm công hái chè')
    await expectNoOverflow(manager, APP_NAME)
    await optionsError.fill('Sáng; Chiều; Tối')
    await app.getByRole('button', { name: 'Lưu thiết kế' }).click()
    await expect(app.getByRole('status').filter({ hasText: 'Đã lưu' })).toBeVisible()
    await expect(app.getByLabel('Tên ô 2', { exact: true })).toHaveValue('Hộ hái chè')

    // ---- Preview, then publish; the manager lands on the book inside the shell.
    await app.getByRole('link', { name: 'Xem thử biểu mẫu' }).click()
    await expect(app.getByText('Ca hái')).toBeVisible()
    await app.getByRole('link', { name: 'Quay lại thiết kế' }).click()
    await app.getByRole('button', { name: 'Phát hành', exact: true }).click()
    await expect(app.getByRole('heading', { name: 'Chấm công hái chè', level: 1 })).toBeVisible()
    await expectEntry(manager, 'manager', bookId, true, 'Chấm công hái chè')

    // ---- A second book where the farmer is "none" (the cashbook template): the officer gets it, the farmer does not.
    await manager.goto('/manager/apps/custom-books/books/new')
    await app.locator('li.card', { hasText: 'Sổ thu chi' }).getByRole('button', { name: 'Dùng mẫu này' }).click()
    await expect(app.getByRole('heading', { name: 'Thiết kế sổ', level: 1 })).toBeVisible()
    const cashId = await designedBookId(app)
    await app.getByRole('button', { name: 'Phát hành', exact: true }).click()
    await expect(app.getByRole('heading', { name: 'Sổ thu chi', level: 1 })).toBeVisible()

    // ---- The officer and the farmer get the entry with no further action by the manager.
    const officer = await newPage(browser)
    await keycloakLogin(officer, 'smoke_officer_tc', SMOKE_PASSWORD, 'officer')
    await expectEntry(officer, 'officer', bookId, true, 'Chấm công hái chè')
    await expectEntry(officer, 'officer', cashId, true, 'Sổ thu chi')
    const farmer = await newPage(browser, PHONE)
    await keycloakLogin(farmer, 'smoke_farmer_tc', SMOKE_PASSWORD, 'farmer')
    await expectEntry(farmer, 'farmer', bookId, true)
    await expect(farmer.locator(`nav a[href="/farmer/apps/custom-books/b/${cashId}"]`)).toHaveCount(0)
    expect((await farmer.request.get(`/farmer/apps/custom-books/b/${cashId}`)).status()).toBeLessThan(500)

    // ---- Store: the book is listed under "Ứng dụng do HTX tự tạo".
    await manager.goto('/manager/app-store')
    const openLink = section.locator(`a[href="/manager/apps/custom-books/b/${bookId}"]`)
    await expect.poll(async () => {
      await manager.reload()
      return await openLink.count()
    }, { timeout: FEED_MS }).toBe(1)
    await expect(manager.locator('li', { has: manager.locator(`a[href="/manager/apps/custom-books/b/${bookId}"]`) })).toContainText('Chấm công hái chè')
    await shot(manager, 'store-section-with-books')

    // ---- The farmer adds a row at 390 px (household limited to their own).
    await farmer.goto(`/farmer/apps/custom-books/b/${bookId}`)
    const farmerApp = frameOf(farmer)
    await expect(farmerApp.getByRole('heading', { name: 'Chấm công hái chè', level: 1 })).toBeVisible()
    await farmerApp.getByRole('link', { name: 'Ghi dòng mới' }).first().click()
    await expect(farmerApp.getByRole('heading', { name: 'Ghi dòng mới', level: 1 })).toBeVisible()
    await expect(farmerApp.locator('select[name="f2"] option:not([value=""])')).toHaveCount(1)
    await farmerApp.locator('select[name="f2"]').selectOption({ index: 1 })
    await farmerApp.locator('input[name="f3"]').fill('18,5')
    await farmerApp.locator('select[name="f4"]').selectOption('Một tôm hai lá')
    await expectNoOverflow(farmer, APP_NAME)
    await farmerApp.getByRole('button', { name: 'Ghi dòng' }).click()
    await expect(farmerApp.getByText('18,5').first()).toBeVisible()
    await expect(farmerApp.locator('tbody .pill', { hasText: 'Chờ duyệt' }).first()).toBeVisible()

    // ---- The manager finds it pending, rejects it with a reason on the reject page.
    await manager.goto(`/manager/apps/custom-books/b/${bookId}`)
    const row = app.locator('tbody tr', { hasText: '18,5' })
    await expect(row.getByText('Chờ duyệt')).toBeVisible()
    await app.getByRole('link', { name: 'Tổng hợp' }).click()
    await expect(app.locator('.stats')).not.toContainText('18,5')
    await app.getByRole('link', { name: 'Danh sách' }).first().click()
    await row.getByRole('link', { name: 'Từ chối' }).click()
    await expect(app.getByRole('heading', { name: 'Từ chối dòng', level: 1 })).toBeVisible()
    await shot(manager, 'reject-page')
    await app.locator('input[name="reason"]').fill('Thiếu ca hái')
    await app.getByRole('button', { name: 'Từ chối dòng' }).click()
    await expect(app.locator('tbody tr', { hasText: '18,5' }).getByText('Thiếu ca hái')).toBeVisible()

    // ---- The farmer edits it (sees the reason), the manager approves.
    await farmer.goto(`/farmer/apps/custom-books/b/${bookId}`)
    await farmerApp.locator('tbody tr', { hasText: '18,5' }).getByRole('link', { name: 'Sửa' }).click()
    await expect(farmerApp.getByText('Thiếu ca hái').first()).toBeVisible()
    await farmerApp.locator('select[name="f6"]').selectOption('Sáng')
    await farmerApp.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(farmerApp.locator('tbody tr', { hasText: '18,5' }).getByText('Chờ duyệt')).toBeVisible()
    await manager.goto(`/manager/apps/custom-books/b/${bookId}`)
    await app.locator('tbody tr', { hasText: '18,5' }).getByRole('button', { name: 'Duyệt' }).click()
    await expect(app.locator('tbody tr', { hasText: '18,5' }).getByText('Đã duyệt')).toBeVisible()

    // ---- The summary counts it only now; the farmer's own row is locked.
    await app.getByRole('link', { name: 'Tổng hợp' }).click()
    await expect(app.locator('.stats')).toContainText('18,5')
    await expectNoOverflow(manager, APP_NAME)
    await farmer.goto(`/farmer/apps/custom-books/b/${bookId}`)
    await expect(farmerApp.locator('tbody tr', { hasText: '18,5' }).getByRole('link', { name: 'Sửa' })).toHaveCount(0)

    // ---- CSV downloads inside the frame; print opens in the top window and its back link returns to the book.
    await manager.goto(`/manager/apps/custom-books/b/${bookId}`)
    const { text } = await downloadCsv(manager, app.getByRole('link', { name: /CSV/ }))
    expect(text).toContain('18.5')
    const printed = await printAndGoBack(manager, app.getByRole('link', { name: 'Bản in' }), {
      path: `/manager/apps/custom-books/b/${bookId}`, frameTitle: APP_NAME, heading: 'Chấm công hái chè',
    })
    expect(printed).toContain('18,5')

    // ---- Archive: the entry leaves the sidebars; publish again: it returns with its rows.
    await manager.goto('/manager/apps/custom-books/books')
    await app.locator(`tbody tr:has(form[action*="${bookId}"])`).getByRole('button', { name: 'Ngừng dùng' }).click()
    await expectEntry(officer, 'officer', bookId, false)
    await expectEntry(farmer, 'farmer', bookId, false)
    await manager.goto('/manager/apps/custom-books/books')
    await app.locator(`tbody tr:has(form[action*="${bookId}"])`).getByRole('button', { name: 'Phát hành lại' }).click()
    await expect(app.getByRole('heading', { name: 'Chấm công hái chè', level: 1 })).toBeVisible()
    await expectEntry(officer, 'officer', bookId, true)
    await expectEntry(farmer, 'farmer', bookId, true)
    await farmer.goto(`/farmer/apps/custom-books/b/${bookId}`)
    await expect(farmerApp.locator('tbody tr', { hasText: '18,5' })).toBeVisible()
  })
})

test.describe('Sổ tự tạo: the app is down', () => {
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })
  test.skip(process.env.E2E_CUSTOM_BOOKS !== 'down', 'Needs the app container stopped: E2E_CUSTOM_BOOKS=down')

  test('the shell still renders every page with its static menu entries and is not slowed beyond the feed timeout', async ({ browser }) => {
    const manager = await newPage(browser)
    await keycloakLogin(manager, 'smoke_manager_tc', SMOKE_PASSWORD, 'manager')
    const pages = ['/manager/dashboard', '/manager/app-store', '/manager/members', '/manager/dashboard']
    const timings: number[] = []
    for (const path of pages) {
      const started = Date.now()
      const response = await manager.goto(path)
      timings.push(Date.now() - started)
      expect(response?.status(), path).toBe(200)
      await expect(manager.getByTestId('sidebar')).toBeVisible()
      await expect(menuLink(manager, 'Kho ứng dụng').first()).toBeVisible()
      await expect(menuLink(manager, 'Sổ của HTX').first()).toBeVisible()
    }
    console.log(`page loads with the app down (ms): ${timings.join(', ')}`)
    // One load per five seconds may wait for the 1.5 s feed timeout; the loads in between must not.
    const slow = timings.filter(ms => ms > 1500 + 2500)
    expect(slow.length, `timings ${timings.join(', ')}`).toBeLessThanOrEqual(1)
  })
})
