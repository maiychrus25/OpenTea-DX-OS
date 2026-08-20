// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test';

test.describe('Sign-out Flow', () => {
  test('should display sign-out popup and redirect to login on sign out', async ({ page }) => {
    // 1. Navigate to the dev login to bypass real Keycloak
    await page.goto('/api/dev-login?role=manager&id=mock-manager-id&name=Mock+Manager');
    
    // 2. Go to the manager dashboard
    await page.goto('/manager/dashboard');

    // Wait for the layout to render
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();

    // 3. Click the profile button in the sidebar footer
    const profileButton = sidebar.locator('button').filter({ hasText: 'Mock Manager' }).first();
    await profileButton.click();

    // 4. Verify the popup appears with the correct role and links
    const popup = sidebar.locator('div').filter({ hasText: 'ĐĂNG NHẬP VỚI VAI TRÒ: TRƯỞNG HTX' }).first();
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('link', { name: 'Hồ sơ tài khoản' })).toBeVisible();
    
    // 5. Click the "Đăng xuất" button
    const signOutButton = popup.getByRole('button', { name: 'Đăng xuất' });
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();

    // 6. Verify that the button goes into pending state (optional, might be too fast)
    // await expect(signOutButton).toHaveText('Đang đăng xuất...');

    // 7. Verify redirection to /login
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });
});
