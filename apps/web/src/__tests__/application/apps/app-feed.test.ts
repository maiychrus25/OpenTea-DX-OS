/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createFeedLoader, parseFeed } from '@/application/apps/app-feed'
import type { InstalledApp } from '@/domain/entities/installed-app'
import { logger } from '@/lib/logger'

const app: InstalledApp = { id: 'custom-books', name: 'Sổ', version: '0.1.0', menu: [], publicPrefixes: [], feed: '/feed' }
const entry = (over: Record<string, unknown> = {}) => ({ label: 'Sổ thu mua', path: '/books/1', icon: 'leaf', description: 'Mô tả', ...over })

describe('parseFeed drops what it cannot trust', () => {
  const empty = { entries: [], create: null }

  test.each([[null], ['x'], [[]], [42], [{}], [{ entries: 'x' }], [{ entries: { a: 1 } }]])('not a usable object: %j', raw => {
    expect(parseFeed(raw)).toEqual(empty)
  })

  test('keeps a good entry and the create link', () => {
    expect(parseFeed({ entries: [entry()], create: { label: 'Tạo sổ', path: '/new' } })).toEqual({
      entries: [{ label: 'Sổ thu mua', path: '/books/1', icon: 'leaf', description: 'Mô tả' }],
      create: { label: 'Tạo sổ', path: '/new' },
    })
  })

  test('at most 30 entries', () => {
    const entries = Array.from({ length: 31 }, (_, i) => entry({ path: `/b/${i}` }))
    expect(parseFeed({ entries }).entries).toHaveLength(30)
  })

  test.each([[''], ['   '], ['x'.repeat(61)], [5], [null]])('label %j drops the entry', label => {
    expect(parseFeed({ entries: [entry({ label })] }).entries).toEqual([])
  })

  test('a 60 char label is kept, trimmed', () => {
    expect(parseFeed({ entries: [entry({ label: ` ${'x'.repeat(60)} ` })] }).entries[0].label).toBe('x'.repeat(60))
  })

  test.each([['//evil.example'], ['/a/../b'], ['/..'], ['http://evil.example'], ['relative'], ['/a b'], ['/A'], ['/a/'], ['/'], [''], [3], ['/a%2fb'], ['/a\\b']])(
    'path %j drops the entry',
    path => {
      expect(parseFeed({ entries: [entry({ path })], create: { label: 'x', path } })).toEqual({ entries: [], create: null })
    },
  )

  test('an unknown icon becomes null, a known one stays', () => {
    const { entries } = parseFeed({ entries: [entry({ icon: 'skull' }), entry({ icon: 'truck' }), entry({ icon: '__proto__' }), entry({ icon: undefined })] })
    expect(entries.map(item => item.icon)).toEqual([null, 'truck', null, null])
  })

  test('a description is cut at 200 and defaults to empty', () => {
    const { entries } = parseFeed({ entries: [entry({ description: 'd'.repeat(300) }), entry({ description: undefined }), entry({ description: 7 })] })
    expect(entries.map(item => item.description)).toEqual(['d'.repeat(200), '', ''])
  })

  test('one bad entry does not drop the others', () => {
    expect(parseFeed({ entries: ['x', null, entry({ path: 'bad' }), entry()] }).entries).toHaveLength(1)
  })

  test('create needs a valid label and path', () => {
    expect(parseFeed({ entries: [], create: { label: '', path: '/new' } }).create).toBeNull()
    expect(parseFeed({ entries: [], create: { label: 'Tạo', path: '//x' } }).create).toBeNull()
    expect(parseFeed({ entries: [], create: 'x' }).create).toBeNull()
  })

  test('hostile text stays text', () => {
    const { entries } = parseFeed({ entries: [entry({ label: '<script>alert(1)</script>' })] })
    expect(entries[0].label).toBe('<script>alert(1)</script>')
  })
})

describe('createFeedLoader', () => {
  const body = JSON.stringify({ entries: [entry()], create: { label: 'Tạo sổ', path: '/new' } })
  let logError: jest.SpyInstance
  let time: number
  const setup = (fetchImpl: jest.Mock) => ({
    load: createFeedLoader({ getToken: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch, now: () => time }),
  })
  beforeEach(() => {
    process.env.CORE_GATEWAY_URL = 'http://gateway'
    time = 1000
    logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => logError.mockRestore())

  test('sends the bearer token to the app feed path', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(body))
    const feed = await setup(fetchImpl).load(app, 'manager', 'TC')
    expect(feed.entries).toHaveLength(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://gateway/apps/custom-books/feed')
    expect(init.headers).toEqual({ authorization: 'Bearer tok', accept: 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  test('caches for 15 seconds per app, HTX and role', async () => {
    const fetchImpl = jest.fn().mockImplementation(async () => new Response(body))
    const { load } = setup(fetchImpl)
    await load(app, 'manager', 'TC')
    time += 14_999
    await load(app, 'manager', 'TC')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await load(app, 'officer', 'TC')
    await load(app, 'manager', 'LB')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    time += 15_001
    await load(app, 'manager', 'TC')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  test('a failure is empty, logged once and not cached', async () => {
    const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('down')).mockImplementation(async () => new Response(body))
    const { load } = setup(fetchImpl)
    expect(await load(app, 'manager', 'TC')).toEqual({ entries: [], create: null })
    expect(logError).toHaveBeenCalledTimes(1)
    expect((await load(app, 'manager', 'TC')).entries).toHaveLength(1)
  })

  test('times out', async () => {
    const fetchImpl = jest.fn().mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    )
    expect(await setup(fetchImpl).load(app, 'manager', 'TC')).toEqual({ entries: [], create: null })
    expect(logError).toHaveBeenCalledTimes(1)
  })

  test.each([[404], [403], [500], [204]])('ignores status %i', async status => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(status === 204 ? null : body, { status }))
    expect(await setup(fetchImpl).load(app, 'manager', 'TC')).toEqual({ entries: [], create: null })
  })

  test('ignores a body over 64 KB, even when it lies about its length', async () => {
    const big = JSON.stringify({ entries: [entry({ description: 'x'.repeat(70_000) })] })
    const fetchImpl = jest.fn().mockResolvedValue(new Response(big))
    expect(await setup(fetchImpl).load(app, 'manager', 'TC')).toEqual({ entries: [], create: null })
  })

  test('ignores a body that is not JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('<html>'))
    expect(await setup(fetchImpl).load(app, 'manager', 'TC')).toEqual({ entries: [], create: null })
  })

  test('an app without a feed is not called', async () => {
    const fetchImpl = jest.fn()
    expect(await setup(fetchImpl).load({ ...app, feed: null }, 'manager', 'TC')).toEqual({ entries: [], create: null })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('a token error is a failure, not a throw', async () => {
    const load = createFeedLoader({ getToken: async () => { throw new Error('no session') }, fetchImpl: jest.fn() as unknown as typeof fetch, now: () => 0 })
    expect(await load(app, 'manager', 'TC')).toEqual({ entries: [], create: null })
  })
})
