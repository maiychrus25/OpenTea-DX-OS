/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { InstalledApp } from '@/domain/entities/installed-app'
import { appNavItems, loadAppNavItems, miniAppSrc } from '@/lib/apps/app-nav'
import type { AppFeed } from '@/application/apps/app-feed'
import { logger } from '@/lib/logger'

const hello: InstalledApp = {
  id: 'hello',
  name: 'Xin chào',
  version: '0.1.0',
  menu: [{ label: 'Xin chào', path: '/', roles: ['farmer', 'officer', 'manager'] }],
  publicPrefixes: [],
  feed: null,
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
  feed: null,
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
    const items = await loadAppNavItems({ list: jest.fn().mockRejectedValue(new Error('db down')) }, 'manager', 'TC')
    expect(items).toEqual([])
    expect(logError).toHaveBeenCalledWith('Mini-app menu unavailable', expect.anything())
    logError.mockRestore()
  })

  test('lists the items of the installed apps', async () => {
    const list = jest.fn().mockResolvedValue([hello])
    const items = await loadAppNavItems({ list }, 'farmer', 'TC')
    expect(items.map(item => item.href)).toEqual(['/farmer/apps/hello'])
    expect(list).toHaveBeenCalledWith('TC')
  })

  test('a session without an HTX asks for the apps enabled for everyone only', async () => {
    const list = jest.fn().mockResolvedValue([])
    await loadAppNavItems({ list }, 'farmer', null)
    expect(list).toHaveBeenCalledWith(null)
  })
})

describe('feed items', () => {
  const books: InstalledApp = { ...hello, id: 'custom-books', feed: '/feed' }
  const feed: AppFeed = {
    entries: [
      { label: 'Sổ thu mua', path: '/books/1', icon: 'leaf', description: '' },
      { label: 'Sổ lạ', path: '/books/2', icon: null, description: '' },
    ],
    create: null,
  }

  test('static items come first, then one item per feed entry', async () => {
    const loadFeed = jest.fn().mockResolvedValue(feed)
    const items = await loadAppNavItems({ list: async () => [books, hello] }, 'manager', 'TC', loadFeed)
    expect(items.map(item => item.href)).toEqual([
      '/manager/apps/custom-books',
      '/manager/apps/custom-books/books/1',
      '/manager/apps/custom-books/books/2',
      '/manager/apps/hello',
    ])
    expect(items.every(item => item.icon)).toBe(true)
    expect(loadFeed).toHaveBeenCalledTimes(1)
    expect(loadFeed).toHaveBeenCalledWith(books, 'manager', 'TC')
  })

  test('a throwing loader leaves the static items', async () => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    const items = await loadAppNavItems({ list: async () => [books] }, 'farmer', 'TC', jest.fn().mockRejectedValue(new Error('x')))
    expect(items.map(item => item.href)).toEqual(['/farmer/apps/custom-books'])
    logError.mockRestore()
  })

  test('no feed call without a loader, for an app without feed, or a role without a menu entry', async () => {
    const loadFeed = jest.fn().mockResolvedValue(feed)
    expect(await loadAppNavItems({ list: async () => [books] }, 'manager', 'TC')).toHaveLength(1)
    await loadAppNavItems({ list: async () => [hello] }, 'manager', 'TC', loadFeed)
    await loadAppNavItems({ list: async () => [{ ...books, menu: [{ label: 'x', path: '/', roles: ['manager'] }] }] }, 'farmer', 'TC', loadFeed)
    expect(loadFeed).not.toHaveBeenCalled()
  })

  test('no feed call without an HTX', async () => {
    const loadFeed = jest.fn()
    await loadAppNavItems({ list: async () => [books] }, 'manager', null, loadFeed)
    expect(loadFeed).not.toHaveBeenCalled()
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

  test.each([[['']], [['tours', '']], [['..']], [['.']], [['a/b']], [['a\\b']], [['%2e%2e']], [['x%2Fy']], [['%5c']]])(
    'is null for an empty or unsafe segment: %j',
    path => {
      expect(miniAppSrc(tour, 'manager', path, {})).toBeNull()
    },
  )
})
