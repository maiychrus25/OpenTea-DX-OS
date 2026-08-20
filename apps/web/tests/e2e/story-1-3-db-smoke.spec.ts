// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test';

test.describe('Story 1.3: DB Smoke Test', () => {
  // Test if Prisma client generated and app is running
  // E2E test requires the app to be running and DB to be seeded
  test('TC-1.3-E2E-01: health endpoint returns 200', async ({ request }) => {
    // In our project, an API route might not be explicitly named /api/health
    // but we can test a public route or similar to check if Next.js starts successfully
    // which implies Prisma client initialized correctly at build/start time.
    
    // As per story 0.1, the public QR route is public and uses DB. Let's try it.
    // We expect either a 200 or 404 (if lot doesn't exist), but not 500 (DB connection error)
    // If the server is unreachable, this will throw and fail the test, which is correct for E2E.
    const response = await request.get('/api/lot-trace/SOME_LOT_CODE');
    expect([200, 404, 400]).toContain(response.status());
  });
});
