// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { renderHook, act, waitFor } from '@testing-library/react'
import { useJournalOfflineQueue, JOURNAL_QUEUE_KEY, type JournalPayload } from '../useJournalOfflineQueue'
import { loadPesticideCatalogue, CATALOGUE_CACHE_KEY } from '@/lib/pesticide/catalogue'

const mockStore: Record<string, unknown> = {}
jest.mock('idb-keyval', () => ({
  get: jest.fn(async (key: string) => mockStore[key]),
  set: jest.fn(async (key: string, value: unknown) => { mockStore[key] = value }),
  update: jest.fn(async (key: string, fn: (v: unknown) => unknown) => { mockStore[key] = fn(mockStore[key]) }),
}))

const payload: JournalPayload = { parcel_id: 'p1', entry_date: '2026-11-28', activities: [{ activity_type: 'PRUNING' }] }
const ok = (status = 201, body: unknown = { data: {} }) => ({ ok: status < 400, status, json: async () => body })
const mockFetch = jest.fn()
const queued = () => (mockStore[JOURNAL_QUEUE_KEY] as { client_id: string; last_error?: string }[] | undefined) ?? []
const postCalls = () => mockFetch.mock.calls.filter(([url, init]) => url === '/api/journal' && init?.method === 'POST')

beforeEach(() => {
  Object.keys(mockStore).forEach(k => delete mockStore[k])
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
})

const setup = async () => {
  const hook = renderHook(() => useJournalOfflineQueue())
  await waitFor(() => expect(hook.result.current.pending).toBe(0))
  return hook
}

test('enqueue keeps the item and counts it as pending', async () => {
  const { result } = await setup()
  await act(() => result.current.enqueue({ ...payload, client_id: 'c1' }))
  expect(result.current.pending).toBe(1)
  expect(queued()[0].client_id).toBe('c1')
})

test('queue replays each item once', async () => {
  mockFetch.mockResolvedValue(ok())
  const { result } = await setup()
  await act(() => result.current.enqueue({ ...payload, client_id: 'c1' }))
  await act(async () => { await Promise.all([result.current.flush(), result.current.flush()]) })
  await act(() => result.current.flush())
  expect(postCalls()).toHaveLength(1)
  expect(JSON.parse(postCalls()[0][1].body).client_id).toBe('c1')
  expect(queued()).toHaveLength(0)
  expect(result.current.pending).toBe(0)
})

test('a 4xx keeps the item with last_error and is not retried', async () => {
  mockFetch.mockResolvedValue(ok(422, { error: { code: 'WITHDRAWAL_BELOW_FLOOR', message: 'Thấp hơn mức sàn' } }))
  const { result } = await setup()
  await act(() => result.current.enqueue({ ...payload, client_id: 'c1' }))
  await act(() => result.current.flush())
  expect(result.current.failed).toEqual([expect.objectContaining({ client_id: 'c1', last_error: 'Thấp hơn mức sàn' })])
  expect(result.current.pending).toBe(0)
  await act(() => result.current.flush())
  expect(postCalls()).toHaveLength(1)
  await act(() => result.current.discard('c1'))
  expect(result.current.failed).toHaveLength(0)
})

test('a 5xx or a network error keeps the item for a later retry', async () => {
  const { result } = await setup()
  await act(() => result.current.enqueue({ ...payload, client_id: 'c1' }))
  mockFetch.mockResolvedValueOnce(ok(503, {}))
  await act(() => result.current.flush())
  expect(result.current.pending).toBe(1)
  mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await act(() => result.current.flush())
  expect(result.current.pending).toBe(1)
  mockFetch.mockResolvedValueOnce(ok())
  await act(() => result.current.flush())
  expect(result.current.pending).toBe(0)
  expect(postCalls()).toHaveLength(3)
})

test('the photo uploads before the POST and its key is sent', async () => {
  const order: string[] = []
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    order.push(`${init?.method ?? 'GET'} ${url}`)
    if (url === '/api/journal/upload') return ok(200, { data: { uploadUrl: 'https://minio/put', key: 'k1' } })
    return ok()
  })
  const { result } = await setup()
  const photo = new Blob(['x'], { type: 'image/jpeg' })
  await act(() => result.current.enqueue({ ...payload, client_id: 'c1' }, photo))
  await act(() => result.current.flush())
  expect(order).toEqual(['POST /api/journal/upload', 'PUT https://minio/put', 'POST /api/journal'])
  expect(JSON.parse(postCalls()[0][1].body)).toMatchObject({ photo_minio_key: 'k1', client_id: 'c1' })
})

test('coming back online sends the queue without reloading the page', async () => {
  mockFetch.mockResolvedValue(ok())
  const onSent = jest.fn()
  const hook = renderHook(() => useJournalOfflineQueue({ onSent }))
  await waitFor(() => expect(hook.result.current.pending).toBe(0))
  await act(() => hook.result.current.enqueue({ ...payload, client_id: 'c1' }))
  await act(async () => { window.dispatchEvent(new Event('online')) })
  await waitFor(() => expect(hook.result.current.pending).toBe(0))
  expect(postCalls()).toHaveLength(1)
  expect(onSent).toHaveBeenCalledTimes(1)
})

describe('pesticide catalogue offline copy', () => {
  const rows = [{ id: 'p1', trade_name: 'Abamec' }]
  test('the last answer is cached and served when the network is gone', async () => {
    mockFetch.mockResolvedValueOnce(ok(200, { data: rows }))
    expect(await loadPesticideCatalogue()).toEqual(rows)
    expect(mockStore[CATALOGUE_CACHE_KEY]).toEqual(rows)
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await loadPesticideCatalogue()).toEqual(rows)
  })
  test('with no copy the failure surfaces', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(loadPesticideCatalogue()).rejects.toThrow()
  })
})
