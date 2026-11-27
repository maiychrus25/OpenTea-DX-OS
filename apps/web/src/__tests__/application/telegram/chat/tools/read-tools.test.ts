/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import type { ChatTool, ChatUser } from '@/application/telegram/chat/types'
import { NotFoundError } from '@/domain/errors'
const mockFakes = { parcels: jest.fn(), parcelById: jest.fn(), journalScoped: jest.fn(), journal: jest.fn(), schedule: jest.fn(), forecast: jest.fn(), proposals: jest.fn(), subjects: jest.fn(), lots: jest.fn(), bulletin: jest.fn(), htxProfile: jest.fn(), notifications: jest.fn(), weatherForParcel: jest.fn(), marketFindFirst: jest.fn(), fxFindMany: jest.fn() }
const fakes = mockFakes

// The Telegram update route has no browser session: a chat read that loads the auth modules must fail here.
jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/lib/auth/core-token', () => {
  throw new Error('chat code loaded the browser session token')
})
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({
  PrismaParcelRepository: jest.fn(() => ({
    findAll: (...args: unknown[]) => mockFakes.parcels(...args),
    findById: (...args: unknown[]) => mockFakes.parcelById(...args),
  })),
}))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({
  PrismaJournalRepository: jest.fn(() => ({
    findAll: (...args: unknown[]) => mockFakes.journal(...args),
    findManyScoped: (...args: unknown[]) => mockFakes.journalScoped(...args),
  })),
}))
jest.mock('@/infrastructure/db/lot/PrismaLotRepository', () => ({
  PrismaLotRepository: jest.fn(() => ({ findAll: (...args: unknown[]) => mockFakes.lots(...args) })),
}))
jest.mock('@/application/farm/get-harvest-schedule-use-case', () => ({
  GetHarvestScheduleUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.schedule(...args) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaCropCycleRepository', () => ({ PrismaCropCycleRepository: jest.fn() }))
jest.mock('@/application/weather/get-weather-forecast-usecase', () => ({
  GetWeatherForecastUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.forecast(...args) })),
}))
jest.mock('@/infrastructure/db/weather/prisma-weather-repository', () => ({ PrismaWeatherRepository: jest.fn() }))
jest.mock('@/application/farm/GetWeatherUseCase', () => ({
  GetWeatherUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.weatherForParcel(...args) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaWeatherCacheRepository', () => ({ PrismaWeatherCacheRepository: jest.fn() }))
jest.mock('@/application/agent/ListProposalsUseCase', () => ({
  ListProposalsUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.proposals(...args) })),
}))
jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({ PrismaProposalRepository: jest.fn() }))
jest.mock('@/application/agent/journal-subjects', () => ({ loadJournalSubjects: (...args: unknown[]) => mockFakes.subjects(...args) }))
jest.mock('@/application/lot/ListLotsUseCase', () => ({
  ListLotsUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.lots(...args) })),
}))
jest.mock('@/application/bulletin/GetLatestBulletinUseCase', () => ({
  GetLatestBulletinUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.bulletin(...args) })),
}))
jest.mock('@/infrastructure/db/repositories/PrismaBulletinRepository', () => ({ PrismaBulletinRepository: jest.fn() }))
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(() => ({ getProfile: (...args: unknown[]) => mockFakes.htxProfile(...args) })),
}))
jest.mock('@/application/notification/get-notifications-usecase', () => ({
  GetNotificationsUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => mockFakes.notifications(...args) })),
}))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({
  PrismaNotificationRepository: jest.fn(),
}))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    marketData: { findFirst: (...args: unknown[]) => mockFakes.marketFindFirst(...args) },
    fxRate: { findMany: (...args: unknown[]) => mockFakes.fxFindMany(...args) },
  },
}))

const NOW = new Date('2026-11-26T03:00:00.000Z') // 10:00 in Vietnam

