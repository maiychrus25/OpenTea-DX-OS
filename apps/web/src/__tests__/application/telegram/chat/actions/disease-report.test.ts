/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ChatUser, ChoiceStep, PhotoStep } from '@/application/telegram/chat/types'
import { diseaseReportAction } from '@/application/telegram/chat/actions/disease-report'
import { DomainError } from '@/domain/errors'

const mockFakes = {
  parcels: jest.fn(),
  guardParcel: jest.fn(),
  findParcel: jest.fn(),
  uploadFile: jest.fn(),
  saveReport: jest.fn(),
  broadcast: jest.fn(),
  token: jest.fn(),
}

// The Telegram update route has no browser session: loading the auth module or the user's core token must fail here.
jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/lib/auth/core-token', () => {
  throw new Error('chat code loaded the browser session token')
})
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({
  PrismaParcelRepository: jest.fn(() => ({
    findAll: (...args: unknown[]) => mockFakes.parcels(...args),
    findById: (...args: unknown[]) => mockFakes.findParcel(...args),
  })),
}))
jest.mock('@/lib/api/tenant-guard', () => ({
  TenantGuard: jest.fn(() => ({ parcel: (...args: unknown[]) => mockFakes.guardParcel(...args) })),
}))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({
  MinioStorageAdapter: jest.fn(() => ({ uploadFile: (...args: unknown[]) => mockFakes.uploadFile(...args) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseReportRepository', () => ({
  PrismaDiseaseReportRepository: jest.fn(() => ({ save: (...args: unknown[]) => mockFakes.saveReport(...args) })),
}))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({
  PrismaNotificationRepository: jest.fn(() => ({ broadcastDiseaseReport: (...args: unknown[]) => mockFakes.broadcast(...args) })),
}))
jest.mock('@/infrastructure/auth/web-service-token', () => ({
  WebServiceTokenProvider: jest.fn(() => ({ get: (...args: unknown[]) => mockFakes.token(...args) })),
}))

const farmer: ChatUser = {
  tenant: { userId: 'farmer-1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx-tc' },
  userName: 'Nguyen Van A',
  householdId: 'hh_tc_1',
  telegramUserId: '1001',
  chatId: 1001,
}
const NOW = new Date('2026-11-26T03:00:00.000Z')
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const KEY = 'para/TC/Areas/Telegram/Disease/2026/abc-telegram.jpg'
const photos = { put: jest.fn(), get: jest.fn(), delete: jest.fn() }
const payload = { parcel_id: 'p1', photo_key: KEY }
const fetchMock = jest.spyOn(global, 'fetch')

beforeAll(() => {
  process.env.CORE_GATEWAY_URL = 'http://gateway:9081'
})

beforeEach(() => {
  jest.clearAllMocks()
  for (const fake of Object.values(mockFakes)) fake.mockReset()
  mockFakes.parcels.mockResolvedValue([
    { id: 'p1', parcel_code: 'TC-A1', household_id: 'hh_tc_1', crop_type: 'Chè', status: 'ACTIVE', centroid_lat: 10, centroid_lng: 106 },
    { id: 'p9', parcel_code: 'TC-Z9', household_id: 'hh_other', crop_type: 'Chè', status: 'ACTIVE', centroid_lat: 10, centroid_lng: 106 },
  ])
  mockFakes.guardParcel.mockResolvedValue(undefined)
  mockFakes.findParcel.mockResolvedValue({
    id: 'p1', parcel_code: 'TC-A1', household_id: 'hh_tc_1', crop_type: 'Chè', household: { name: 'Hộ A', keycloak_user_id: 'farmer-1' },
  })
  mockFakes.uploadFile.mockResolvedValue({ minioKey: 'para/TC/diag.jpg', presignedUrl: 'http://signed' })
  mockFakes.saveReport.mockResolvedValue({ id: 'r1', ai_disease_name: 'Phồng lá chè', ai_confidence: 0.873, photo_url: 'http://signed', created_at: NOW })
  mockFakes.broadcast.mockResolvedValue(undefined)
  mockFakes.token.mockResolvedValue('svc-token')
  photos.get.mockResolvedValue(JPEG)
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ disease_name_vi: 'Phồng lá chè', confidence: 0.873 }), { status: 200 }))
})

afterAll(() => fetchMock.mockRestore())

const photoStep = diseaseReportAction.steps.find((s) => s.slot === 'photo_key') as PhotoStep
const parcelStep = diseaseReportAction.steps.find((s) => s.slot === 'parcel_id') as ChoiceStep

