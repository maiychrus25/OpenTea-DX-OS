import { test, expect } from '@playwright/test'

test.describe('Profile Page (Manager View)', () => {
  // Use a custom setup to login as MANAGER before these tests
  test.use({ storageState: 'playwright/.auth/manager.json' })

  test('Read -> Edit -> Save flow', async ({ page }) => {
    // 1. Navigate to profile page
    await page.goto('/manager/profile')

    // 2. Assert page is in read-only mode (Edit button is visible)
    const editButton = page.getByRole('button', { name: 'Sửa' })
    await expect(editButton).toBeVisible()

    // Ensure inputs are NOT visible in read-only mode
    await expect(page.getByRole('textbox', { name: 'Tên HTX' })).not.toBeVisible()

    // 3. Click "Sửa"
    await editButton.click()

    // 4. Change phone number
    const phoneInput = page.getByLabel('Số điện thoại liên hệ')
    await expect(phoneInput).toBeVisible()
    await phoneInput.fill('0123456789')

    // 5. Click "Lưu"
    const saveButton = page.getByRole('button', { name: 'Lưu' })
    await saveButton.click()

    // 6. Assert success toast appears
    await expect(page.getByText('Cập nhật thông tin HTX thành công')).toBeVisible()

    // 7. Refresh page
    await page.reload()

    // 8. Assert new phone number is displayed
    await expect(page.getByText('0123456789')).toBeVisible()
  })
})
