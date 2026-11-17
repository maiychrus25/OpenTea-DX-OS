/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { resetJwksCache } from '@/lib/auth/request-user'
import { DiseaseApiAdapter } from '@/infrastructure/disease-api/disease-api.adapter'
import { SubmitDiagnosisUseCase } from '@/application/disease/submit-diagnosis.usecase'
import * as diagnosis from '@/app/api/diagnosis/route'
import { baseClaims, jwksResponse, makeKey, signToken } from '@/test-support/bearer-fixture'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn(async (user: { id: string; role: string; htxCode: string | null }) => {
    if (!user.htxCode) throw new (jest.requireActual('@/domain/errors').NoHtxError)()
    return { userId: user.id, role: user.role, htxCode: user.htxCode, htxProfileId: 'htx-1' }
  }),
}))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => ({ parcel: jest.fn() })) }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn(async () => 'cookie-core-token') }))
jest.mock('@/infrastructure/disease-api/disease-api.adapter', () => ({ DiseaseApiAdapter: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({ MinioStorageAdapter: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({ PrismaParcelRepository: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseReportRepository', () => ({ PrismaDiseaseReportRepository: jest.fn() }))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({
  PrismaNotificationRepository: jest.fn(),
}))
jest.mock('@/application/disease/submit-diagnosis.usecase', () => ({ SubmitDiagnosisUseCase: jest.fn() }))

const mock = (fn: unknown) => fn as jest.Mock
const key = makeKey('k1')
const fetchMock = jest.fn()
const originalFetch = global.fetch
const execute = jest.fn()
const PARCEL = 'clh0000000000000000000000'
const RESULT = {
  report_id: 'r1',
  disease_name: 'Đốm nâu',
  confidence_score: 0.91,
  image_url: 'https://minio/disease/r1.jpg',
  submitted_at: '2026-11-18T00:00:00Z',
  uncertain: false,
}

const token = (roles: string[], claims: Record<string, unknown> = {}) =>
  signToken(key, baseClaims({ realm_access: { roles }, ...claims }))

const call = (init: { token?: string; parcel?: string; type?: string; bytes?: number } = {}) => {
  const form = new FormData()
  form.set('image', new File([new Uint8Array(init.bytes ?? 10)], 'leaf.jpg', { type: init.type ?? 'image/jpeg' }))
  form.set('parcel_id', init.parcel ?? PARCEL)
  return new Request('http://localhost/api/diagnosis', {
    method: 'POST',
    headers: init.token ? { authorization: `Bearer ${init.token}` } : {},
    body: form,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetJwksCache()
  process.env.KEYCLOAK_ISSUER = 'http://keycloak.test/realms/agrimarket'
  fetchMock.mockImplementation(async () => jwksResponse(key))
  global.fetch = fetchMock as unknown as typeof fetch
  mock(auth).mockResolvedValue(null)
  execute.mockResolvedValue(RESULT)
  mock(SubmitDiagnosisUseCase).mockImplementation(() => ({ execute }))
})

afterAll(() => {
  global.fetch = originalFetch
})

describe('POST /api/diagnosis with a mobile Bearer token', () => {
  test('a farmer token runs the diagnosis as that farmer and uses the token for the disease API', async () => {
    const response = await diagnosis.POST(call({ token: token(['farmer']) }))
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual(RESULT)
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ farmerUserId: 'user-1', htxCode: 'TC', parcelId: PARCEL, mimeType: 'image/jpeg' }),
    )
    // The disease API is called with the caller's own verified token, not the session's core token.
    const used = String(mock(DiseaseApiAdapter).mock.calls[0][0])
    expect(used).not.toBe('cookie-core-token')
    expect(used.split('.')).toHaveLength(3)
  })

  test('a cookie session still works and uses the session core token', async () => {
    mock(auth).mockResolvedValue({ user: { id: 'cookie-user', role: 'farmer', htxCode: 'TC', name: 'C' } })
    const response = await diagnosis.POST(call())
    expect(response.status).toBe(200)
    expect(mock(DiseaseApiAdapter).mock.calls[0][0]).toBe('cookie-core-token')
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ farmerUserId: 'cookie-user' }))
  })

  test('no cookie and no token answers 401', async () => {
    const response = await diagnosis.POST(call())
    expect(response.status).toBe(401)
    expect(execute).not.toHaveBeenCalled()
  })

  test('a token that is not valid answers 401 and never falls back to the cookie', async () => {
    mock(auth).mockResolvedValue({ user: { id: 'cookie-user', role: 'farmer', htxCode: 'TC' } })
    const response = await diagnosis.POST(call({ token: 'not-a-token' }))
    expect(response.status).toBe(401)
    expect(execute).not.toHaveBeenCalled()
  })

  test('a token of another client answers 401', async () => {
    const response = await diagnosis.POST(call({ token: token(['farmer'], { azp: 'dx-web' }) }))
    expect(response.status).toBe(401)
  })

  test('a customer token (no staff role) answers 403', async () => {
    const response = await diagnosis.POST(call({ token: token(['customer']) }))
    expect(response.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })

  test('an officer token answers 403: only farmers diagnose', async () => {
    const response = await diagnosis.POST(call({ token: token(['officer']) }))
    expect(response.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })

  test('a farmer token without a cooperative answers 403 NO_HTX', async () => {
    const response = await diagnosis.POST(call({ token: token(['farmer'], { htx_code: undefined }) }))
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
  })

  test('the image rules still apply: only JPEG or PNG, at most 5 MB, a valid parcel id', async () => {
    const bearer = token(['farmer'])
    expect((await diagnosis.POST(call({ token: bearer, type: 'image/gif' }))).status).toBe(400)
    expect((await diagnosis.POST(call({ token: bearer, bytes: 5 * 1024 * 1024 + 1 }))).status).toBe(400)
    expect((await diagnosis.POST(call({ token: bearer, parcel: 'not-a-cuid' }))).status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  test('the key set being unreachable answers 503 and does not trust the token', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    const response = await diagnosis.POST(call({ token: token(['farmer']) }))
    expect(response.status).toBe(503)
    expect(execute).not.toHaveBeenCalled()
  })
})
