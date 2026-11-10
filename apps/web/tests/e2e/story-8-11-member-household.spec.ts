// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test';
import { mockSessionCookie } from './helpers/forged-session';

test.describe('Story 8.11 - Member & Household Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockSessionCookie(page, 'officer', 'Officer', 'officer-1');
  });

  test('8.11-E2E-001: Officer sees household details and links', async ({ page }) => {
    // The forged cookie carries no access token, so the routes are mocked with data modelled on the seeded TC household
    // (prisma/seed.ts); one parcel is shown harvested to cover the yield column. The layout still needs HTX TC in the database.
    await page.route('**/api/farm/households/hh-tc-tam', r => r.fulfill({
      status: 200,
      json: { data: { id: 'hh-tc-tam', name: 'Hoàng Văn Tâm', phone: '0900100001', address: 'Xóm 1, xã Tân Cương', parcel_count: 2, total_area_ha: 0.77 } },
    }));
    await page.route('**/api/farm/parcels?household_id=hh-tc-tam', r => r.fulfill({
      status: 200,
      json: { data: [
        { id: 'pc-tc-a1', crop_type: 'Chè Trung du', season: 'Lứa 1/2026', area_ha: 0.45, status: 'TENDING', harvested_at: null, estimated_yield_per_ha: 1800 },
        { id: 'pc-tc-a3', crop_type: 'Chè Kim Tuyên', season: 'Lứa 2/2026', area_ha: 0.32, status: 'HARVESTED', harvested_at: '2026-10-11T02:00:00.000Z', estimated_yield_per_ha: 1800 },
      ] },
    }));
    await page.goto('/officer/households/hh-tc-tam');

    await page.waitForSelector('h2');
    await expect(page.locator('h2')).toContainText('Hoàng Văn Tâm');

    // Check if the 3 linking cards are present
    const links = page.locator('a[href^="/officer/"]');
    await expect(links.filter({ hasText: 'Bản đồ thửa đất' })).toBeVisible();
    await expect(links.filter({ hasText: 'Nhật ký canh tác' })).toBeVisible();
    await expect(links.filter({ hasText: 'Lịch sử dịch hại' })).toBeVisible();

    // Production history: tea varieties, harvest rounds and the yield of the harvested parcel (0.32 ha x 1800 kg/ha).
    await expect(page.getByRole('cell', { name: 'Chè Kim Tuyên', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Lứa 2/2026', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '576 kg', exact: true })).toBeVisible();
  });

  test('8.11-E2E-001: Officer sees error state for missing household', async ({ page }) => {
    // The forged cookie carries no access token, so the real routes would answer 401 and redirect to /login.
    await page.route('**/api/farm/households/error-mock', r =>
      r.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } })
    );
    await page.route('**/api/farm/parcels?household_id=error-mock', r => r.fulfill({ status: 200, json: { data: [] } }));
    await page.goto('/officer/households/error-mock');
    await page.waitForSelector('text=Lỗi truy cập');
    await expect(page.locator('text=Không tìm thấy nông hộ này hoặc bạn không có quyền truy cập.')).toBeVisible();
  });

  test('8.11-SEC-001: Farmer cannot access manager members page', async ({ page }) => {
    // Authenticate as farmer
    await mockSessionCookie(page, 'farmer', 'Farmer', 'farmer-1');
    
    // In a real implementation this should redirect to unauthorized
    await page.goto('/manager/members');
    
    // We check if it is redirected or blocked. If middleware works, it goes to /unauthorized or /login
    // Depending on setup, it might just return an unauthorized page. We assert that we don't see the members list
    await expect(page.locator('text=Thành viên hợp tác xã')).not.toBeVisible();
    await expect(page).toHaveURL(/\/unauthorized|\/login|\/farmer\/dashboard/);
  });
});
