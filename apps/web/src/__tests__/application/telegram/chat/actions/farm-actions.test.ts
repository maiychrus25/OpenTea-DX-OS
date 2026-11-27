/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import type { ChatAction, ChatUser, ChoiceStep } from '@/application/telegram/chat/types'
import { NotFoundError } from '@/domain/errors'

const mockFakes = {
  parcels: jest.fn(),
  parcelById: jest.fn(),
  guard: jest.fn(),
  prismaReports: jest.fn(),
  prismaReportOne: jest.fn(),
  prismaCycles: jest.fn(),
  prismaCycleOne: jest.fn(),
  prismaHouseholds: jest.fn(),
  review: jest.fn(),
  startRound: jest.fn(),
  updateDate: jest.fn(),
  createLot: jest.fn(),
  lotsAll: jest.fn(),
  lotById: jest.fn(),
  exportQr: jest.fn(),
  deleteParcel: jest.fn(),
  hhCreate: jest.fn(),
  hhUpdate: jest.fn(),
}

jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/lib/auth/core-token', () => {
  throw new Error('chat code loaded the browser session token')
})
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    diseaseReport: {
      findMany: (...a: unknown[]) => mockFakes.prismaReports(...a),
      findFirst: (...a: unknown[]) => mockFakes.prismaReportOne(...a),
    },
    parcelCropCycle: {
      findMany: (...a: unknown[]) => mockFakes.prismaCycles(...a),
      findFirst: (...a: unknown[]) => mockFakes.prismaCycleOne(...a),
    },
    household: { findMany: (...a: unknown[]) => mockFakes.prismaHouseholds(...a) },
  },
}))
jest.mock('@/lib/api/tenant-guard', () => ({
  TenantGuard: jest.fn(() => {
    const check = (...a: unknown[]) => mockFakes.guard(...a)
    return { parcel: check, diseaseReport: check, cropCycle: check, lot: check, household: check }
  }),
}))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({
  PrismaParcelRepository: jest.fn(() => ({
    findAll: (...a: unknown[]) => mockFakes.parcels(...a),
    findById: (...a: unknown[]) => mockFakes.parcelById(...a),
  })),
}))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseReportRepository', () => ({ PrismaDiseaseReportRepository: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaCropCycleRepository', () => ({ PrismaCropCycleRepository: jest.fn() }))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({ PrismaNotificationRepository: jest.fn() }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({ MinioStorageAdapter: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn() }))
jest.mock('@/infrastructure/db/repositories/prisma-lot-trace-repository', () => ({ PrismaLotTraceRepository: jest.fn() }))
jest.mock('@/infrastructure/db/lot/PrismaLotRepository', () => ({
  PrismaLotRepository: jest.fn(() => ({
    findAll: (...a: unknown[]) => mockFakes.lotsAll(...a),
    findById: (...a: unknown[]) => mockFakes.lotById(...a),
  })),
}))
jest.mock('@/infrastructure/db/farm/PrismaHouseholdRepository', () => ({
  PrismaHouseholdRepository: jest.fn(),
}))
jest.mock('@/application/disease/review-disease-report.usecase', () => ({
  ReviewDiseaseReportUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.review(...a) })),
}))
jest.mock('@/application/farm/start-harvest-round.usecase', () => ({
  StartHarvestRoundUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.startRound(...a) })),
}))
jest.mock('@/application/farm/update-harvest-date-use-case', () => ({
  UpdateHarvestDateUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.updateDate(...a) })),
}))
jest.mock('@/application/lot/CreateLotUseCase', () => ({
  CreateLotUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.createLot(...a) })),
}))
jest.mock('@/application/lot/ExportQrUseCase', () => ({
  ExportQrUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.exportQr(...a) })),
}))
jest.mock('@/application/farm/DeleteParcelUseCase', () => ({
  DeleteParcelUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.deleteParcel(...a) })),
}))
jest.mock('@/application/farm/CreateHouseholdUseCase', () => ({
  CreateHouseholdUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.hhCreate(...a) })),
}))
jest.mock('@/application/farm/UpdateHouseholdUseCase', () => ({
  UpdateHouseholdUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.hhUpdate(...a) })),
}))

const base: ChatUser = {
  tenant: { userId: 'officer-1', role: 'officer', htxCode: 'TC', htxProfileId: 'htx-tc' },
  userName: 'Officer',
  householdId: null,
  telegramUserId: '2002',
  chatId: 2002,
}
const officer = base
const manager: ChatUser = { ...base, tenant: { ...base.tenant, userId: 'manager-1', role: 'manager' } }
const farmer: ChatUser = { ...base, tenant: { ...base.tenant, userId: 'farmer-1', role: 'farmer' }, householdId: 'hh1' }
const deps = { photos: { put: jest.fn(), get: jest.fn() } }
const NOW = new Date('2026-11-27T03:00:00.000Z')

