// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { expect, test } from '@playwright/test'
import { mockSessionCookie } from '../helpers/forged-session'

const OPEN_ITEM = {
  id: '00000000-0000-0000-0000-000000000001',
  agent: 'journal-review',
  kind: 'journal.reject',
  titleVi: 'Trả lại nhật ký canh tác',
  reasonVi: 'Nhật ký phun thuốc cho thửa TC-A3 ghi thời gian cách ly chưa đúng quy chuẩn.',
  risk: 'medium',
  status: 'proposed',
  createdAt: '2026-11-24T01:00:00.000Z',
  expiresAt: '2026-11-27T01:00:00.000Z',
  preview: ['Yêu cầu sửa nhật ký entry-1: Ghi đủ 7 ngày cách ly'],
  canDecide: true,
  subjects: [{ id: 'entry-1', label: 'Thửa TC-A3 · SPRAYING · 23/11' }],
  evidence: {
    rows: [{ table: 'journal_entries', id: 'entry-1', sha256: 'abc', values: { status: 'PENDING_APPROVAL' } }],
    sha256: 'def',
  },
}

test.describe('Agent proposal inbox UI', () => {
  for (const vp of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`renders on ${vp.name} in ${theme} mode without horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.addInitScript((t) => localStorage.setItem('opentea-theme', t), theme)
        await mockSessionCookie(page, 'manager', 'Trưởng HTX', 'mgr-1')

        await page.route('/api/agent/proposals*', async (route) => {
          await route.fulfill({ status: 200, json: { data: [OPEN_ITEM] } })
        })

        await page.goto('/manager/ai')
        await expect(page.getByText('Hộp duyệt đề xuất AI')).toBeVisible()
        await expect(page.getByText('Trả lại nhật ký canh tác')).toBeVisible()

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        expect(overflow).toBe(false)
      })
    }
  }
})