function user(role: ChatUser['tenant']['role'], overrides: Partial<ChatUser> = {}): ChatUser {
  return {
    tenant: { userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' },
    userName: 'Nguyen Van A',
    householdId: role === 'farmer' ? 'hh_tc_1' : null,
    telegramUserId: '1001',
    chatId: 1001,
    ...overrides,
  }
}

function tool(name: string): ChatTool {
  const found = CHAT_TOOLS.find((t) => t.name === name)
  if (!found) throw new Error(`no tool ${name}`)
  return found
}

function parcelRow(code: string, householdId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `id-${code}`,
    parcel_code: code,
    household_id: householdId,
    area_ha: 1.2,
    centroid_lat: 10,
    centroid_lng: 106,
    status: 'ACTIVE',
    crop_type: 'Chè',
    ...extra,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const fake of Object.values(fakes)) fake.mockReset()
  fakes.journal.mockResolvedValue({ entries: [], total: 0 })
  fakes.parcels.mockResolvedValue([])
  fakes.schedule.mockResolvedValue([])
  fakes.forecast.mockResolvedValue([])
  fakes.proposals.mockResolvedValue([])
  fakes.subjects.mockResolvedValue(new Map())
  fakes.lots.mockResolvedValue([])
  fakes.notifications.mockResolvedValue({ notifications: [], unreadCount: 0 })
  fakes.marketFindFirst.mockResolvedValue(null)
  fakes.fxFindMany.mockResolvedValue([])
  fakes.htxProfile.mockResolvedValue(null)
})

describe('CHAT_TOOLS (contract C5)', () => {
  it('lists the eleven tools in contract order with the roles of their routes', () => {
    expect(CHAT_TOOLS.map((t) => [t.name, [...t.roles]])).toEqual([
      ['today', ['farmer', 'officer', 'manager']],
      ['pending', ['officer', 'manager']],
      ['weather', ['farmer', 'officer', 'manager']],
      ['market', ['farmer', 'officer', 'manager']],
      ['bulletin', ['officer', 'manager']],
      ['notifications', ['farmer', 'officer', 'manager']],
      ['journal', ['farmer', 'officer', 'manager']],
      ['harvest_schedule', ['farmer', 'officer', 'manager']],
      ['parcels', ['farmer', 'officer', 'manager']],
      ['lots', ['officer', 'manager']],
      ['nearby', ['farmer', 'officer', 'manager']],
    ])
  })
})

describe('weather', () => {
  it('answers one line per zone with temperature and condition', async () => {
    fakes.forecast.mockResolvedValue([
      { parcel_code: 'TC-A1', parcel_name: 'Thửa TC-A1', crop_type: 'Chè', lat: 10, lng: 106, current: { temperature: 27.4, windspeed: 3, condition: 'Nắng', icon: 'sun' }, forecast_7d: [] },
    ])
    const reply = await tool('weather').run(user('farmer'), {}, NOW)
    expect(fakes.forecast).toHaveBeenCalledWith('htx-tc')
    expect(reply).toEqual({ lines: ['Thửa TC-A1 (Chè): 27°C, Nắng'], source: 'Thời tiết' })
  })

  it('answers the empty line when there is no zone', async () => {
    const reply = await tool('weather').run(user('officer'), {}, NOW)
    expect(reply.lines).toEqual(['Chưa có dữ liệu.'])
  })

  it('never answers more than seven lines', async () => {
    fakes.forecast.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ parcel_code: `Z${i}`, parcel_name: `Z${i}`, crop_type: 'Chè', lat: 0, lng: 0, current: { temperature: 20, windspeed: 0, condition: 'Mây', icon: '' }, forecast_7d: [] }))
    )
    const reply = await tool('weather').run(user('officer'), {}, NOW)
    expect(reply.lines).toHaveLength(7)
  })
})

describe('market', () => {
  it('reads the commodity priority metric and the exchange rate', async () => {
    fakes.marketFindFirst.mockResolvedValueOnce({ commodity: 'Tea', metric: 'export_value_to_world', value: 1234.5, unit: 'USD', period: '2025' })
    fakes.fxFindMany.mockResolvedValue([{ rates: { VND: 25400 } }])
    const reply = await tool('market').run(user('farmer'), {}, NOW)
    expect(fakes.marketFindFirst).toHaveBeenCalledWith({ where: { commodity: 'Tea', metric: 'export_value_to_world' }, orderBy: { fetched_at: 'desc' } })
    expect(reply).toEqual({ lines: ['Chè: 1234.5 USD (2025)', 'Tỷ giá USD/VND: 25400'], source: 'Giá thị trường' })
  })

  it('answers the empty line when there is no data', async () => {
    const reply = await tool('market').run(user('farmer'), {}, NOW)
    expect(reply.lines).toEqual(['Chưa có dữ liệu.'])
  })
})