const action = (name: string): ChatAction => {
  const found = CHAT_ACTIONS.find((a) => a.name === name)
  if (!found) throw new Error(`no action ${name}`)
  return found
}
const choicesOf = (a: ChatAction, slot: string, user = officer) => (a.steps.find((s) => s.slot === slot) as ChoiceStep).choices(user, {})
const parcel = (id: string, status: string) => ({ id, parcel_code: `TC-${id}`, household_id: 'hh1', status, crop_type: 'Chè' })

beforeEach(() => {
  for (const fake of Object.values(mockFakes)) fake.mockReset()
  mockFakes.guard.mockResolvedValue(undefined)
  mockFakes.parcels.mockResolvedValue([parcel('p1', 'HARVESTED'), parcel('p2', 'TENDING'), parcel('p3', 'ACTIVE')])
  mockFakes.parcelById.mockResolvedValue(parcel('p1', 'HARVESTED'))
})

describe('the high actions of this track', () => {
  it.each(['journal.delete', 'notification.announce', 'notification.clear', 'member.approve', 'member.remove', 'parcel.delete'])(
    '%s is high with a second-card consequence',
    (name) => {
      expect(action(name).risk).toBe('high')
      expect(action(name).consequenceVi).toEqual(expect.any(String))
    }
  )
})

describe('disease.review', () => {
  const a = () => action('disease.review')
  const payload = { report_id: 'r1', decision: 'CONFIRMED' as const, note: 'Phun Regent 800WG' }

  it('is for officers, as the route is', () => {
    expect([...a().roles]).toEqual(['officer'])
  })

  it('lists the pending reports of the cooperative, newest first, up to eight', async () => {
    mockFakes.prismaReports.mockResolvedValue([{ id: 'r1', ai_disease_name: 'Phấn trắng', parcel: { parcel_code: 'TC-A1' } }])
    expect(await choicesOf(a(), 'report_id')).toEqual([{ value: 'r1', label: 'TC-A1 · Phấn trắng' }])
    expect(mockFakes.prismaReports).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING', household: { htx_profile_id: 'htx-tc' } }, orderBy: { created_at: 'desc' }, take: 8 })
    )
  })

  it('ends the flow when no report is pending', async () => {
    mockFakes.prismaReports.mockResolvedValue([])
    expect(await a().start!(officer, NOW)).toEqual({ replyVi: 'Không có báo cáo bệnh nào đang chờ duyệt.' })
  })

  it('shows the parcel, the AI disease, the decision and the note', async () => {
    mockFakes.prismaReportOne.mockResolvedValue({ id: 'r1', ai_disease_name: 'Phấn trắng', parcel: { parcel_code: 'TC-A1' } })
    expect(await a().preview(payload, officer)).toEqual(['Thửa: TC-A1', 'Bệnh (AI): Phấn trắng', 'Quyết định: Xác nhận', 'Ghi chú: Phun Regent 800WG'])
  })

  it('confirms with the AI disease name through the use case', async () => {
    mockFakes.prismaReportOne.mockResolvedValue({ id: 'r1', ai_disease_name: 'Phấn trắng', parcel: { parcel_code: 'TC-A1' } })
    expect(await a().execute(payload, officer, deps, NOW)).toBe('Đã xác nhận báo cáo bệnh.')
    expect(mockFakes.review).toHaveBeenCalledWith({
      reportId: 'r1',
      officerId: 'officer-1',
      htxCode: 'TC',
      status: 'CONFIRMED',
      treatment_recommendation: 'Phun Regent 800WG',
      confirmed_diagnosis: 'Phấn trắng',
    })
  })

  it('rejects without a confirmed disease', async () => {
    mockFakes.prismaReportOne.mockResolvedValue({ id: 'r1', ai_disease_name: 'Phấn trắng', parcel: { parcel_code: 'TC-A1' } })
    await a().execute({ ...payload, decision: 'REJECTED', note: 'Ảnh mờ' }, officer, deps, NOW)
    expect(mockFakes.review).toHaveBeenCalledWith(expect.objectContaining({ status: 'REJECTED', confirmed_diagnosis: '' }))
  })

  it('says a report already handled in words', async () => {
    mockFakes.prismaReportOne.mockResolvedValue({ id: 'r1', ai_disease_name: 'x', parcel: { parcel_code: 'TC-A1' } })
    mockFakes.review.mockRejectedValue(new Error('INVALID_STATUS_TRANSITION'))
    await expect(a().execute(payload, officer, deps, NOW)).rejects.toThrow('Báo cáo này đã được xử lý.')
  })

  it("answers not found for another cooperative's report and reviews nothing (Review Focus 1)", async () => {
    mockFakes.guard.mockRejectedValue(new NotFoundError('Resource not found'))
    await expect(a().execute(payload, officer, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.review).not.toHaveBeenCalled()
  })
})

