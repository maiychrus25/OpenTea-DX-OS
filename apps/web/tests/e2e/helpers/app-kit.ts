// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Shared steps of the app kit stories: forms posted the way a browser does, the CSV download, the print page and the way back.
import { expect, APIRequestContext, FrameLocator, Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

export const appFrame = (page: Page, title: string): FrameLocator => page.frameLocator(`iframe[title="${title}"]`)

/** POSTs a urlencoded form (repeated keys allowed) through the web proxy with the context's session; redirects are not followed. */
export async function postForm(request: APIRequestContext, path: string, pairs: [string, string][]) {
  const response = await request.post(path, {
    data: new URLSearchParams(pairs).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    maxRedirects: 0,
  })
  // A refusal says who answered: keep it in the log of the run.
  if (response.status() >= 400) console.log(`POST ${path} -> ${response.status()} ${JSON.stringify(response.headers())} ${(await response.text()).slice(0, 300)}`)
  return response
}

/** The values of the non-empty options of `<select name=...>` in a page's HTML. */
export function optionValues(html: string, selectName: string): string[] {
  const select = new RegExp(`<select[^>]*name="${selectName}"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1] ?? ''
  return Array.from(select.matchAll(/<option[^>]*value="([^"]+)"/g), match => match[1])
}

/** Presses a CSV link inside the app frame: the browser must download a UTF-8 file with a BOM, CRLF and an ASCII name. */
export async function downloadCsv(page: Page, link: Locator): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
  const name = download.suggestedFilename()
  expect(name).toMatch(/^[A-Za-z0-9-]+-\d{4}-\d{2}-\d{2}\.csv$/)
  const bytes = readFileSync(await download.path())
  expect(Array.from(bytes.subarray(0, 3)), 'UTF-8 BOM').toEqual([0xef, 0xbb, 0xbf])
  const text = bytes.toString('utf8').slice(1)
  expect(text, 'CRLF line ends').toContain('\r\n')
  return { name, text }
}

/**
 * Presses a print link inside the frame: the print page opens in the top window (no frame, with the print bar), and
 * "Quay lại ứng dụng" returns to the app inside the shell at `backPath`.
 */
export async function printAndGoBack(page: Page, link: Locator, back: { path: string; frameTitle: string; heading: string | RegExp }) {
  await link.click()
  await page.waitForURL(/\/apps\/[a-z-]+\/.*print/)
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByText('Dùng lệnh In của trình duyệt')).toBeVisible()
  const printed = await page.locator('main').innerText()
  await page.getByRole('link', { name: 'Quay lại ứng dụng' }).click()
  await page.waitForURL(`**${back.path}`)
  await expect(appFrame(page, back.frameTitle).getByRole('heading', { name: back.heading, level: 1 })).toBeVisible()
  return printed
}

/** Page-level horizontal overflow of the shell and of the frame's document. */
export async function expectNoOverflow(page: Page, frameTitle?: string) {
  const measure = () => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })
  const shell = await page.evaluate(measure)
  expect(shell.scroll, `shell overflow ${JSON.stringify(shell)}`).toBeLessThanOrEqual(shell.inner)
  if (!frameTitle) return
  const frame = await (await page.locator(`iframe[title="${frameTitle}"]`).elementHandle())?.contentFrame()
  const inner = await frame!.evaluate(measure)
  expect(inner.scroll, `frame overflow ${JSON.stringify(inner)}`).toBeLessThanOrEqual(inner.inner)
}

/** Waits until the frame's document is the one at a URL holding `fragment` (a form that navigates it has landed). */
export async function expectFrameUrl(page: Page, frameTitle: string, fragment: string) {
  await expect
    .poll(async () => (await (await page.locator(`iframe[title="${frameTitle}"]`).elementHandle())?.contentFrame())?.url() ?? '')
    .toContain(fragment)
}
