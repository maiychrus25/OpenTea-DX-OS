// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test as setup } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import fs from 'fs'
import path from 'path'

// Read .env manually
try {
  const envContent = fs.readFileSync('.env', 'utf-8')
  const match = envContent.match(/AUTH_SECRET=["']?([^"'\n]+)["']?/)
  if (match) {
    process.env.AUTH_SECRET = match[1]
  }
} catch (e) {
  // ignore
}

const authFile = 'playwright/.auth/manager.json'

setup('authenticate as manager', async ({ page }) => {
  // Generate a valid NextAuth JWT token
  const now = Math.floor(Date.now() / 1000)
  const token = await encode({
    token: {
      name: 'Manager User',
      email: 'manager@example.com',
      role: 'manager',
      iat: now,
      exp: now + 60 * 60 * 8, // 8 hours
      jti: 'mock-jti-' + now,
    },
    secret: process.env.AUTH_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || 'agrimarket-secret-key',
    salt: 'authjs.session-token',
  })

  // Set the cookie in the browser context
  await page.context().addCookies([
    {
      name: 'authjs.session-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8 hours
    },
  ])

  // Save the storage state
  const dir = path.dirname(authFile)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  await page.context().storageState({ path: authFile })
})
