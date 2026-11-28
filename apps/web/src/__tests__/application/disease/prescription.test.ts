/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ReviewDiseaseReportUseCase } from '@/application/disease/review-disease-report.usecase'
import { countsTowardWithdrawal } from '@/domain/journal/withdrawal-status'

const report = { id: 'r1', status: 'PENDING', farmer_id: 'f1', parcel_code: 'A1', ai_disease_name: 'x', ai_confidence: 0.9, detection_date: new Date(), farmer_name: 'F', photo_minio_key: '' }

function build(floor: { productId: string; floorDays: number } | null = { productId: 'catex', floorDays: 14 }) {
  const reports = {
    findById: jest.fn(async () => report),
    updateStatus: jest.fn(async (_id: string, _s: string, _t: string, _o: string, _d: string | null, p?: unknown) =>
      p ? { draftJournalEntryId: 'draft-1', prescribedProductName: 'Catex 3.6EC' } : {}
    ),
  }
  const notifications = { sendDirectNotification: jest.fn() }
  const docs = { uploadDocument: jest.fn() }
  const pesticides = { floorFor: jest.fn(async () => floor) }
  const useCase = new ReviewDiseaseReportUseCase(reports as never, notifications as never, { getFileBuffer: jest.fn() } as never, docs as never, pesticides as never, { exists: jest.fn(async () => true) } as never)
  return { useCase, reports, notifications }
}
const confirm = { reportId: 'r1', officerId: 'o1', htxCode: 'TC', htxProfileId: 'htx', officerName: 'Cán bộ A', status: 'CONFIRMED' as const, treatment_recommendation: 'Phun thuốc', confirmed_diagnosis: 'Nhện đỏ', confirmed_label_code: 'red_spider_mite' }

describe('prescription on a confirmed disease report', () => {
  it('creates exactly one DRAFT spraying with the floor days and tells the farmer', async () => {
    const { useCase, reports, notifications } = build()
    const result = await useCase.execute({ ...confirm, prescription: { pesticideProductId: 'catex', dosage: '20 ml' } })

    expect(result.draftJournalEntryId).toBe('draft-1')
    expect(reports.updateStatus).toHaveBeenCalledTimes(1)
    expect(reports.updateStatus.mock.calls[0][5]).toEqual({ pesticideProductId: 'catex', floorDays: 14, dosage: '20 ml', officerName: 'Cán bộ A' })
    expect(notifications.sendDirectNotification.mock.calls[0][3]).toContain('Cán bộ kê đơn Catex 3.6EC. Khi phun xong, mở nhật ký nháp và bấm Đã phun.')
  })

  it('is rejected unless the status is CONFIRMED', async () => {
    const { useCase, reports } = build()
    await expect(
      useCase.execute({ ...confirm, status: 'REJECTED', prescription: { pesticideProductId: 'catex' } })
    ).rejects.toThrow('PRESCRIPTION_REQUIRES_CONFIRMED')
    expect(reports.updateStatus).not.toHaveBeenCalled()
  })

  it('is rejected for a product that is not in the catalogue', async () => {
    const { useCase, reports } = build(null)
    await expect(useCase.execute({ ...confirm, prescription: { pesticideProductId: 'nope' } })).rejects.toThrow('PESTICIDE_NOT_FOUND')
    expect(reports.updateStatus).not.toHaveBeenCalled()
  })

  it('without a prescription behaves as before and creates no draft', async () => {
    const { useCase, reports } = build()
    const result = await useCase.execute(confirm)
    expect(result.draftJournalEntryId).toBeUndefined()
    expect(reports.updateStatus.mock.calls[0][5]).toBeUndefined()
  })

  it('a DRAFT does not count toward withdrawal', () => {
    expect(countsTowardWithdrawal('DRAFT')).toBe(false)
  })
})