describe('bulletin', () => {
  it('reads the latest tea bulletin of the cooperative', async () => {
    fakes.htxProfile.mockResolvedValue({ crop_types: ['Chè'] })
    fakes.bulletin.mockResolvedValue({ bulletin_vi: 'Giá chè ổn định.\nTồn kho thấp.' })
    const reply = await tool('bulletin').run(user('officer'), {}, NOW)
    expect(fakes.bulletin).toHaveBeenCalledWith('Tea', 'TC')
    expect(reply).toEqual({ lines: ['Giá chè ổn định.', 'Tồn kho thấp.'], source: 'Bản tin', listen: true })
  })

  it('answers the empty line when the cooperative has no bulletin', async () => {
    fakes.htxProfile.mockResolvedValue({ crop_types: ['Chè'] })
    fakes.bulletin.mockRejectedValue(new NotFoundError('none'))
    const reply = await tool('bulletin').run(user('manager'), {}, NOW)
    expect(reply.lines).toEqual(['Chưa có dữ liệu.'])
    expect(reply.listen).toBeUndefined()
  })
})

describe('notifications', () => {
  it('shows the unread count and the latest five titles', async () => {
    fakes.notifications.mockResolvedValue({
      notifications: [{ id: 'n1', title: 'Đề xuất mới', detail: 'Hai nhật ký', tone: 'blue', created_at: '', read: false }],
      unreadCount: 2,
    })
    const reply = await tool('notifications').run(user('farmer'), {}, NOW)
    expect(fakes.notifications).toHaveBeenCalledWith('farmer-1', 'htx-tc', 5)
    expect(reply).toEqual({ lines: ['Chưa đọc: 2', '• Đề xuất mới: Hai nhật ký'], source: 'Thông báo' })
  })
})

describe('journal', () => {
  it('lists the latest entries of the cooperative for an officer', async () => {
    fakes.journal.mockResolvedValue({
      entries: [{ id: 'e1', parcel_id: 'p1', parcel_code: 'TC-A1', household_id: 'hh_tc_1', entry_date: new Date('2026-11-25T00:00:00Z'), activity_type: 'SPRAYING', status: 'PENDING_APPROVAL' }],
      total: 1,
    })
    const reply = await tool('journal').run(user('officer'), {}, NOW)
    expect(fakes.journal).toHaveBeenCalledWith({ htx_profile_id: 'htx-tc', limit: 5 })
    expect(reply.lines).toEqual(['25/11 · TC-A1 · Phun thuốc · Chờ duyệt'])
  })

  it('scopes a farmer to the household and drops rows of other households and LB', async () => {
    fakes.journal.mockResolvedValue({
      entries: [
        { id: 'e1', parcel_id: 'p1', parcel_code: 'TC-A1', household_id: 'hh_tc_1', entry_date: new Date('2026-11-25T00:00:00Z'), activity_type: 'HARVEST', status: 'APPROVED' },
        { id: 'e2', parcel_id: 'p2', parcel_code: 'TC-B9', household_id: 'hh_tc_2', entry_date: new Date('2026-11-25T00:00:00Z'), activity_type: 'HARVEST', status: 'APPROVED' },
        { id: 'e3', parcel_id: 'p3', parcel_code: 'LB-C3', household_id: 'hh_lb_1', entry_date: new Date('2026-11-25T00:00:00Z'), activity_type: 'HARVEST', status: 'APPROVED' },
      ],
      total: 3,
    })
    const reply = await tool('journal').run(user('farmer'), {}, NOW)
    expect(fakes.journal).toHaveBeenCalledWith({ htx_profile_id: 'htx-tc', household_id: 'hh_tc_1', limit: 5 })
    expect(reply.lines.join('\n')).toContain('TC-A1')
    expect(reply.lines.join('\n')).not.toContain('TC-B9')
    expect(reply.lines.join('\n')).not.toContain('LB-C3')
  })

  it('answers the empty line, without a query, for a farmer with no household', async () => {
    const reply = await tool('journal').run(user('farmer', { householdId: null }), {}, NOW)
    expect(fakes.journal).not.toHaveBeenCalled()
    expect(reply.lines).toEqual(['Chưa có dữ liệu.'])
  })
})

