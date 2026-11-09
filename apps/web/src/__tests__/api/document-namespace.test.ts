/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { ExportQrUseCase } from '@/application/lot/ExportQrUseCase'
import { CreateLotUseCase } from '@/application/lot/CreateLotUseCase'
import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'
import { isInDocumentRoot } from '@/domain/document/document-namespace'
import * as list from '@/app/api/documents/route'
import * as url from '@/app/api/documents/url/route'
import * as upload from '@/app/api/documents/upload/route'
import * as exportQr from '@/app/api/lots/[id]/export-qr/route'
import * as lots from '@/app/api/lots/route'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn() },
    lot: { findUnique: jest.fn() },
    parcel: { findUnique: jest.fn() },
  },
}))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({ MinioStorageAdapter: jest.fn() }))
jest.mock('@/application/lot/ExportQrUseCase', () => ({ ExportQrUseCase: jest.fn() }))
jest.mock('@/application/lot/CreateLotUseCase', () => ({ CreateLotUseCase: jest.fn() }))

const mock = (fn: unknown) => fn as jest.Mock
const storage = { listDocuments: jest.fn(), generateDownloadUrl: jest.fn(), generateUploadUrl: jest.fn() }
const exportExecute = jest.fn()
const createExecute = jest.fn()

const OUTSIDE = ['para/LB/Projects/', 'para/Projects/', 'para/TC/../LB/Projects/', 'para/TC/%2e%2e/LB/', 'other/TC/Projects/', 'para/TCX/Projects/']

const listRequest = (path: string) => new Request(`http://localhost/api/documents?path=${encodeURIComponent(path)}`)
const urlRequest = (key: string) => new Request(`http://localhost/api/documents/url?key=${encodeURIComponent(key)}`)
const uploadRequest = (pathPrefix: string, fileName = 'a.pdf') =>
  new Request('http://localhost/api/documents/upload', { method: 'POST', body: JSON.stringify({ fileName, pathPrefix }) })
const post = (body: unknown) => new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body) })
const ctx = { params: Promise.resolve({ id: 'lot-1' }) }

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mock(auth).mockResolvedValue({ user: { id: 'u1', role: 'officer', htxCode: 'TC', name: 'U' } })
  mock(prisma.htxProfile.findUnique).mockResolvedValue({ id: 'htx-tc', htx_code: 'TC', name: 'HTX TC', crop_types: [] })
  mock(prisma.lot.findUnique).mockResolvedValue({ htx_profile_id: 'htx-tc' })
  mock(prisma.parcel.findUnique).mockResolvedValue({ household: { htx_profile_id: 'htx-tc' } })
  mock(MinioDocumentAdapter).mockImplementation(() => storage)
  mock(ExportQrUseCase).mockImplementation(() => ({ execute: exportExecute }))
  mock(CreateLotUseCase).mockImplementation(() => ({ execute: createExecute }))
  storage.listDocuments.mockResolvedValue([])
  storage.generateDownloadUrl.mockResolvedValue('https://signed')
  storage.generateUploadUrl.mockImplementation(async (key: string) => ({ url: 'https://signed', key }))
  exportExecute.mockResolvedValue({ qr: 'x' })
  createExecute.mockResolvedValue({ id: 'lot-1' })
})

describe('isInDocumentRoot', () => {
  test.each(['para/TC/', 'para/TC', 'para/TC/Projects/', 'para/TC/Archives/a b.pdf'])('accepts %s', (key) => {
    expect(isInDocumentRoot(key, 'TC')).toBe(true)
  })
  test.each([...OUTSIDE, 'para/TC/./x', 'para/TC//x', 'para/TC/a\\b', 'para/TC/x/..'])('refuses %s', (key) => {
    expect(isInDocumentRoot(key, 'TC')).toBe(false)
  })
})

