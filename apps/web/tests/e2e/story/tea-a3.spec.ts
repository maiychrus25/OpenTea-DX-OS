// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// "Một ngày của lô chè A3" (spec §7) on the real stack, after `npm run seed` and `make platform-smoke`:
//   E2E_CORE=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/story/tea-a3.spec.ts --project=chromium --no-deps
// The disease-api container must be up. The farmer is the demo user farmer_tc, who owns parcel A3 and has no TOTP step;
// a login does not change the user. The officer is smoke_officer_tc, because the demo officers must set up TOTP first.
import { execFileSync } from 'child_process'
import { test, expect, Locator, Page } from '@playwright/test'
import { DEMO_PASSWORD, SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'

test.skip(!process.env.E2E_CORE, 'Needs the real stack: set E2E_CORE=1')

const COMPOSE_FILE = '../../docker/docker-compose.yml'
// ReportPhoto's notice for a photo whose object is not in storage, such as the seeded A3 report.
const PHOTO_UNAVAILABLE = 'Không tải được ảnh. Ảnh có thể đã bị xoá hoặc đang được kiểm tra.'
const CONFIRMED_NAME = 'Bệnh đốm tảo'

/** A synthetic tea leaf drawn on a canvas (no dataset photo): green blade, midrib, a few rust-coloured spots. */
async function leafPhoto(page: Page, name: string) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 320
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#d9e4c8'
    ctx.fillRect(0, 0, 320, 320)
    ctx.fillStyle = '#3f7d32'
    ctx.beginPath()
    ctx.ellipse(160, 160, 70, 140, Math.PI / 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#a7c957'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(80, 270)
    ctx.lineTo(240, 50)
    ctx.stroke()
    ctx.fillStyle = '#8a5a2b'
    for (const [x, y, r] of [[130, 150, 12], [190, 120, 9], [170, 200, 14], [120, 210, 8]]) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    return canvas.toDataURL('image/png')
  })
  return { name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') }
}

/** Picks the one option that names the parcel; the label format differs between the forms. */
async function selectParcel(select: Locator, parcelCode: string) {
  const option = select.locator('option', { hasText: parcelCode })
  await expect(option).toHaveCount(1)
  await select.selectOption(await option.getAttribute('value'))
}

async function expectImageLoaded(page: Page, alt: string) {
  const image = page.getByAltText(alt)
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
}

