/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import * as upload from '@/app/api/journal/upload/route'
import * as journal from '@/app/api/journal/route'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn() },
    parcel: { findUnique: jest.fn() },
    household: { findFirst: jest.fn(), findUnique: jest.fn() },
  },
}))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn() }))
jest.mock('@/application/journal/CreateJournalEntryUseCase', () => ({ CreateJournalEntryUseCase: jest.fn() }))
jest.mock('@/application/farm/GetFarmerHouseholdUseCase', () => ({
  GetFarmerHouseholdUseCase: jest.fn(() => ({ execute: jest.fn().mockResolvedValue({ id: 'hh-1' }) })),
}))

const mock = (fn: unknown) => fn as jest.Mock
const storage = { generateUploadUrl: jest.fn() }
const journalCreate = jest.fn()
const KEY = /^para\/TC\/Areas\/Journal\/\d{4}\/[0-9a-f-]{36}-[^/]+$/

const signIn = (role: string | null, htxCode: string | null = 'TC') =>
  mock(auth).mockResolvedValue(role ? { user: { id: 'u1', role, htxCode, name: 'U' } } : null)
const request = (body: unknown) =>
  new Request('http://localhost/api/journal/upload', { method: 'POST', body: JSON.stringify(body) })
const presign = async (filename: string, contentType = 'image/jpeg') => {
  const response = await upload.POST(request({ filename, contentType }), {})
  return { status: response.status, body: await response.json() }
}
const safeName = (key: string) => key.split('/').pop()!.slice(37)

beforeEach(() => {
  jest.clearAllMocks()
  signIn('farmer')
  mock(prisma.htxProfile.findUnique).mockResolvedValue({ id: 'htx-tc', htx_code: 'TC', name: 'HTX TC', crop_types: [] })
  mock(prisma.parcel.findUnique).mockResolvedValue({ household: { htx_profile_id: 'htx-tc' } })
  mock(MinioDocumentAdapter).mockImplementation(() => storage)
  mock(CreateJournalEntryUseCase).mockImplementation(() => ({ execute: journalCreate }))
  storage.generateUploadUrl.mockImplementation(async (key: string) => ({ url: `https://signed/${key}`, key }))
  journalCreate.mockResolvedValue({ id: 'e1' })
})

afterEach(() => jest.useRealTimers())

describe('POST /api/journal/upload', () => {
  test.each(['farmer', 'officer'])('%s gets a URL valid for 900 seconds and a key in the journal folder', async (role) => {
    signIn(role)
    const { status, body } = await presign('la.jpg')
    expect(status).toBe(200)
    expect(body.data.key).toMatch(KEY)
    expect(body.data.uploadUrl).toBe(`https://signed/${body.data.key}`)
    expect(storage.generateUploadUrl).toHaveBeenCalledWith(body.data.key, 900)
  })

  test('each upload gets its own key', async () => {
    const first = await presign('la.jpg')
    const second = await presign('la.jpg')
    expect(first.body.data.key).not.toBe(second.body.data.key)
  })

  test('the year folder is the year in Vietnam', async () => {
    jest.useFakeTimers({ now: new Date('2026-12-31T18:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
    const { body } = await presign('la.jpg')
    expect(body.data.key).toContain('/Journal/2027/')
  })

  test('a manager is refused', async () => {
    signIn('manager')
    expect((await presign('la.jpg')).status).toBe(403)
    expect(storage.generateUploadUrl).not.toHaveBeenCalled()
  })

  test('an anonymous caller is refused', async () => {
    signIn(null)
    expect((await presign('la.jpg')).status).toBe(401)
    expect(storage.generateUploadUrl).not.toHaveBeenCalled()
  })

  test('a caller without an HTX is refused', async () => {
    signIn('farmer', null)
    const { status, body } = await presign('la.jpg')
    expect(status).toBe(403)
    expect(body.error.code).toBe('NO_HTX')
    expect(storage.generateUploadUrl).not.toHaveBeenCalled()
  })

  test.each(['image/gif', 'application/pdf', 'image/svg+xml', ''])('the content type %p is refused', async (contentType) => {
    expect((await presign('la.jpg', contentType)).status).toBe(400)
    expect(storage.generateUploadUrl).not.toHaveBeenCalled()
  })

  test.each(['image/jpeg', 'image/png', 'image/webp'])('the content type %s is accepted', async (contentType) => {
    expect((await presign('la.jpg', contentType)).status).toBe(200)
  })

  test('a body without a file name is refused', async () => {
    const response = await upload.POST(request({ contentType: 'image/jpeg' }), {})
    expect(response.status).toBe(400)
  })

  test.each([
    ['../../LB/x.jpg', 'x.jpg'],
    ['a/b/c.png', 'c.png'],
    ['C:\\Users\\a\\leaf.webp', 'leaf.webp'],
    ['..jpg', '.jpg'],
    ['lá chè đẹp.jpg', 'la_che_dep.jpg'],
    ['a<b>"c".jpg', 'a_b__c_.jpg'],
  ])('the name %p is reduced to %p', async (filename, expected) => {
    const { body } = await presign(filename)
    expect(body.data.key).toMatch(KEY)
    expect(safeName(body.data.key)).toBe(expected)
  })

  test('a long name is capped at 100 characters and keeps its extension', async () => {
    const { body } = await presign(`${'a'.repeat(200)}.png`, 'image/png')
    const name = safeName(body.data.key)
    expect(name).toHaveLength(100)
    expect(name.endsWith('.png')).toBe(true)
  })

  test('a name over 255 characters is refused', async () => {
    expect((await presign(`${'a'.repeat(300)}.png`, 'image/png')).status).toBe(400)
    expect(storage.generateUploadUrl).not.toHaveBeenCalled()
  })

  test.each([
    ['..', 'image/jpeg', 'photo.jpg'],
    ['../', 'image/png', 'photo.png'],
    ['ảnh/', 'image/webp', 'photo.webp'],
    ['😀😀', 'image/png', 'photo.png'],
  ])('the name %p falls back to %s', async (filename, contentType, expected) => {
    const { body } = await presign(filename, contentType)
    expect(safeName(body.data.key)).toBe(expected)
  })

  test('the returned key is accepted by POST /api/journal', async () => {
    signIn('farmer')
    const { body } = await presign('../../LB/lá.jpg')
    const entry = {
      parcel_id: 'p1',
      entry_date: '2026-01-01',
      activities: [{ activity_type: 'OTHER' }],
      photo_minio_key: body.data.key,
      photo_url: body.data.key,
    }
    const response = await journal.POST(new Request('http://localhost/api/journal', { method: 'POST', body: JSON.stringify(entry) }), {})
    expect(response.status).toBe(201)
    expect(journalCreate.mock.calls[0][0].photo_minio_key).toBe(body.data.key)
  })
})