describe('parcels', () => {
  it('scopes a farmer to the household: two households and an LB row', async () => {
    fakes.parcels.mockResolvedValue([parcelRow('TC-A1', 'hh_tc_1'), parcelRow('TC-B9', 'hh_tc_2'), parcelRow('LB-C3', 'hh_lb_1')])
    const reply = await tool('parcels').run(user('farmer'), {}, NOW)
    expect(fakes.parcels).toHaveBeenCalledWith({ htx_profile_id: 'htx-tc', household_id: 'hh_tc_1' })
    expect(reply.lines).toEqual(['TC-A1 · Chè · 1.2 ha'])
    expect(reply.source).toBe('Vùng trồng')
  })

  it('caps the officer answer at seven lines', async () => {
    fakes.parcels.mockResolvedValue(Array.from({ length: 10 }, (_, i) => parcelRow(`TC-${i}`, 'hh_tc_1')))
    const reply = await tool('parcels').run(user('officer'), {}, NOW)
    expect(reply.lines).toHaveLength(7)
  })
})

describe('harvest_schedule', () => {
  it('shows only the events of the farmer parcels, earliest first', async () => {
    fakes.parcels.mockResolvedValue([parcelRow('TC-A1', 'hh_tc_1')])
    fakes.schedule.mockResolvedValue([
      { cycleId: 'c2', parcelId: 'id-TC-A1', parcelName: 'TC-A1', householdName: 'Hộ 1', cropType: 'Chè', estimatedYieldKg: null, estimatedHarvestDate: '2026-12-10T00:00:00.000Z', safeHarvestDate: null, status: 'SAFE' },
      { cycleId: 'c1', parcelId: 'id-TC-A1', parcelName: 'TC-A1', householdName: 'Hộ 1', cropType: 'Chè', estimatedYieldKg: null, estimatedHarvestDate: '2026-12-02T00:00:00.000Z', safeHarvestDate: null, status: 'SAFE' },
      { cycleId: 'c3', parcelId: 'id-TC-B9', parcelName: 'TC-B9', householdName: 'Hộ 2', cropType: 'Chè', estimatedYieldKg: null, estimatedHarvestDate: '2026-12-03T00:00:00.000Z', safeHarvestDate: null, status: 'SAFE' },
    ])
    const reply = await tool('harvest_schedule').run(user('farmer'), {}, NOW)
    expect(fakes.schedule).toHaveBeenCalledWith('htx-tc', NOW.toISOString(), expect.any(String))
    expect(reply.lines).toEqual(['02/12 · TC-A1 · Chè', '10/12 · TC-A1 · Chè'])
  })
})

describe('lots', () => {
  it('lists lots for an officer', async () => {
    fakes.lots.mockResolvedValue([{ lot_code: 'LOT-001', commodity: 'Chè', status: 'READY', harvest_date: new Date('2026-11-20T00:00:00Z') }])
    const reply = await tool('lots').run(user('officer'), {}, NOW)
    expect(fakes.lots).toHaveBeenCalledWith({ htx_profile_id: 'htx-tc' })
    expect(reply).toEqual({ lines: ['LOT-001 · Chè · READY · 20/11/2026'], source: 'Lô hàng' })
  })
})

describe('pending', () => {
  it('returns at most five approvable proposal ids for the role', async () => {
    const approvable = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, kind: 'journal.approve', payload: { entry_ids: [`e${i}`] }, evidence: null }))
    fakes.proposals.mockResolvedValue([
      { id: 'bulletin', kind: 'bulletin.publish', payload: {}, evidence: null },
      { id: 'unknown', kind: 'not.a.kind', payload: {}, evidence: null },
      ...approvable,
    ])
    const reply = await tool('pending').run(user('officer'), {}, NOW)
    expect(reply.proposalIds).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(reply.source).toBe('Đề xuất AI')
    expect(reply.lines).toHaveLength(5)
  })

  it('leaves out kinds the role may not approve', async () => {
    fakes.proposals.mockResolvedValue([{ id: 'bulletin', kind: 'bulletin.publish', payload: {}, evidence: null }])
    const reply = await tool('pending').run(user('officer'), {}, NOW)
    expect(reply.proposalIds).toEqual([])
    expect(reply.lines).toEqual(['Chưa có dữ liệu.'])
  })
})

