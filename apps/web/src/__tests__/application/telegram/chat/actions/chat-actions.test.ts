/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import type { ChatAction, ChatUser, ChoiceStep, FlowStep, PhotoStep } from '@/application/telegram/chat/types'
import { assertJournalPhotoKey, journalPhotoRoot } from '@/domain/document/document-namespace'
import { DomainError } from '@/domain/errors'
import { getCoreToken } from '@/lib/auth/core-token'

const mockFakes = {
  parcels: jest.fn(),
  guardParcel: jest.fn(),
  guardJournal: jest.fn(),
  journalFindAll: jest.fn(),
  journalFindById: jest.fn(),
  journalScoped: jest.fn(),
  createEntry: jest.fn(),
  submitDiagnosis: jest.fn(),
  batchApprove: jest.fn(),
  approveHarvest: jest.fn(),
}
const fakes = mockFakes

// The Telegram update route has no browser session: loading the auth module must fail here.
jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({
  PrismaParcelRepository: jest.fn(() => ({ findAll: (...args: unknown[]) => mockFakes.parcels(...args) })),
}))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({
  PrismaJournalRepository: jest.fn(() => ({
    findAll: (...args: unknown[]) => mockFakes.journalFindAll(...args),
    findById: (...args: unknown[]) => mockFakes.journalFindById(...args),
    findManyScoped: (...args: unknown[]) => mockFakes.journalScoped(...args),
  })),
}))
jest.mock('@/lib/api/tenant-guard', () => ({
  TenantGuard: jest.fn(() => ({
    parcel: (...args: unknown[]) => mockFakes.guardParcel(...args),
    journalEntry: (...args: unknown[]) => mockFakes.guardJournal(...args),
  })),
}))
jest.mock('@/application/journal/CreateJournalEntryUseCase', () => ({
  CreateJournalEntryUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.createEntry(...args) })),
}))
jest.mock('@/application/disease/submit-diagnosis.usecase', () => ({
  SubmitDiagnosisUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.submitDiagnosis(...args) })),
}))
jest.mock('@/infrastructure/disease-api/disease-api.adapter', () => ({ DiseaseApiAdapter: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({ MinioStorageAdapter: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseReportRepository', () => ({ PrismaDiseaseReportRepository: jest.fn() }))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({ PrismaNotificationRepository: jest.fn() }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn(async () => 'core-token') }))
jest.mock('@/application/journal/BatchApproveJournalUseCase', () => ({
  BatchApproveJournalUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.batchApprove(...args) })),
}))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn() }))
jest.mock('@/application/farm/approve-harvest-usecase', () => ({
  ApproveHarvestUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.approveHarvest(...args) })),
}))

const farmer: ChatUser = {
  tenant: { userId: 'farmer-1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx-tc' },
  userName: 'Nguyen Van A',
  householdId: 'hh_tc_1',
  telegramUserId: '1001',
  chatId: 1001,
}
const officer: ChatUser = {
  tenant: { userId: 'officer-1', role: 'officer', htxCode: 'TC', htxProfileId: 'htx-tc' },
  userName: 'Officer',
  householdId: null,
  telegramUserId: '2002',
  chatId: 2002,
}
const manager: ChatUser = { ...officer, tenant: { ...officer.tenant, userId: 'manager-1', role: 'manager' }, telegramUserId: '3003', chatId: 3003 }
const deps = { photos: { put: jest.fn(), get: jest.fn(async () => Buffer.from('jpeg')) } }
const NOW = new Date('2026-11-26T03:00:00.000Z')

function action(name: string): ChatAction {
  const found = CHAT_ACTIONS.find((a) => a.name === name)
  if (!found) throw new Error(`no action ${name}`)
  return found
}

function stepOf(a: ChatAction, slot: string): FlowStep {
  const found = a.steps.find((s) => s.slot === slot)
  if (!found) throw new Error(`no step ${slot}`)
  return found
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const fake of Object.values(fakes)) fake.mockReset()
  fakes.parcels.mockResolvedValue([
    { id: 'p1', parcel_code: 'TC-A1', household_id: 'hh_tc_1', crop_type: 'Chè', status: 'ACTIVE', centroid_lat: 10, centroid_lng: 106 },
    { id: 'p2', parcel_code: 'TC-B9', household_id: 'hh_tc_1', crop_type: 'Chè', status: 'TENDING', centroid_lat: 10, centroid_lng: 106 },
  ])
  fakes.guardParcel.mockResolvedValue(undefined)
  fakes.guardJournal.mockResolvedValue(undefined)
  fakes.createEntry.mockResolvedValue({ id: 'entry-1' })
  fakes.submitDiagnosis.mockResolvedValue({ report_id: 'r1', disease_name: 'Bệnh đốm nâu', confidence_score: 0.873, uncertain: false })
  fakes.batchApprove.mockResolvedValue({ approved: 7, failed: [] })
  fakes.approveHarvest.mockResolvedValue({ id: 'p2', parcel_code: 'TC-B9', status: 'TENDING' })
})