describe('disease.report (C3)', () => {
  it('is the farmer-only medium action that serves POST /api/diagnosis, with no second card', () => {
    expect(diseaseReportAction).toMatchObject({ name: 'disease.report', risk: 'medium', consequenceVi: null, routes: ['POST /api/diagnosis'] })
    expect([...diseaseReportAction.roles]).toEqual(['farmer'])
  })

  it('offers only the farmer household parcels, then needs a photo', async () => {
    expect(await parcelStep.choices(farmer, {})).toEqual([{ value: 'p1', label: 'TC-A1' }])
    expect(photoStep).toMatchObject({ kind: 'photo', optional: false })
    expect(photoStep.photoKey(farmer)).toMatch(/^para\/TC\/Areas\/Telegram\/Disease\/\d{4}\/[0-9a-f-]{36}-telegram\.jpg$/)
  })

  it('shows the card line "Gửi ảnh thửa <mã> để chẩn đoán"', async () => {
    expect(await diseaseReportAction.preview(payload, farmer)).toEqual(['Gửi ảnh thửa TC-A1 để chẩn đoán'])
  })

  it('submits through the real use case with the web-service token on the internal disease route', async () => {
    const line = await diseaseReportAction.execute(payload, farmer, { photos }, NOW)

    expect(mockFakes.guardParcel).toHaveBeenCalledWith('p1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://gateway:9081/api/internal/web/disease/predict?model=tea')
    expect(init.headers).toEqual({ Authorization: 'Bearer svc-token' })
    expect(mockFakes.uploadFile).toHaveBeenCalledWith(JPEG, 'diagnosis.jpg', 'image/jpeg', 'TC')
    expect(mockFakes.saveReport).toHaveBeenCalledWith(expect.objectContaining({ parcel_id: 'p1', household_id: 'hh_tc_1', detected_by_id: 'farmer-1' }))
    expect(mockFakes.broadcast).toHaveBeenCalledWith('Hộ A', 'Phồng lá chè', 'TC-A1')
    expect(line).toBe('Phồng lá chè (87.3%)\nCán bộ sẽ xác nhận kết quả này.')
  })

  it('sends a PNG as PNG', async () => {
    photos.get.mockResolvedValue(PNG)
    await diseaseReportAction.execute(payload, farmer, { photos }, NOW)
    expect(mockFakes.uploadFile).toHaveBeenCalledWith(PNG, 'diagnosis.jpg', 'image/png', 'TC')
  })

  it('deletes the temporary chat copy once the report is saved, and not before', async () => {
    await diseaseReportAction.execute(payload, farmer, { photos }, NOW)
    expect(photos.delete).toHaveBeenCalledWith(KEY)
    expect(photos.delete.mock.invocationCallOrder[0]).toBeGreaterThan(mockFakes.saveReport.mock.invocationCallOrder[0])
  })

  it('names an uncertain result as such, still handed to the officer', async () => {
    mockFakes.saveReport.mockResolvedValue({ id: 'r1', ai_disease_name: 'Không xác định', ai_confidence: 0.31, photo_url: 'u', created_at: NOW })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ disease_name_vi: null, confidence: 0.31, uncertain: true }), { status: 200 }))
    expect(await diseaseReportAction.execute(payload, farmer, { photos }, NOW)).toBe('Không xác định (31.0%)\nCán bộ sẽ xác nhận kết quả này.')
  })

  it('without the service secret answers "Chưa bật chẩn đoán qua Telegram." and stores and calls nothing', async () => {
    mockFakes.token.mockRejectedValue(new DomainError('Chưa bật chẩn đoán qua Telegram.'))
    await expect(diseaseReportAction.execute(payload, farmer, { photos }, NOW)).rejects.toThrow('Chưa bật chẩn đoán qua Telegram.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockFakes.uploadFile).not.toHaveBeenCalled()
    expect(mockFakes.saveReport).not.toHaveBeenCalled()
  })

  it("refuses another household's parcel without reading the photo or calling the disease API", async () => {
    mockFakes.guardParcel.mockRejectedValue(new DomainError('Không tìm thấy thửa'))
    await expect(diseaseReportAction.execute({ ...payload, parcel_id: 'p9' }, farmer, { photos }, NOW)).rejects.toThrow(DomainError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(photos.get).not.toHaveBeenCalled()
  })

  it('refuses a parcel the farmer does not own even when the tenant guard lets it by', async () => {
    mockFakes.findParcel.mockResolvedValue({ id: 'p9', parcel_code: 'TC-Z9', household_id: 'hh_other', crop_type: 'Chè', household: { name: 'Hộ B', keycloak_user_id: 'someone-else' } })
    await expect(diseaseReportAction.execute({ ...payload, parcel_id: 'p9' }, farmer, { photos }, NOW)).rejects.toThrow(DomainError)
    expect(mockFakes.saveReport).not.toHaveBeenCalled()
  })

  it('refuses a photo key outside the farmer cooperative disease folder', async () => {
    await expect(diseaseReportAction.execute({ ...payload, photo_key: 'para/LB/Areas/Telegram/Disease/2026/x.jpg' }, farmer, { photos }, NOW)).rejects.toThrow(DomainError)
    expect(photos.get).not.toHaveBeenCalled()
  })

  it('refuses a stored image larger than 5 MB or not a JPEG or PNG, and sends nothing', async () => {
    photos.get.mockResolvedValue(Buffer.alloc(5 * 1024 * 1024 + 1, 0xff))
    await expect(diseaseReportAction.execute(payload, farmer, { photos }, NOW)).rejects.toThrow(/5 MB/)
    photos.get.mockResolvedValue(Buffer.from('GIF89a'))
    await expect(diseaseReportAction.execute(payload, farmer, { photos }, NOW)).rejects.toThrow(DomainError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockFakes.uploadFile).not.toHaveBeenCalled()
  })

  it('says the service is down in Vietnamese when the disease API is unavailable, and saves nothing', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    await expect(diseaseReportAction.execute(payload, farmer, { photos }, NOW)).rejects.toThrow(/tạm bảo trì/)
    expect(mockFakes.saveReport).not.toHaveBeenCalled()
    expect(photos.delete).not.toHaveBeenCalled()
  })
})
