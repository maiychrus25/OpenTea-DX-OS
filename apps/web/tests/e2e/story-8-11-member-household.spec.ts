// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import fs from 'fs';
import { test, expect, Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';

try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const match = envContent.match(/AUTH_SECRET=["']?([^"'\n]+)["']?/);
  if (match) process.env.AUTH_SECRET = match[1];
} catch (e) {}

async function mockSessionCookie(page: Page, role: string, name: string, id: string) {
  const now = Math.floor(Date.now() / 1000);
  const token = await encode({
    token: { id, name, email: `${role}@example.com`, role, iat: now, exp: now + 60 * 60 * 8, jti: 'mock-jti-' + now },
    secret: process.env.AUTH_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || 'agrimarket-secret-key',
    salt: 'authjs.session-token',
  });
  await page.context().addCookies([{
    name: 'authjs.session-token', value: token, domain: 'localhost', path: '/',
    httpOnly: true, sameSite: 'Lax', expires: now + 60 * 60 * 8,
  }]);
}

test.describe('Story 8.11 - Member & Household Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockSessionCookie(page, 'officer', 'Officer', 'officer-1');
  });

  test('8.11-E2E-001: Officer sees household details and links', async ({ page }) => {
    // Navigating to the household list page (we use direct link to profile for this test)
    await page.goto('/officer/households/123');

    // Wait for the mock delay
    await page.waitForSelector('h2');

    // Check if household name is rendered
    await expect(page.locator('h2')).toContainText('Hộ ông B');

    // Check if the 3 linking cards are present
    const links = page.locator('a[href^="/officer/"]');
    await expect(links.filter({ hasText: 'Bản đồ thửa đất' })).toBeVisible();
    await expect(links.filter({ hasText: 'Nhật ký canh tác' })).toBeVisible();
    await expect(links.filter({ hasText: 'Lịch sử dịch hại' })).toBeVisible();

    // Check production history table
    await expect(page.locator('text=Cà phê')).toBeVisible();
    await expect(page.locator('text=12 tấn')).toBeVisible();
  });

  test('8.11-E2E-001: Officer sees error state for missing household', async ({ page }) => {
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
