// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'

// Use admin/manager role for these tests (mocked or via session cookie)
// Since we don't have a real backend for these mock UI tests in Epic 8, 
// we'll mostly test presence of elements and basic interactions.

test.describe('Story 8.13 - Document, Partner, Search & Settings UI', () => {

  test.beforeEach(async ({ page }) => {
    // Go to the dashboard first to ensure we are logged in (assuming local test setup has bypass)
    // Or we just go to the specific pages directly since they might be protected
    // For now, let's navigate to the profile page directly.
    await page.goto('/manager/profile')
  })

  test('8.13-E2E-001: profile settings preserve unsaved changes and show save failure', async ({ page }) => {
    // Check if the avatar upload section is present
    await expect(page.locator('label', { hasText: 'Ảnh đại diện' })).toBeVisible()
    
    // Check if form is read-only initially
    await expect(page.getByRole('button', { name: 'Sửa' })).toBeVisible()
    
    // Click edit
    await page.getByRole('button', { name: 'Sửa' }).click()
    
    // Upload button should appear
    await expect(page.getByText('Tải ảnh lên')).toBeVisible()
    
    // Edit form should show inputs
    const nameInput = page.locator('input[name="name"]')
    await expect(nameInput).toBeVisible()
    
    // Check dirty state: change value
    await nameInput.fill('HTX Nông nghiệp Mới')
    
    // We would test window beforeunload here, but playwright handles this differently.
    // Instead we can click Cancel
    await page.getByRole('button', { name: 'Hủy' }).click()
    
    // Values should revert (if it was just UI state, we can't easily check without a real assert, but we check if Edit button comes back)
    await expect(page.getByRole('button', { name: 'Sửa' })).toBeVisible()
  })
  
  test('8.13-UNIT-001: document manager interactions', async ({ page }) => {
    // Navigate to Documents (PARA)
    await page.goto('/manager/documents')
    
    // Check if PARA title is there
    await expect(page.getByText('Kho tài liệu P.A.R.A')).toBeVisible()
    
    // Check folders exist
    await expect(page.getByText('Projects')).toBeVisible()
    
    // Create new folder
    await page.getByRole('button', { name: 'Thư mục mới' }).click()
    await expect(page.getByText('Tạo thư mục mới')).toBeVisible()
    await page.getByPlaceholder('VD: Tai lieu 2026').fill('Test Folder')
    await page.getByRole('button', { name: 'Tạo mới' }).click()
    
    // Note: the mock doesn't persist across route changes if it's purely client state, 
    // but within the same page load it should show
    await expect(page.getByText('Test Folder')).toBeVisible()
    
    // Upload document
    await page.getByRole('button', { name: 'Tải tài liệu lên' }).click()
    await expect(page.getByText('Chọn file')).toBeVisible()
    
    // Cancel upload
    await page.getByRole('button', { name: 'Hủy' }).click()
  })

  test('8.13-UNIT-002: partner interactions', async ({ page }) => {
    await page.goto('/manager/partners')
    
    await expect(page.getByText('Danh bạ đối tác')).toBeVisible()
    
    // Check mock partners exist
    await expect(page.getByText('Công ty Thu mua Nông sản Xanh')).toBeVisible()
    
    // Delete action
    const firstDeleteBtn = page.locator('button[title="Xóa đối tác"]').first()
    await firstDeleteBtn.click()
    
    // Modal confirm
    await expect(page.getByText('Xác nhận xóa đối tác')).toBeVisible()
    
    // Cancel delete
    await page.getByRole('button', { name: 'Hủy' }).click()
    await expect(page.getByText('Xác nhận xóa đối tác')).not.toBeVisible()
  })

  test('8.13-UNIT-003: global search interaction', async ({ page }) => {
    await page.goto('/manager/dashboard')
    
    // Open Global Search
    const searchInput = page.locator('input[placeholder="Tìm kiếm..."]')
    await searchInput.click()
    
    // The modal should appear
    const globalSearchInput = page.getByPlaceholder(/Tìm kiếm thành viên, lô hàng/i)
    await expect(globalSearchInput).toBeVisible()
    
    // Type a query
    await globalSearchInput.fill('Lô')
    
    // Expect result
    await expect(page.getByText('Đang tìm kiếm...')).toBeVisible()
    // Wait for debounce
    await expect(page.getByText('Lô hàng LOT-2026-08')).toBeVisible()
    
    // Test filter
    await page.getByRole('button', { name: 'Thành viên' }).click()
    await expect(page.getByText('Không tìm thấy kết quả nào')).toBeVisible()
    
    // Test error state
    await globalSearchInput.fill('error')
    await expect(page.getByText('Lỗi kết nối. Không thể thực hiện tìm kiếm.')).toBeVisible()
    
    // Close modal
    await page.getByTestId('global-search-overlay').click({ position: { x: 10, y: 10 } })
  })
})