test('một ngày của lô chè A3', async ({ browser }) => {
  test.setTimeout(300_000)
  const note = `Câu chuyện A3 ${Date.now()}`
  let reportId = ''
  let lotCode = ''

  const farmerContext = await browser.newContext()
  const farmer = await farmerContext.newPage()

  await test.step('the farmer sees the active withdrawal on A3', async () => {
    await keycloakLogin(farmer, 'farmer_tc', DEMO_PASSWORD, 'farmer')
    await expect(farmer.getByText(/^Thửa TC-A3 còn \d+ ngày cách ly$/)).toBeVisible()
  })

  await test.step('the farmer adds a journal entry with a photo, uploaded to storage through the presigned PUT', async () => {
    await farmer.goto('/farmer/journal/new')
    await selectParcel(farmer.locator('select').first(), 'TC-A3')
    await farmer.locator('select').nth(1).selectOption({ label: 'Bón phân' })
    await farmer.getByPlaceholder('VD: Phân NPK 16-16-8').fill('Phân hữu cơ vi sinh')
    await farmer.getByPlaceholder('Chè đang ra búp đều...').fill(note)
    await farmer.locator('input[type="file"]').setInputFiles(await leafPhoto(farmer, 'la-che-a3.png'))

    const [upload] = await Promise.all([
      farmer.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/Areas/Journal/'), { timeout: 30_000 }),
      farmer.getByRole('button', { name: 'Gửi chờ duyệt' }).click(),
    ])
    expect(upload.status()).toBe(200)
    await farmer.waitForURL('**/farmer/journal')

    await farmer.getByRole('button', { name: new RegExp(note) }).click()
    await expectImageLoaded(farmer, 'Journal attachment')
  })

  await test.step('the farmer sends a tea photo for diagnosis; the tea model answers through the gateway', async () => {
    await farmer.goto('/farmer/diagnosis')
    await selectParcel(farmer.locator('select').first(), 'TC-A3')
    await farmer.locator('#fileInput').setInputFiles(await leafPhoto(farmer, 'la-che-benh.png'))
    const since = new Date(Date.now() - 1000).toISOString()
    const diagnosis = farmer.waitForResponse(r => r.url().endsWith('/api/diagnosis') && r.request().method() === 'POST', { timeout: 90_000 })
    await farmer.getByRole('button', { name: 'Bắt đầu chẩn đoán' }).click()
    const response = await diagnosis
    expect(response.status()).toBe(200)
    const body = await response.json()
    reportId = body.data.report_id
    expect(reportId).toBeTruthy()
    console.log(`tea diagnosis of the synthetic leaf: ${body.data.disease_name}, confidence ${body.data.confidence_score}, uncertain ${body.data.uncertain}`)
    await expect(farmer.getByRole('status')).toHaveText('Đã gửi cán bộ kỹ thuật xem')
    if (body.data.uncertain) await expect(farmer.getByText('Không xác định', { exact: true }).first()).toBeVisible()

    // The web app drops the model name from the answer, so the disease-api access log shows which model served it.
    const log = execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'logs', '--no-log-prefix', '--since', since, 'disease-api']).toString()
    expect(log).toContain('"POST /predict?model=tea HTTP/1.1" 200')
  })

  const officerContext = await browser.newContext()
  const officer = await officerContext.newPage()
  await keycloakLogin(officer, 'smoke_officer_tc', SMOKE_PASSWORD, 'officer')

  await test.step('harvest approval and a lot of A3 are refused while the withdrawal is active', async () => {
    const parcels = await (await officer.request.get('/api/farm/parcels')).json()
    const a3 = parcels.data.find((p: { parcel_code: string }) => p.parcel_code === 'TC-A3')
    expect(a3).toBeTruthy()
    const approval = await officer.request.post(`/api/parcels/${a3.id}/approve-harvest`)
    expect(approval.status()).toBe(400)
    expect((await approval.json()).error).toMatch(/^Chưa qua thời gian cách ly\. An toàn thu hoạch từ ngày /)

    await officer.goto('/officer/lots')
    await officer.getByRole('button', { name: '+ Tạo lô mới' }).click()
    await officer.getByPlaceholder('VD: Chè Trung du').fill('Chè Kim Tuyên')
    await officer.getByLabel('TC-A3 — Chè Kim Tuyên').check()
    await officer.getByRole('button', { name: 'Tạo lô hàng' }).click()
    await expect(officer.getByText(/^Thửa đất TC-A3 chưa qua thời gian cách ly\. An toàn thu hoạch từ ngày /)).toBeVisible()
    await expect(officer.getByText(/WITHDRAWAL_NOT_PASSED/)).toHaveCount(0)
    await officer.getByRole('button', { name: 'Hủy' }).click()
  })

  await test.step('the diagnosis reaches the officer queue and the officer confirms it with a name', async () => {
    await officer.goto('/officer/diseases')
    await expect(officer.locator(`a[href="/officer/diseases/${reportId}"]`)).toBeVisible()
    await expect(officer.getByText('Chờ duyệt').first()).toBeVisible()
    await expect(officer.getByText('PENDING', { exact: true })).toHaveCount(0)
    // The seeded A3 report points at an object that is not in storage: a notice, not a broken image.
    await expect(officer.getByRole('img', { name: PHOTO_UNAVAILABLE }).first()).toBeVisible()

    await officer.goto(`/officer/diseases/${reportId}`)
    await expectImageLoaded(officer, 'Ảnh bệnh')
    await expect(officer.getByText('TC-A3', { exact: true })).toBeVisible()
    await officer.getByLabel('Tên bệnh đã xác nhận (Bắt buộc khi Duyệt)').fill(CONFIRMED_NAME)
    await officer.getByLabel('Nhập hướng dẫn (Bắt buộc khi Duyệt):').fill('Tỉa bỏ lá bệnh, giữ vườn thông thoáng, theo dõi thêm 7 ngày.')
    await officer.getByRole('button', { name: 'Phê duyệt' }).click()
    await officer.waitForURL('**/officer/diseases')
    await expect(officer.locator(`a[href="/officer/diseases/${reportId}"]`)).toHaveCount(0)

    // The farmer now sees the officer's name in place of the AI's on the newest report, this one.
    await farmer.goto('/farmer/diagnosis')
    await expect(farmer.locator('[class*="historyCard"]').first()).toContainText(`${CONFIRMED_NAME} (`)
    await expect(farmer.locator('[class*="historyCard"]').first()).toContainText('Đã xác nhận')
  })

  await test.step('the officer creates a lot of TC-A2, which has no active withdrawal, and exports its QR', async () => {
    await officer.goto('/officer/lots')
    await officer.getByRole('button', { name: '+ Tạo lô mới' }).click()
    await officer.getByPlaceholder('VD: Chè Trung du').fill('Chè LDP1')
    await officer.getByPlaceholder('2500').fill('30')
    await officer.getByLabel('TC-A2 — Chè LDP1').check()
    const [created] = await Promise.all([
      officer.waitForResponse(r => r.url().endsWith('/api/lots') && r.request().method() === 'POST', { timeout: 30_000 }),
      officer.getByRole('button', { name: 'Tạo lô hàng' }).click({ timeout: 30_000 }),
    ])
    const createdBody = await created.json()
    lotCode = createdBody.data.lot_code
    expect(lotCode).toMatch(/^TC-/)

    const card = officer.locator('div', { has: officer.getByText(lotCode, { exact: true }) }).filter({ has: officer.getByRole('button', { name: 'Xuất QR' }) }).last()
    await card.getByRole('button', { name: 'Xuất QR' }).click()
    await expect(officer.getByText(`Đã xuất QR thành công! Mã: ${lotCode}`)).toBeVisible()
  })

  await farmerContext.close()
  await officerContext.close()

  const publicContext = await browser.newContext()
  const visitor = await publicContext.newPage()

  await test.step('the public trace page shows the exported lot and its safety status', async () => {
    await visitor.goto(`/q/${encodeURIComponent(lotCode)}`)
    await expect(visitor.getByText(lotCode, { exact: true })).toBeVisible()
    await expect(visitor.getByText('Mã thửa: TC-A2', { exact: false })).toBeVisible()
    await expect(visitor.getByText('Không sử dụng thuốc BVTV').first()).toBeVisible()
  })

  await test.step('the page the printed QR opens (/lot/<code>) shows the exported lot in Vietnamese', async () => {
    await visitor.goto(`/lot/${encodeURIComponent(lotCode)}`)
    await expect(visitor.getByText(lotCode, { exact: true })).toBeVisible()
    await expect(visitor.getByText('Đã xuất QR', { exact: true })).toBeVisible()
    await expect(visitor.getByText('QR_EXPORTED')).toHaveCount(0)
    await expect(visitor.getByText(/đã được xác nhận và khóa/i)).toBeVisible()
  })

  await test.step('the public trace page of the previous A3 round shows the passed withdrawal', async () => {
    await visitor.goto('/q/TC-CHE-A3-001')
    await expect(visitor.getByText('TC-CHE-A3-001', { exact: true })).toBeVisible()
    await expect(visitor.getByText('Đạt chuẩn An Toàn')).toBeVisible()
    await expect(visitor.getByText(/Thuốc cuối cùng: Chế phẩm sinh học trừ rầy\. Thời gian cách ly: \d+ ngày \/ yêu cầu 7 ngày\./)).toBeVisible()
    await expect(visitor.getByText('ĐẠT', { exact: true })).toBeVisible()
  })

  await publicContext.close()
})
