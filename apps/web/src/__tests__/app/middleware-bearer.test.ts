/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { isBearerApiPath } from '@/lib/contracts/public-resource-path'
import middleware from '@/middleware'

jest.mock('@/auth', () => ({ auth: (handler: unknown) => handler }))

const run = (path: string, authorization?: string) =>
  (middleware as unknown as (req: unknown) => Response)({
    auth: null,
    nextUrl: new URL(`http://localhost${path}`),
    url: `http://localhost${path}`,
    headers: new Headers(authorization ? { authorization } : {}),
  })

describe('isBearerApiPath', () => {
  test.each(['/api/journal', '/api/journal/', '/api/journal/e1', '/api/journal/batch-approve', '/api/journal/upload', '/api/notifications', '/api/notifications/announce', '/api/diagnosis', '/api/diagnosis/'])('%s', (path) => {
    expect(isBearerApiPath(path)).toBe(true)
  })
  test.each(['/api/notifications/stream', '/api/journal/e1/x', '/api/members', '/api/parcels', '/api/journalx', '/api/notifications/other', '/apps/x/api/journal', '/api/diagnosis/x'])('%s is not', (path) => {
    expect(isBearerApiPath(path)).toBe(false)
  })
})

describe('middleware with a Bearer header and no cookie', () => {
  test('lets the listed API routes through to the route, which verifies the token', () => {
    const response = run('/api/journal', 'Bearer abc')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  test.each(['/api/members', '/api/notifications/stream', '/api/parcels'])('still answers 401 for %s', (path) => {
    expect(run(path, 'Bearer abc').status).toBe(401)
  })

  test('still answers 401 without the header, or with another scheme', () => {
    expect(run('/api/journal').status).toBe(401)
    expect(run('/api/journal', 'Basic abc').status).toBe(401)
  })
})