describe('document routes keep a caller inside the namespace of their HTX', () => {
  test.each(OUTSIDE)('list refuses %s', async (path) => {
    expect((await list.GET(listRequest(path), {})).status).toBe(404)
    expect(storage.listDocuments).not.toHaveBeenCalled()
  })
  test.each(OUTSIDE)('url refuses %s', async (key) => {
    expect((await url.GET(urlRequest(key), {})).status).toBe(404)
    expect(storage.generateDownloadUrl).not.toHaveBeenCalled()
  })
  test.each(OUTSIDE)('upload refuses %s', async (pathPrefix) => {
    expect((await upload.POST(uploadRequest(pathPrefix), {})).status).toBe(404)
    expect(storage.generateUploadUrl).not.toHaveBeenCalled()
  })

  test('list reads the folder of the caller', async () => {
    expect((await list.GET(listRequest('para/TC/Projects/'), {})).status).toBe(200)
    expect(storage.listDocuments).toHaveBeenCalledWith('para/TC/Projects/')
  })
  test('url signs a key of the caller', async () => {
    expect((await url.GET(urlRequest('para/TC/Projects/a.pdf'), {})).status).toBe(200)
    expect(storage.generateDownloadUrl).toHaveBeenCalledWith('para/TC/Projects/a.pdf', false, 3600)
  })
  test('upload signs a key inside the PARA folders of the caller', async () => {
    const response = await upload.POST(uploadRequest('para/TC/Areas/'), {})
    expect(response.status).toBe(200)
    expect(storage.generateUploadUrl).toHaveBeenCalledWith('para/TC/Areas/a.pdf', 900)
  })
  test('upload refuses a folder outside the PARA categories', async () => {
    expect((await upload.POST(uploadRequest('para/TC/Secret/'), {})).status).toBe(400)
  })
  test('upload refuses a file name that walks out of the folder', async () => {
    expect((await upload.POST(uploadRequest('para/TC/Areas/', '..'), {})).status).toBe(400)
    expect(storage.generateUploadUrl).not.toHaveBeenCalled()
  })
  test('a user without an HTX is refused', async () => {
    mock(auth).mockResolvedValue({ user: { id: 'u1', role: 'officer', htxCode: null, name: 'U' } })
    expect((await list.GET(listRequest('para/TC/Projects/'), {})).status).toBe(403)
    expect(storage.listDocuments).not.toHaveBeenCalled()
  })
})

describe('certificate keys stay inside the namespace of the caller', () => {
  test.each(['para/LB/Archives/x.pdf', 'para/TC/../LB/x.pdf', 'para/Archives/x.pdf'])('export-qr refuses %s', async (key) => {
    expect((await exportQr.POST(post({ certificate_keys: ['para/TC/ok.pdf', key] }), ctx)).status).toBe(400)
    expect(exportExecute).not.toHaveBeenCalled()
  })
  test('export-qr accepts keys of the caller', async () => {
    expect((await exportQr.POST(post({ certificate_keys: ['para/TC/ok.pdf'] }), ctx)).status).toBe(200)
    expect(exportExecute.mock.calls[0].slice(0, 2)).toEqual(['lot-1', ['para/TC/ok.pdf']])
  })
  test('export-qr passes the HTX code to the use case', async () => {
    await exportQr.POST(post({}), ctx)
    expect(mock(ExportQrUseCase).mock.calls[0][4]).toBe('TC')
  })
  test('creating a lot refuses a certificate key of another HTX', async () => {
    const body = { crop: 'Chè', harvest_date: '2026-01-01', parcel_ids: ['p1'], certificate_keys: ['para/LB/x.pdf'] }
    expect((await lots.POST(post(body), {})).status).toBe(400)
    expect(createExecute).not.toHaveBeenCalled()
  })
})

describe('server-side writers use the namespace of the owning HTX', () => {
  test('batch approval archives journals under the HTX', async () => {
    const journal = {
      batchApprove: jest.fn().mockResolvedValue({ approved: 1, failed: [] }),
      findById: jest.fn().mockResolvedValue({ parcel_id: 'p', entry_date: '2026-01-01', activities: [] }),
    }
    const documents = { uploadDocument: jest.fn().mockResolvedValue(undefined) }
    await new BatchApproveJournalUseCase(journal as never, documents as never).execute(['e1'], 'u1', 'TC')
    expect(documents.uploadDocument.mock.calls[0][0]).toBe('para/TC/Archives/Journals/Records/e1.html')
  })
})
