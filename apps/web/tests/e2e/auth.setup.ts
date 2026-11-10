// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test as setup } from '@playwright/test'
import { mockSessionCookie } from './helpers/forged-session'
import fs from 'fs'
import path from 'path'

const authFile = 'playwright/.auth/manager.json'

setup('authenticate as manager', async ({ page }) => {
  await mockSessionCookie(page, 'manager', 'Manager User', 'manager-user-id')

  // Save the storage state
  const dir = path.dirname(authFile)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  await page.context().storageState({ path: authFile })
})
