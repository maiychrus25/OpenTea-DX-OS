// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against the real stack: E2E_CORE=1 E2E_BASE_URL=http://localhost:3000, after `make platform-smoke` created the users and fixtures.
import { execFileSync } from 'child_process';
import fs from 'fs';
import { test, expect, Page } from '@playwright/test';
import { decode } from 'next-auth/jwt';

// The tests change the realm and stop Hasura, so they must not run side by side.
test.describe.configure({ mode: 'default' });
test.skip(!process.env.E2E_CORE, 'Needs the real stack: set E2E_CORE=1');

const COMPOSE_FILE = '../../docker/docker-compose.yml';
const KEYCLOAK = 'http://localhost:8080';
const PASSWORD = 'Smoke-Pass-1';
const COOKIE = /^authjs\.session-token(\.\d+)?$/;

function compose(...args: string[]) {
  return execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], { stdio: 'pipe' });
}

async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Tiếp tục với Keycloak' }).click();
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();
  await page.waitForURL('**/manager/dashboard');
}

async function readSession(page: Page) {
  const secret = fs.readFileSync('../../docker/.env.local', 'utf-8').match(/^AUTH_SECRET=["']?([^"'\n]+)["']?/m)?.[1];
  if (!secret) throw new Error('AUTH_SECRET missing in docker/.env.local');
  const chunks = (await page.context().cookies())
    .filter(cookie => COOKIE.test(cookie.name))
    .sort((a, b) => Number(a.name.split('.').pop()) - Number(b.name.split('.').pop()));
  const value = chunks.map(chunk => chunk.value).join('');
  const token = await decode({ token: value, secret, salt: 'authjs.session-token' });
  if (!token) throw new Error('No readable session cookie');
  return {
    accessToken: token.accessToken as string,
    expiresAt: token.accessTokenExpiresAt as number,
    chunks: chunks.length,
    bytes: chunks.reduce((sum, chunk) => sum + chunk.name.length + chunk.value.length, 0),
  };
}

async function setAccessTokenLifespan(seconds: number): Promise<number> {
  const tokenResponse = await fetch(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: 'admin-cli',
      grant_type: 'password',
      username: process.env.KEYCLOAK_ADMIN ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    }),
  });
  expect(tokenResponse.ok).toBe(true);
  const headers = {
    Authorization: `Bearer ${(await tokenResponse.json()).access_token}`,
    'Content-Type': 'application/json',
  };
  const realmUrl = `${KEYCLOAK}/admin/realms/agrimarket`;
  const realm = await (await fetch(realmUrl, { headers })).json();
  const update = await fetch(realmUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ accessTokenLifespan: seconds }),
  });
  expect(update.ok).toBe(true);
  return realm.accessTokenLifespan;
}

async function expectOnlyHouseholds(page: Page, own: string[], foreign: string[]) {
  await page.goto('/manager/zones');
  for (const name of own) await expect(page.getByRole('cell', { name })).toBeVisible();
  for (const name of foreign) await expect(page.getByRole('cell', { name })).toHaveCount(0);
}

test('manager_tc sees household fixtures of TC and none of LB', async ({ page }) => {
  await login(page, 'manager_tc');
  await expectOnlyHouseholds(
    page,
    ['Household TC 1', 'P-TC-001', 'Household TC 2', 'P-TC-002'],
    ['Household LB 1', 'P-LB-001'],
  );
});

test('manager_lb sees household fixtures of LB and none of TC', async ({ page }) => {
  await login(page, 'manager_lb');
  await expectOnlyHouseholds(
    page,
    ['Household LB 1', 'P-LB-001'],
    ['Household TC 1', 'P-TC-001', 'Household TC 2', 'P-TC-002'],
  );
});

test('/api/auth/session contains no accessToken or refreshToken', async ({ page }) => {
  await login(page, 'manager_tc');
  const session = await readSession(page);
  console.log(`session cookie: ${session.bytes} bytes in ${session.chunks} chunk(s)`);

  const response = await page.request.get('/api/auth/session');
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(JSON.parse(body).user.htxCode).toBe('TC');
  expect(body).not.toContain('accessToken');
  expect(body).not.toContain('refreshToken');
  expect(body).not.toContain(session.accessToken);
});

test('a session cookie survives an expired access token and the page still loads', async ({ page }) => {
  test.setTimeout(240_000);
  // Longer than the 30 s refresh window, so the first token is left alone until it really expires.
  const originalLifespan = await setAccessTokenLifespan(40);
  try {
    await login(page, 'manager_tc');
    const before = await readSession(page);
    // Away from the app, so that no background call refreshes the token during the wait.
    await page.goto('about:blank');
    await page.waitForTimeout(Math.max(0, before.expiresAt * 1000 - Date.now()) + 2000);
    expect(Date.now() / 1000).toBeGreaterThan(before.expiresAt);

    // The session endpoint refreshes too; with it blocked, only the middleware can write the new token.
    await page.route('**/api/auth/session', route => route.abort());
    await page.goto('/manager/zones');
    await expect(page.getByRole('cell', { name: 'P-TC-001' })).toBeVisible();

    // The refreshed token must have reached the browser, not only the one server render.
    const after = await readSession(page);
    expect(after.accessToken).not.toBe(before.accessToken);
    expect(after.expiresAt).toBeGreaterThan(before.expiresAt);
    await page.reload();
    await expect(page.getByRole('cell', { name: 'P-TC-001' })).toBeVisible();
  } finally {
    await setAccessTokenLifespan(originalLifespan);
  }
});

test('with Hasura stopped the list page shows the Vietnamese error and no rows', async ({ page }) => {
  await login(page, 'manager_tc');
  try {
    compose('stop', 'hasura');
    await page.goto('/manager/zones');
    await expect(page.getByRole('heading', { name: 'Dịch vụ dữ liệu đang tạm gián đoạn' })).toBeVisible();
    await expect(page.getByText('Không thể tải dữ liệu lúc này. Vui lòng thử lại sau ít phút.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'P-TC-001' })).toHaveCount(0);
  } finally {
    compose('start', 'hasura');
    await expect(() => {
      compose('exec', '-T', 'hasura', 'curl', '-sf', '-o', '/dev/null', 'http://localhost:8080/healthz');
    }).toPass({ timeout: 120_000, intervals: [2000] });
  }
});