describe('CHAT_ACTIONS (contract C6)', () => {
  it('lists the four actions in contract order with the roles of their routes', () => {
    expect(CHAT_ACTIONS.map((a) => [a.name, [...a.roles]])).toEqual([
      ['journal.create', ['farmer', 'officer']],
      ['disease.report', ['farmer']],
      ['journal.batch_approve', ['officer', 'manager']],
      ['harvest.approve', ['officer', 'manager']],
    ])
  })

  it('marks only harvest.approve as high risk, with a second-card consequence', () => {
    for (const a of CHAT_ACTIONS) {
      if (a.risk === 'high') expect(a.consequenceVi).toEqual(expect.any(String))
      else expect(a.consequenceVi).toBeNull()
    }
    expect(action('harvest.approve').risk).toBe('high')
  })
})

describe('journal.create', () => {
  const a = () => action('journal.create')

  it('asks the steps of C6 in order, with the prompts of C6', () => {
    expect(a().steps.map((s) => s.slot)).toEqual(['parcel_id', 'activity_type', 'product_name', 'dosage', 'withdrawal_days', 'photo_key'])
    expect(a().steps.map((s) => s.promptVi)).toEqual([
      'Chọn thửa:',
      'Chọn hoạt động:',
      'Tên thuốc hoặc phân bón:',
      'Liều lượng, ví dụ 20 ml cho bình 16 lít:',
      'Số ngày cách ly ghi trên bao bì (0 đến 365):',
      'Gửi một ảnh minh chứng, hoặc bấm Bỏ qua.',
    ])
  })

  it('offers the activities in C6 order with their Vietnamese labels', async () => {
    const choices = await (stepOf(a(), 'activity_type') as ChoiceStep).choices(farmer, {})
    expect(choices).toEqual([
      { value: 'SPRAYING', label: 'Phun thuốc' },
      { value: 'FERTILIZING', label: 'Bón phân' },
      { value: 'IRRIGATION', label: 'Tưới tiêu' },
      { value: 'HARVEST', label: 'Thu hoạch' },
      { value: 'SOWING', label: 'Gieo sạ' },
      { value: 'OTHER', label: 'Khác' },
    ])
  })

  it('offers the parcels the farmer may write for, by code', async () => {
    const choices = await (stepOf(a(), 'parcel_id') as ChoiceStep).choices(farmer, {})
    expect(fakes.parcels).toHaveBeenCalledWith({ htx_profile_id: 'htx-tc', household_id: 'hh_tc_1' })
    expect(choices).toEqual([
      { value: 'p1', label: 'TC-A1' },
      { value: 'p2', label: 'TC-B9' },
    ])
  })

  it('skips product, dosage and withdrawal for irrigation', () => {
    const irrigation = { activity_type: 'IRRIGATION' }
    expect(stepOf(a(), 'product_name').when?.(irrigation)).toBe(false)
    expect(stepOf(a(), 'dosage').when?.(irrigation)).toBe(false)
    expect(stepOf(a(), 'withdrawal_days').when?.(irrigation)).toBe(false)
    expect(stepOf(a(), 'product_name').when?.({ activity_type: 'FERTILIZING' })).toBe(true)
    expect(stepOf(a(), 'withdrawal_days').when?.({ activity_type: 'FERTILIZING' })).toBe(false)
    expect(stepOf(a(), 'withdrawal_days').when?.({ activity_type: 'SPRAYING' })).toBe(true)
  })

  it('makes the photo step optional with a key that passes assertJournalPhotoKey', () => {
    const photo = stepOf(a(), 'photo_key') as PhotoStep
    expect(photo.optional).toBe(true)
    const key = photo.photoKey(farmer)
    expect(key.startsWith(journalPhotoRoot('TC'))).toBe(true)
    expect(() => assertJournalPhotoKey(key, 'TC')).not.toThrow()
  })

  it('builds the card lines of C6', async () => {
    const lines = await a().preview(
      { parcel_id: 'p1', activity_type: 'SPRAYING', product_name: 'Regent 800WG', dosage: '20 ml', withdrawal_days: 7, photo_key: 'k' },
      farmer
    )
    expect(lines[0]).toBe('Thửa: TC-A1')
    expect(lines[1]).toMatch(/^Ngày: \d{2}\/\d{2}\/\d{4}$/)
    expect(lines.slice(2)).toEqual(['Hoạt động: Phun thuốc', 'Thuốc/phân: Regent 800WG', 'Liều: 20 ml', 'Cách ly: 7 ngày', 'Ảnh: có'])
  })

  it('shows no photo line as "không" without a photo', async () => {
    const lines = await a().preview({ parcel_id: 'p1', activity_type: 'IRRIGATION' }, farmer)
    expect(lines.at(-1)).toBe('Ảnh: không')
  })

  it('writes one entry through CreateJournalEntryUseCase with the role, household and photo key', async () => {
    const payload = { parcel_id: 'p1', activity_type: 'SPRAYING', product_name: 'Regent 800WG', dosage: '20 ml', withdrawal_days: 7, photo_key: `${journalPhotoRoot('TC')}2026/x-telegram.jpg` }
    const result = await a().execute(payload, farmer, deps, NOW)
    expect(fakes.guardParcel).toHaveBeenCalledWith('p1')
    expect(fakes.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        parcel_id: 'p1',
        activity_type: 'SPRAYING',
        performed_by: 'Nguyen Van A',
        submitted_by_id: 'farmer-1',
        submitted_role: 'FARMER',
        activities: [{ activity_type: 'SPRAYING', product_name: 'Regent 800WG', dosage: '20 ml', withdrawal_days: 7 }],
        photo_minio_key: payload.photo_key,
      }),
      'FARMER',
      'hh_tc_1'
    )
    expect(result).toBe('Đã ghi nhật ký. Nhật ký đang chờ duyệt.')
  })

  it('refuses a photo key outside the journal photo root', async () => {
    await expect(
      a().execute({ parcel_id: 'p1', activity_type: 'IRRIGATION', photo_key: 'other/x.jpg' }, farmer, deps, NOW)
    ).rejects.toThrow()
    expect(fakes.createEntry).not.toHaveBeenCalled()
  })
})