describe('round.start', () => {
  const a = () => action('round.start')

  it('offers only harvested parcels and is for officers', async () => {
    expect([...a().roles]).toEqual(['officer'])
    expect(await choicesOf(a(), 'parcel_id')).toEqual([{ value: 'p1', label: 'TC-p1' }])
  })

  it('starts the round through the use case and names the season', async () => {
    mockFakes.startRound.mockResolvedValue({ cycleId: 'c1', season: 'Lứa 2/2026' })
    expect(await a().execute({ parcel_id: 'p1' }, officer, deps, NOW)).toBe('Đã bắt đầu Lứa 2/2026 cho thửa TC-p1.')
    expect(mockFakes.startRound).toHaveBeenCalledWith('p1', 'officer-1')
  })

  it("answers not found for another cooperative's parcel (Review Focus 1)", async () => {
    mockFakes.guard.mockRejectedValue(new NotFoundError())
    await expect(a().execute({ parcel_id: 'zzz' }, officer, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.startRound).not.toHaveBeenCalled()
  })
})

describe('harvest.schedule', () => {
  const a = () => action('harvest.schedule')

  it('is for managers and lists the open cycles of the cooperative', async () => {
    expect([...a().roles]).toEqual(['manager'])
    mockFakes.prismaCycles.mockResolvedValue([{ id: 'c1', season: 'Lứa 1/2026', parcel: { parcel_code: 'TC-A1' } }])
    expect(await choicesOf(a(), 'cycle_id', manager)).toEqual([{ value: 'c1', label: 'TC-A1 · Lứa 1/2026' }])
    expect(mockFakes.prismaCycles).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parcel: { household: { htx_profile_id: 'htx-tc' } }, harvested_at: null }, take: 8 })
    )
  })

  it('refuses a date that is not a real day', () => {
    expect(a().payloadSchema.safeParse({ cycle_id: 'c1', date: '30/02/2026' }).success).toBe(false)
    expect(a().payloadSchema.safeParse({ cycle_id: 'c1', date: '25/12/2026' }).success).toBe(true)
  })

  it('sets the date through the use case as an ISO day', async () => {
    expect(await a().execute({ cycle_id: 'c1', date: '25/12/2026' }, manager, deps, NOW)).toBe('Đã đặt ngày thu hoạch dự kiến 25/12/2026.')
    expect(mockFakes.updateDate).toHaveBeenCalledWith('c1', '2026-12-25T00:00:00.000Z')
  })

  it("answers not found for another cooperative's cycle (Review Focus 1)", async () => {
    mockFakes.guard.mockRejectedValue(new NotFoundError())
    await expect(a().execute({ cycle_id: 'zzz', date: '25/12/2026' }, manager, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.updateDate).not.toHaveBeenCalled()
  })
})