describe('today', () => {
  it('shows a farmer their pending and changed entries and the next harvest', async () => {
    fakes.forecast.mockResolvedValue([{ parcel_code: 'Z', parcel_name: 'Z', crop_type: 'Chè', lat: 0, lng: 0, current: { temperature: 26, windspeed: 0, condition: 'Mưa nhẹ', icon: '' }, forecast_7d: [] }])
    fakes.journal.mockResolvedValueOnce({ entries: [], total: 2 }).mockResolvedValueOnce({ entries: [], total: 1 })
    fakes.parcels.mockResolvedValue([parcelRow('TC-A1', 'hh_tc_1')])
    fakes.schedule.mockResolvedValue([
      { cycleId: 'c1', parcelId: 'id-TC-A1', parcelName: 'TC-A1', householdName: 'Hộ 1', cropType: 'Chè', estimatedYieldKg: null, estimatedHarvestDate: '2026-12-02T00:00:00.000Z', safeHarvestDate: null, status: 'SAFE' },
    ])
    const reply = await tool('today').run(user('farmer'), {}, NOW)
    expect(fakes.journal).toHaveBeenNthCalledWith(1, { htx_profile_id: 'htx-tc', household_id: 'hh_tc_1', status: 'PENDING_APPROVAL', limit: 1 })
    expect(fakes.journal).toHaveBeenNthCalledWith(2, { htx_profile_id: 'htx-tc', household_id: 'hh_tc_1', status: 'REQUEST_CHANGES', limit: 1 })
    expect(reply.lines).toEqual(['Thời tiết: 26°C, Mưa nhẹ', 'Nhật ký chờ duyệt: 2', 'Nhật ký cần sửa: 1', 'Thu hoạch gần nhất: 02/12/2026'])
    expect(reply.source).toBe('Tổng quan')
  })

  it('shows an officer the pending journal count and the open proposal count', async () => {
    fakes.journal.mockResolvedValue({ entries: [], total: 4 })
    fakes.proposals.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    const reply = await tool('today').run(user('officer'), {}, NOW)
    expect(fakes.journal).toHaveBeenCalledWith({ htx_profile_id: 'htx-tc', status: 'PENDING_APPROVAL', limit: 1 })
    expect(reply.lines).toEqual(['Nhật ký chờ duyệt: 4', 'Đề xuất đang mở: 2'])
  })
})

describe('nearby', () => {
  const near = parcelRow('TC-A1', 'hh_tc_1', { centroid_lat: 10, centroid_lng: 106 })
  const far = parcelRow('TC-B9', 'hh_tc_1', { centroid_lat: 10.09, centroid_lng: 106 })
  const noCentroid = parcelRow('TC-C2', 'hh_tc_1', { centroid_lat: null, centroid_lng: null })

  it('picks the nearest parcel with a centroid and formats the distance with one decimal', async () => {
    fakes.parcels.mockResolvedValue([noCentroid, far, near])
    fakes.weatherForParcel.mockResolvedValue({ condition: 'Nắng', temperature_c: 28, precipitation_mm: 0, humidity_pct: 60 })
    const reply = await tool('nearby').run(user('farmer'), { latitude: 10, longitude: 106 }, NOW)
    expect(fakes.weatherForParcel).toHaveBeenCalledWith('id-TC-A1', '2026-11-26', { id: 'farmer-1', role: 'farmer', householdId: 'hh_tc_1' })
    expect(reply.lines[0]).toBe('TC-A1, cách 0.0 km')
    expect(reply.lines[1]).toBe('Thời tiết: Nắng, 28°C, mưa 0 mm')
  })

  it('reports the distance of a farther parcel with one decimal', async () => {
    fakes.parcels.mockResolvedValue([far])
    fakes.weatherForParcel.mockResolvedValue(null)
    const reply = await tool('nearby').run(user('farmer'), { latitude: 10, longitude: 106 }, NOW)
    expect(reply.lines[0]).toBe('TC-B9, cách 10.0 km')
  })

  it('answers the no-parcel line when no visible parcel has a centroid', async () => {
    fakes.parcels.mockResolvedValue([noCentroid])
    const reply = await tool('nearby').run(user('farmer'), { latitude: 10, longitude: 106 }, NOW)
    expect(reply.lines).toEqual(['Không tìm thấy thửa nào có toạ độ.'])
    expect(fakes.weatherForParcel).not.toHaveBeenCalled()
  })
})
