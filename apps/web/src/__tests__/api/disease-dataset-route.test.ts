/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import * as route from '@/app/api/platform/disease-dataset/route'

const execute = jest.fn()
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/application/disease/build-disease-dataset.usecase', () => ({ BuildDiseaseDatasetUseCase: jest.fn(() => ({ execute })) }))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseDatasetRepository', () => ({ PrismaDiseaseDatasetRepository: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({ MinioStorageAdapter: jest.fn() }))

const get = (query = '') => route.GET(new Request(`http://x/api/platform/disease-dataset${query}`), {})
const signIn = (role: string | null) => (auth as jest.Mock).mockResolvedValue(role ? { user: { id: 'u1', role } } : null)

beforeEach(() => {
  jest.clearAllMocks()
  execute.mockResolvedValue({ items: [], next_cursor: null })
})

describe('GET /api/platform/disease-dataset', () => {
  it('is for the platform admin only', async () => {
    signIn(null)
    expect((await get()).status).toBe(401)
    for (const role of ['manager', 'officer', 'farmer', 'accountant']) {
      signIn(role)
      expect((await get()).status).toBe(403)
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns the manifest uncached, passing since and htx', async () => {
    signIn('platform_admin')
    execute.mockResolvedValue({ items: [{ report_id: 'r1' }], next_cursor: 'abc' })
    const res = await get('?since=2026-11-01&htx=TC&cursor=abc')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ items: [{ report_id: 'r1' }], next_cursor: 'abc' })
    expect(execute).toHaveBeenCalledWith({ since: new Date('2026-11-01'), htxCode: 'TC', cursor: 'abc' })
  })

  it('answers 400 for a bad date', async () => {
    signIn('platform_admin')
    expect((await get('?since=yesterday')).status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })
})