describe('lot.create', () => {
  const a = () => action('lot.create')

  it('is for officers and offers parcels in a state a lot accepts', async () => {
    expect([...a().roles]).toEqual(['officer'])
    expect((await choicesOf(a(), 'parcel_id')).map((c) => c.value)).toEqual(['p1', 'p2'])
  })

  it('creates one lot with the crop of the parcel, today and the weight', async () => {
    mockFakes.createLot.mockResolvedValue({ lot_code: 'TC-CHE-20261127-001' })
    expect(await a().execute({ parcel_id: 'p1', weight_kg: 120 }, officer, deps, NOW)).toBe('Đã tạo lô TC-CHE-20261127-001.')
    expect(mockFakes.createLot).toHaveBeenCalledWith({
      commodity: 'Chè',
      harvest_date: new Date('2026-11-27'),
      estimated_weight_kg: 120,
      parcel_ids: ['p1'],
      htx_profile_id: 'htx-tc',
      created_by_id: 'officer-1',
    })
  })

  it("answers not found for another cooperative's parcel (Review Focus 1)", async () => {
    mockFakes.guard.mockRejectedValue(new NotFoundError())
    await expect(a().execute({ parcel_id: 'zzz', weight_kg: 5 }, officer, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.createLot).not.toHaveBeenCalled()
  })
})

describe('lot.export_qr', () => {
  const a = () => action('lot.export_qr')
  const lot = { id: 'l1', lot_code: 'TC-CHE-1', commodity: 'Chè', status: 'READY' }

  it('offers the READY lots of the cooperative', async () => {
    mockFakes.lotsAll.mockResolvedValue([lot])
    expect(await choicesOf(a(), 'lot_id', manager)).toEqual([{ value: 'l1', label: 'TC-CHE-1' }])
    expect(mockFakes.lotsAll).toHaveBeenCalledWith({ htx_profile_id: 'htx-tc', status: 'READY' })
  })

  it('exports through ExportQrUseCase', async () => {
    mockFakes.lotById.mockResolvedValue(lot)
    expect(await a().execute({ lot_id: 'l1' }, officer, deps, NOW)).toBe('Đã xuất mã QR cho lô TC-CHE-1.')
    expect(mockFakes.exportQr).toHaveBeenCalledWith('l1', undefined, process.env.NEXT_PUBLIC_BASE_URL)
  })

  it("answers not found for another cooperative's lot (Review Focus 1)", async () => {
    mockFakes.guard.mockRejectedValue(new NotFoundError())
    await expect(a().execute({ lot_id: 'zzz' }, officer, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.exportQr).not.toHaveBeenCalled()
  })
})

describe('parcel.delete', () => {
  const a = () => action('parcel.delete')

  it('is for officers and managers and shows the parcel on both cards', async () => {
    expect([...a().roles]).toEqual(['officer', 'manager'])
    expect(await a().preview({ parcel_id: 'p1' }, officer)).toEqual(['Thửa: TC-p1'])
  })

  it('deletes through DeleteParcelUseCase', async () => {
    expect(await a().execute({ parcel_id: 'p1' }, officer, deps, NOW)).toBe('Đã xoá thửa TC-p1.')
    expect(mockFakes.deleteParcel).toHaveBeenCalledWith('p1')
  })

  it("answers not found for another cooperative's parcel (Review Focus 1)", async () => {
    mockFakes.guard.mockRejectedValue(new NotFoundError())
    await expect(a().execute({ parcel_id: 'zzz' }, manager, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.deleteParcel).not.toHaveBeenCalled()
  })
})

describe('household.add', () => {
  const a = () => action('household.add')

  it('is for officers and creates the household with the phone as its code', async () => {
    expect([...a().roles]).toEqual(['officer'])
    expect(await a().execute({ owner_name: 'Trần Thị B', phone: '0901234567' }, officer, deps, NOW)).toBe('Đã thêm nông hộ Trần Thị B.')
    expect(mockFakes.hhCreate).toHaveBeenCalledWith({
      household_code: '0901234567',
      owner_name: 'Trần Thị B',
      phone: '0901234567',
      htx_profile_id: 'htx-tc',
    })
  })

  it('refuses a phone that is already taken', async () => {
    mockFakes.hhCreate.mockRejectedValue({ code: 'P2002' })
    await expect(a().execute({ owner_name: 'x', phone: '0901234567' }, officer, deps, NOW)).rejects.toThrow('Số điện thoại này đã được đăng ký!')
  })
})

describe('household.edit', () => {
  const a = () => action('household.edit')

  it("offers a farmer only their own household and the cooperative's households to others", async () => {
    mockFakes.prismaHouseholds.mockResolvedValue([{ id: 'hh1', name: 'Nguyễn A' }])
    await choicesOf(a(), 'household_id', farmer)
    expect(mockFakes.prismaHouseholds).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'hh1' } }))
    await choicesOf(a(), 'household_id', manager)
    expect(mockFakes.prismaHouseholds).toHaveBeenLastCalledWith(expect.objectContaining({ where: { htx_profile_id: 'htx-tc' }, take: 8 }))
  })

  it('offers a farmer without a household nothing', async () => {
    expect(await choicesOf(a(), 'household_id', { ...farmer, householdId: null })).toEqual([])
  })

  it('updates the field through the use case with the role and household', async () => {
    expect(await a().execute({ household_id: 'hh1', field: 'address', value: 'Thôn 3' }, farmer, deps, NOW)).toBe('Đã cập nhật thông tin nông hộ.')
    expect(mockFakes.hhUpdate).toHaveBeenCalledWith('hh1', { address: 'Thôn 3' }, 'FARMER', 'hh1')
  })

  it('does not let a farmer change another household (Review Focus 1)', async () => {
    await expect(a().execute({ household_id: 'hh2', field: 'address', value: 'x' }, farmer, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.hhUpdate).not.toHaveBeenCalled()
  })

  it("answers not found for another cooperative's household (Review Focus 1)", async () => {
    mockFakes.guard.mockRejectedValue(new NotFoundError())
    await expect(a().execute({ household_id: 'zzz', field: 'address', value: 'x' }, manager, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
  })

  it('refuses a phone held by another household', async () => {
    mockFakes.hhUpdate.mockRejectedValue({ code: 'P2002' })
    await expect(a().execute({ household_id: 'hh1', field: 'phone', value: '0901234567' }, officer, deps, NOW)).rejects.toThrow('Số điện thoại này đã được đăng ký!')
  })
})
