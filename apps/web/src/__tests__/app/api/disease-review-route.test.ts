/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { PUT } from '@/app/api/officer/diseases/[id]/review/route'

const execute = jest.fn()
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn().mockResolvedValue({ htxCode: 'TC' }) }))
jest.mock('@/lib/api/tenant-guard', () => ({
  TenantGuard: jest.fn().mockImplementation(() => ({ diseaseReport: jest.fn().mockResolvedValue(undefined) })),
}))
jest.mock('@/application/disease/review-disease-report.usecase', () => ({
  ReviewDiseaseReportUseCase: jest.fn().mockImplementation(() => ({ execute })),
}))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseReportRepository', () => ({ PrismaDiseaseReportRepository: jest.fn() }))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({ PrismaNotificationRepository: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({ MinioStorageAdapter: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn() }))

const put = (body: unknown) =>
  PUT(new Request('http://web/api/officer/diseases/r1/review', { method: 'PUT', body: JSON.stringify(body) }), {
    params: { id: 'r1' },
  })

beforeEach(() => {
  jest.clearAllMocks()
  execute.mockResolvedValue({ draftJournalEntryId: undefined })
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'off1', role: 'officer' } })
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('PUT /api/officer/diseases/[id]/review', () => {
  test('passes the confirmed diagnosis to the use case', async () => {
    const res = await put({ status: 'CONFIRMED', treatment_recommendation: 'Cắt lá', confirmed_diagnosis: 'Đốm nâu' })

    expect(res.status).toBe(200)
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ status: 'CONFIRMED', confirmed_diagnosis: 'Đốm nâu' }))
  })

  test('a REJECTED body without a confirmed diagnosis is still accepted', async () => {
    const res = await put({ status: 'REJECTED' })

    expect(res.status).toBe(200)
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ status: 'REJECTED', confirmed_diagnosis: '' }))
  })

  test('CONFIRMED without a confirmed diagnosis answers 400 in Vietnamese', async () => {
    execute.mockRejectedValueOnce(new Error('DIAGNOSIS_REQUIRED'))

    const res = await put({ status: 'CONFIRMED', treatment_recommendation: 'Cắt lá' })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Vui lòng nhập tên bệnh đã xác nhận trước khi duyệt.' },
    })
  })

  test('a confirmed diagnosis over 200 characters answers 400 in Vietnamese before the use case runs', async () => {
    const res = await put({ status: 'CONFIRMED', treatment_recommendation: 'Cắt lá', confirmed_diagnosis: 'x'.repeat(201) })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Tên bệnh tối đa 200 ký tự.' } })
    expect(execute).not.toHaveBeenCalled()
  })

  test('the 200-character limit applies after trimming', async () => {
    const name = 'x'.repeat(200)
    const res = await put({ status: 'CONFIRMED', treatment_recommendation: 'Cắt lá', confirmed_diagnosis: `   ${name}   ` })

    expect(res.status).toBe(200)
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ confirmed_diagnosis: name }))
  })

  test('a farmer cannot review', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'f1', role: 'farmer' } })
    const res = await put({ status: 'REJECTED' })
    expect(res.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('prescription field', () => {
  it('passes the prescription to the use case and returns the draft id', async () => {
    execute.mockResolvedValue({ draftJournalEntryId: 'draft-1' })
    const res = await put({ status: 'CONFIRMED', treatment_recommendation: 'Phun', confirmed_diagnosis: 'Nhện đỏ', prescription: { pesticide_product_id: 'catex', dosage: '20 ml' } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ data: { draftJournalEntryId: 'draft-1' } })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ prescription: { pesticideProductId: 'catex', dosage: '20 ml' } }))
  })

  it('answers 400 when the use case refuses a prescription on a rejected report', async () => {
    execute.mockRejectedValueOnce(new Error('PRESCRIPTION_REQUIRES_CONFIRMED'))
    const res = await put({ status: 'REJECTED', prescription: { pesticide_product_id: 'catex' } })
    expect(res.status).toBe(400)
  })
})