describe('disease.report', () => {
  const a = () => action('disease.report')

  it('is farmer only, low risk, and asks a parcel then a clear leaf photo', () => {
    expect(a().risk).toBe('low')
    expect(a().steps.map((s) => s.slot)).toEqual(['parcel_id', 'photo_key'])
    expect(a().steps.map((s) => s.promptVi)[1]).toBe('Gửi ảnh lá chè bị bệnh, chụp rõ một lá.')
    expect((stepOf(a(), 'photo_key') as PhotoStep).optional).toBe(false)
    expect((stepOf(a(), 'photo_key') as PhotoStep).photoKey(farmer)).toMatch(/^telegram\/TC\/\d{4}\/.+\.jpg$/)
  })

  it('reads the photo and submits it as the route does', async () => {
    const result = await a().execute({ parcel_id: 'p1', photo_key: 'telegram/TC/2026/x.jpg' }, farmer, deps, NOW)
    expect(deps.photos.get).toHaveBeenCalledWith('telegram/TC/2026/x.jpg')
    expect(fakes.guardParcel).toHaveBeenCalledWith('p1')
    expect(fakes.submitDiagnosis).toHaveBeenCalledWith(
      expect.objectContaining({ farmerUserId: 'farmer-1', htxCode: 'TC', parcelId: 'p1', mimeType: 'image/jpeg' })
    )
    expect(result).toBe('Đã gửi ảnh. AI nhận định: Bệnh đốm nâu (87%). Cán bộ sẽ xem lại.')
  })

  it('answers without an AI result when the model is uncertain', async () => {
    fakes.submitDiagnosis.mockResolvedValue({ report_id: 'r1', disease_name: 'Không xác định', confidence_score: 0.2, uncertain: true })
    const result = await a().execute({ parcel_id: 'p1', photo_key: 'telegram/TC/2026/x.jpg' }, farmer, deps, NOW)
    expect(result).toBe('Đã gửi ảnh. Cán bộ sẽ xem lại.')
  })
})

