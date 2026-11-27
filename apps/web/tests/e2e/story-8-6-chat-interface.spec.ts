// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect, type Page } from '@playwright/test'
import { mockSessionCookie } from './helpers/forged-session'

async function login(page: Page, role: string) {
  if (process.env.E2E_DEV_LOGIN === 'true') {
    // Opt-in for an already-running local preview; the default remains the isolated test cookie.
    await page.request.get(`/api/dev-login?role=${role}`, { maxRedirects: 0 })
  } else await mockSessionCookie(page, role)
}

const answer = '## Giá chè tham khảo\n\nTheo cập nhật mới nhất, cần đối chiếu giá tại địa phương.\n\n| Loại chè | Giá tham khảo | Nguồn | Thời điểm | Ghi chú |\n| --- | --- | --- | --- | --- |\n| Chè xanh | Chưa xác định | USDA | Hôm nay | Chỉ tham khảo |\n\n```text\n' + 'long_code_sample_'.repeat(35) + '\n```'
const history = [
  { role: 'user', content: 'Giá chè búp khô hôm nay thế nào?' },
  { role: 'assistant', content: '<think>Không hiển thị suy nghĩ nội bộ</think>' + answer },
]

test.describe('Story 8.6: Shared chat workspace', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'manager')
    await page.route('**/api/chatbot/sessions?*', route => route.fulfill({ json: { data: { sessions: [
      { session_id: 'saved', title: 'Giá chè hôm nay', updated_at: '2026-11-25T08:00:00Z' },
    ] } } }))
    await page.route('**/api/chatbot?*', route => route.fulfill({ json: { data: { history } } }))
    await page.route('**/api/chatbot', route => route.fulfill({ contentType: 'text/event-stream', body:
      JSON.stringify({ text: answer }) + '\n' + JSON.stringify({ done: true, sources: ['USDA', 'Dữ liệu hệ thống'] }) + '\n' }))
  })

  test('title, empty composer and real history', async ({ page }) => {
    await page.goto('/manager/chat')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trợ lý Thị trường')
    await expect(page.getByRole('navigation', { name: 'Đường dẫn' })).toBeHidden()
    await expect(page.getByText('Hôm nay bạn đang nghĩ gì?')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Chatbot' })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: 'Lịch sử', exact: true }).click()
    await page.getByRole('button', { name: 'Giá chè hôm nay', exact: true }).click()
    await expect(page.locator('div[class*="userMessage"]')).toHaveText('Giá chè búp khô hôm nay thế nào?')
    await expect(page.getByText('Không hiển thị suy nghĩ nội bộ')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Bảng dữ liệu' })).toBeVisible()
    await page.getByRole('button', { name: 'Trò chuyện mới' }).click()
    await expect(page.locator('div[class*="userMessage"]')).toHaveCount(0)
  })

  test('send, markdown, sources, copy and keyboard composition', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/manager/chat')
    const input = page.getByPlaceholder('Hỏi trợ lý…')
    await input.fill('Thời tiết ngày mai?')
    await input.press('Shift+Enter')
    await expect(input).toHaveValue('Thời tiết ngày mai?\n')
    await input.dispatchEvent('compositionstart')
    await input.press('Enter')
    await expect(page.locator('div[class*="userMessage"]')).toHaveCount(0)
    await input.dispatchEvent('compositionend')
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(page.locator('div[class*="userMessage"]')).toHaveCount(1)
    await expect(page.getByRole('list', { name: 'Nguồn tham khảo' })).toContainText('USDA')
    await page.getByRole('button', { name: 'Sao chép câu trả lời' }).click()
    await expect(page.getByText('Đã sao chép', { exact: true })).toBeVisible()
    await expect(page.locator('div[class*="botMessage"]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.getByText('AI chỉ cung cấp thông tin tham khảo, không quyết định thay HTX.')).toBeVisible()
  })

  test('mobile drawer supports selection, focus containment and Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/manager/chat')
    const toggle = page.getByRole('button', { name: 'Lịch sử', exact: true })
    await toggle.click()
    const drawer = page.getByRole('dialog', { name: 'Lịch sử trò chuyện' })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'Giá chè hôm nay', exact: true }).click()
    await expect(drawer).toBeHidden()
    await expect(page.locator('div[class*="userMessage"]')).toBeVisible()
    await toggle.click()
    await page.keyboard.press('Tab')
    expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(toggle).toBeFocused()
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px: long messages stay within the workspace`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.goto('/manager/chat')
        await page.screenshot({ path: testInfo.outputPath('empty.png') })
        const input = page.getByPlaceholder('Hỏi trợ lý…')
        await input.fill('Kiểm tra bảng và mã nguồn')
        await input.press('Enter')
        await expect(page.getByRole('button', { name: 'Sao chép câu trả lời' })).toBeVisible()
        const bounds = await page.evaluate(() => {
          const root = document.documentElement
          const messages = document.querySelector('[aria-label="Tin nhắn"]')!
          const pre = document.querySelector('pre')!
          return { width: root.scrollWidth, viewportWidth: innerWidth, height: root.scrollHeight, viewportHeight: innerHeight,
            messagesOverflow: getComputedStyle(messages).overflowY, codeScrolls: pre.scrollWidth > pre.clientWidth }
        })
        expect(bounds.width).toBeLessThanOrEqual(bounds.viewportWidth)
        expect(bounds.height).toBeLessThanOrEqual(bounds.viewportHeight)
        expect(bounds.messagesOverflow).toBe('auto')
        expect(bounds.codeScrolls).toBe(true)
        await expect(input).toBeInViewport()
        await input.fill('Dòng dài\n'.repeat(40))
        expect((await input.boundingBox())!.height).toBeLessThanOrEqual(200)
        await page.screenshot({ path: testInfo.outputPath('conversation.png') })
      })
    }
  }

  test('scrolling up keeps position until jump to latest', async ({ page }) => {
    await page.route('**/api/chatbot', route => route.fulfill({ contentType: 'text/event-stream', body:
      JSON.stringify({ text: 'Đoạn thông tin tham khảo.\n\n'.repeat(100) }) + '\n{"done":true}\n' }))
    await page.goto('/manager/chat')
    await page.getByPlaceholder('Hỏi trợ lý…').fill('Thông tin dài')
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sao chép câu trả lời' })).toBeVisible()
    const list = page.getByRole('region', { name: 'Tin nhắn' })
    await list.hover()
    await page.mouse.wheel(0, -10000)
    await expect(page.getByRole('button', { name: 'Đến tin nhắn mới nhất' })).toBeVisible()
    const before = await list.evaluate(element => element.scrollTop)
    await page.getByPlaceholder('Hỏi trợ lý…').fill('Câu tiếp theo')
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Gửi', exact: true })).toBeVisible()
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(before)
    await page.getByRole('button', { name: 'Đến tin nhắn mới nhất' }).click()
    await expect.poll(() => list.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(96)
  })

  test('officer technical chat keeps its heading', async ({ page }) => {
    await page.context().clearCookies()
    await login(page, 'officer')
    await page.goto('/officer/chat')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trợ lý Kỹ thuật')
  })

  test('farmer remains unable to access the chat routes', async ({ page }) => {
    await page.context().clearCookies()
    await login(page, 'farmer')
    for (const route of ['/manager/chat', '/officer/chat']) {
      await page.goto(route)
      await expect(page).toHaveURL('/unauthorized')
    }
  })
})
