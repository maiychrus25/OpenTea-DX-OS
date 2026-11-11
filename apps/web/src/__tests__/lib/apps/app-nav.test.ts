/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { InstalledApp } from '@/domain/entities/installed-app'
import { appNavItems, loadAppNavItems, miniAppSrc } from '@/lib/apps/app-nav'
import { logger } from '@/lib/logger'

const hello: InstalledApp = {
  id: 'hello',
  name: 'Xin chào',
  version: '0.1.0',
  menu: [{ label: 'Xin chào', path: '/', roles: ['farmer', 'officer', 'manager'] }],
  publicPrefixes: [],
}
const tour: InstalledApp = {
  id: 'tea-tour',
  name: 'Tour',
  version: '1.0.0',
  menu: [
    { label: 'Tour chè', path: '/', roles: ['manager'] },
    { label: 'Hướng dẫn', path: '/guide', roles: ['farmer'] },
  ],
  publicPrefixes: ['/public/'],
}

describe('appNavItems', () => {
  test('appNavItems filters by role and builds hrefs', () => {
    expect(appNavItems([hello, tour], 'manager').map(({ label, href }) => ({ label, href }))).toEqual([
      { label: 'Xin chào', href: '/manager/apps/hello' },
      { label: 'Tour chè', href: '/manager/apps/tea-tour' },
    ])
    expect(appNavItems([hello, tour], 'farmer').map(item => item.href)).toEqual(['/farmer/apps/hello', '/farmer/apps/tea-tour/guide'])
    expect(appNavItems([tour], 'officer')).toEqual([])
  })

  test('gives every item an icon', () => {
    expect(appNavItems([hello], 'officer')[0].icon).toBeTruthy()
  })
})

describe('loadAppNavItems', () => {
  test('a repository error gives no app items and does not throw', async () => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    const items = await loadAppNavItems({ list: jest.fn().mockRejectedValue(new Error('db down')) }, 'manager')
    expect(items).toEqual([])
    expect(logError).toHaveBeenCalledWith('Mini-app menu unavailable', expect.anything())
    logError.mockRestore()
  })

  test('lists the items of the installed apps', async () => {
    const items = await loadAppNavItems({ list: jest.fn().mockResolvedValue([hello]) }, 'farmer')
    expect(items.map(item => item.href)).toEqual(['/farmer/apps/hello'])
  })
})

describe('miniAppSrc', () => {
  test('points at the proxy with the path and the query of the shell URL', () => {
    expect(miniAppSrc(hello, 'manager', [], {})).toBe('/apps/hello')
    expect(miniAppSrc(tour, 'farmer', ['guide', 'a b'], { said: 'hi & bye', tag: ['x', 'y'] })).toBe(
      '/apps/tea-tour/guide/a%20b?said=hi+%26+bye&tag=x&tag=y',
    )
  })

  test('is null when the app has no menu entry for the role', () => {
    expect(miniAppSrc(tour, 'officer', [], {})).toBeNull()
  })
})