describe('journal.batch_approve', () => {
  const a = () => action('journal.batch_approve')

  it('has no steps', () => {
    expect(a().steps).toEqual([])
    expect(a().risk).toBe('medium')
  })

  it('replies with nothing to approve when no entry is pending', async () => {
    fakes.journalFindAll.mockResolvedValueOnce({ entries: [], total: 0 })
    const started = await a().start!(officer, NOW)
    expect(started).toEqual({ replyVi: 'Không có nhật ký nào đang chờ duyệt.' })
  })

  it('takes the oldest pending entries first, up to fifty', async () => {
    const newestFirst = Array.from({ length: 7 }, (_, i) => ({ id: `e${7 - i}` }))
    fakes.journalFindAll
      .mockResolvedValueOnce({ entries: [], total: 7 })
      .mockResolvedValueOnce({ entries: newestFirst, total: 7 })
    const started = await a().start!(officer, NOW)
    expect(started).toEqual({ state: { entry_ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'] } })
  })

  it('shows five entries and the count of the rest', async () => {
    const ids = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']
    fakes.journalScoped.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ id, parcel_code: `TC-${id}`, activity_type: 'SPRAYING', entry_date: new Date('2026-11-25T00:00:00Z') }))
    )
    const lines = await a().preview({ entry_ids: ids }, officer)
    expect(lines).toEqual([
      'Số nhật ký: 7',
      '• TC-e1 · Phun thuốc · 25/11',
      '• TC-e2 · Phun thuốc · 25/11',
      '• TC-e3 · Phun thuốc · 25/11',
      '• TC-e4 · Phun thuốc · 25/11',
      '• TC-e5 · Phun thuốc · 25/11',
      '… và 2 nhật ký khác',
    ])
  })

  it('checks every entry with the tenant guard and approves through the batch use case', async () => {
    const result = await a().execute({ entry_ids: ['e1', 'e2'] }, officer, deps, NOW)
    expect(fakes.guardJournal).toHaveBeenCalledTimes(2)
    expect(fakes.batchApprove).toHaveBeenCalledWith(['e1', 'e2'], 'officer-1', 'TC')
    expect(result).toBe('Đã duyệt 7 nhật ký.')
  })
})

describe('no session on the read paths', () => {
  it('only disease.report reads the core token, and only when it runs', async () => {
    fakes.journalFindAll.mockResolvedValue({ entries: [], total: 0 })
    fakes.journalScoped.mockResolvedValue([])
    const readPaths = CHAT_ACTIONS.filter((a) => a.name !== 'disease.report')
    for (const a of readPaths) {
      for (const step of a.steps) if (step.kind === 'choice') await step.choices(officer, {})
      if (a.start) await a.start(officer, NOW)
    }
    await action('journal.create').preview({ parcel_id: 'p1', activity_type: 'IRRIGATION' }, farmer)
    await action('journal.batch_approve').preview({ entry_ids: ['e1'] }, officer)
    await action('harvest.approve').preview({ parcel_id: 'p2' }, officer)
    expect(getCoreToken).not.toHaveBeenCalled()
  })
})

describe('harvest.approve', () => {
  const a = () => action('harvest.approve')

  it('is high risk and offers only the cooperative parcels in TENDING', async () => {
    expect(a().risk).toBe('high')
    expect(a().consequenceVi).toBe('Thửa sẽ được phép thu hái. Hệ thống kiểm tra lại thời gian cách ly trước khi duyệt.')
    const choices = await (stepOf(a(), 'parcel_id') as ChoiceStep).choices(officer, {})
    expect(choices).toEqual([{ value: 'p2', label: 'TC-B9' }])
  })

  it('approves through ApproveHarvestUseCase after the tenant guard', async () => {
    const result = await a().execute({ parcel_id: 'p2' }, manager, deps, NOW)
    expect(fakes.guardParcel).toHaveBeenCalledWith('p2')
    expect(fakes.approveHarvest).toHaveBeenCalledWith('p2', 'manager-1', 'manager')
    expect(result).toBe('Đã duyệt thu hoạch thửa TC-B9.')
  })

  it('surfaces a domain error from the use case', async () => {
    fakes.approveHarvest.mockRejectedValue(new DomainError('Chưa qua thời gian cách ly'))
    await expect(a().execute({ parcel_id: 'p2' }, officer, deps, NOW)).rejects.toThrow('Chưa qua thời gian cách ly')
  })
})
