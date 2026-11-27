/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import type { ChatTool, ChatUser } from '@/application/telegram/chat/types'
import { TELEGRAM_COVERAGE } from '@/application/telegram/coverage'
import { soilLabel } from '@/application/telegram/chat/tools/soil'

const mockDb = {
  parcelFindFirst: jest.fn(),
  lotFindFirst: jest.fn(),
  householdFindMany: jest.fn(),
  householdFindFirst: jest.fn(),
  diseaseFindMany: jest.fn(),
  partnerFindMany: jest.fn(),
  search: jest.fn(),
  members: jest.fn(),
  documents: jest.fn(),
  latestPhoto: jest.fn(),
  htxProfile: jest.fn(),
  visibleParcels: jest.fn(),
}

// The Telegram update route has no browser session: a chat read that loads the auth modules must fail here.
jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/lib/auth/core-token', () => {
  throw new Error('chat code loaded the browser session token')
})
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    parcel: { findFirst: (...a: unknown[]) => mockDb.parcelFindFirst(...a) },
    lot: { findFirst: (...a: unknown[]) => mockDb.lotFindFirst(...a) },
    household: { findMany: (...a: unknown[]) => mockDb.householdFindMany(...a), findFirst: (...a: unknown[]) => mockDb.householdFindFirst(...a) },
    diseaseReport: { findMany: (...a: unknown[]) => mockDb.diseaseFindMany(...a) },
    partner: { findMany: (...a: unknown[]) => mockDb.partnerFindMany(...a) },
  },
}))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({
  PrismaParcelRepository: jest.fn(() => ({ findAll: (...a: unknown[]) => mockDb.visibleParcels(...a) })),
}))
jest.mock('@/application/search/GlobalSearchUseCase', () => ({
  GlobalSearchUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockDb.search(...a) })),
}))
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => ({
  KeycloakAdminAdapter: jest.fn(() => ({ listUsersByRole: (...a: unknown[]) => mockDb.members(...a) })),
}))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({
  MinioDocumentAdapter: jest.fn(() => ({ listDocuments: (...a: unknown[]) => mockDb.documents(...a) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseReportRepository', () => ({
  PrismaDiseaseReportRepository: jest.fn(() => ({ findLatestByParcelId: (...a: unknown[]) => mockDb.latestPhoto(...a) })),
}))
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(() => ({ getProfile: (...a: unknown[]) => mockDb.htxProfile(...a) })),
}))

const NOW = new Date('2026-11-26T03:00:00.000Z')

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

const ALL = ['farmer', 'officer', 'manager']
const STAFF = ['officer', 'manager']
const many = (count: number, make: (i: number) => unknown) => Array.from({ length: count }, (_, i) => make(i))

beforeEach(() => {
  for (const fake of Object.values(mockDb)) fake.mockReset()
  mockDb.parcelFindFirst.mockResolvedValue(null)
  mockDb.lotFindFirst.mockResolvedValue(null)
  mockDb.householdFindMany.mockResolvedValue([])
  mockDb.householdFindFirst.mockResolvedValue(null)
  mockDb.diseaseFindMany.mockResolvedValue([])
  mockDb.partnerFindMany.mockResolvedValue([])
  mockDb.search.mockResolvedValue([])
  mockDb.members.mockResolvedValue([])
  mockDb.documents.mockResolvedValue([])
  mockDb.latestPhoto.mockResolvedValue(null)
  mockDb.htxProfile.mockResolvedValue(null)
  mockDb.visibleParcels.mockResolvedValue([])
  delete process.env.DXOS_WEB_PUBLIC_URL
})

describe('the ten issue #80 read tools (plan C1)', () => {
  it('have the roles and routes of the contract', () => {
    const rows = ['search', 'certificate', 'soil', 'photo', 'households', 'members', 'diseases', 'profile', 'documents', 'partners']
    expect(CHAT_TOOLS.slice(11).map((t) => [t.name, [...t.roles]])).toEqual([
      ['search', ALL],
      ['certificate', ALL],
      ['soil', ALL],
      ['photo', ALL],
      ['households', STAFF],
      ['members', ['manager']],
      ['diseases', ['officer']],
      ['profile', ALL],
      ['documents', STAFF],
      ['partners', ALL],
    ])
    expect(CHAT_TOOLS.slice(11).map((t) => t.name)).toEqual(rows)
  })

  it('serve each of their coverage rows, and every row they name is a chat-read row', () => {
    const served = Array.from(new Set(CHAT_TOOLS.slice(11).flatMap((t) => t.routes)))
    for (const route of served) expect(TELEGRAM_COVERAGE.chatRead).toContain(route)
    expect([...served].sort()).toEqual(
      [
        'GET /api/search',
        'GET /api/lot/[lot_code]/certificate',
        'GET /api/farm/parcels/[id]/soil-health',
        'GET /api/parcels/[id]/latest-photo',
        'GET /api/farm/households',
        'GET /api/farm/households/[id]',
        'GET /api/members',
        'GET /api/officer/diseases',
        'GET /api/profile',
        'GET /api/documents',
        'GET /api/documents/url',
        'GET /api/partners',
      ].sort()
    )
  })
})

describe('search', () => {
  it('asks for a keyword when it is shorter than two characters', async () => {
    const out = await tool('search').run(user('manager'), { query: 'a' }, NOW)
    expect(out.lines[0]).toContain('tìm <từ khóa>')
    expect(mockDb.search).not.toHaveBeenCalled()
  })

  it('searches the cooperative of the user only', async () => {
    mockDb.search.mockResolvedValue([{ type: 'LOT', id: 'l1', title: 'TC-1', subtitle: 'Status: DRAFT' }])
    const out = await tool('search').run(user('officer'), { query: 'TC' }, NOW)
    expect(mockDb.search).toHaveBeenCalledWith('TC', 'htx-tc')
    expect(out.lines).toEqual(['Lô TC-1 · Status: DRAFT'])
  })

  it("cuts a farmer's hits to their household and parcels (another household's hit is dropped)", async () => {
    mockDb.visibleParcels.mockResolvedValue([{ id: 'p1', household_id: 'hh_tc_1' }])
    mockDb.search.mockResolvedValue([
      { type: 'HOUSEHOLD', id: 'hh_tc_1', title: 'Own' },
      { type: 'HOUSEHOLD', id: 'hh_tc_2', title: 'Other', subtitle: '0900000000' },
      { type: 'PARCEL', id: 'p1', title: 'P-1' },
      { type: 'PARCEL', id: 'p9', title: 'P-9' },
    ])
    const out = await tool('search').run(user('farmer'), { query: 'abc' }, NOW)
    expect(out.lines).toEqual(['Nông hộ Own', 'Thửa P-1'])
  })

  it('answers a line for no hits and caps a long answer at seven lines', async () => {
    expect((await tool('search').run(user('manager'), { query: 'zz' }, NOW)).lines).toEqual(['Không có kết quả cho "zz".'])
    mockDb.search.mockResolvedValue(many(15, (i) => ({ type: 'LOT', id: `l${i}`, title: `L${i}` })))
    expect((await tool('search').run(user('manager'), { query: 'L' + 'L' }, NOW)).lines).toHaveLength(7)
  })
})

describe('certificate', () => {
  const lot = { lot_code: 'TC-CHE-1', commodity: 'Chè', harvest_date: new Date('2026-11-10T00:00:00Z'), status: 'QR_EXPORTED', certificate_keys: ['k'] }

  it('looks the lot up inside the user cooperative, so another cooperative lot is not found', async () => {
    const out = await tool('certificate').run(user('farmer'), { lot_code: 'OTHER-1' }, NOW)
    expect(mockDb.lotFindFirst.mock.calls[0][0].where).toMatchObject({ htx_profile_id: 'htx-tc' })
    expect(out.lines).toEqual(['Không tìm thấy lô hàng.'])
  })

  it('answers the lot facts and the public trace link only for an exported lot with an HTTPS base', async () => {
    mockDb.lotFindFirst.mockResolvedValue(lot)
    expect((await tool('certificate').run(user('officer'), { lot_code: 'TC-CHE-1' }, NOW)).lines.join('\n')).not.toContain('/q/')
    process.env.DXOS_WEB_PUBLIC_URL = 'https://dx.example/'
    const out = await tool('certificate').run(user('officer'), { lot_code: 'TC-CHE-1' }, NOW)
    expect(out.lines).toEqual([
      'Lô TC-CHE-1',
      'Sản phẩm: Chè',
      'Ngày thu hoạch: 10/11/2026',
      'Trạng thái: QR_EXPORTED, 1 chứng nhận',
      'Truy xuất: https://dx.example/q/TC-CHE-1',
    ])
    mockDb.lotFindFirst.mockResolvedValue({ ...lot, status: 'DRAFT' })
    expect((await tool('certificate').run(user('officer'), { lot_code: 'TC-CHE-1' }, NOW)).lines.join('\n')).not.toContain('/q/')
  })

  it('asks for a lot code when none is given', async () => {
    expect((await tool('certificate').run(user('officer'), {}, NOW)).lines[0]).toContain('chứng nhận <mã lô>')
  })
})

describe('soil', () => {
  const parcel = { id: 'p1', parcel_code: 'P-TC-1', crop_type: 'Chè', area_ha: 1, centroid_lat: 10, centroid_lng: 106 }
  // 08:00 to 15:00 in Vietnam; NOW is 10:00, so the last five hours are forecasts.
  const times = many(8, (i) => `2026-11-26T${String(8 + i).padStart(2, '0')}:00`) as string[]

  afterEach(() => jest.restoreAllMocks())

  it('scopes the parcel to the cooperative and, for a farmer, to their household', async () => {
    await tool('soil').run(user('farmer'), { parcel_code: 'P-OTHER' }, NOW)
    expect(mockDb.parcelFindFirst.mock.calls[0][0].where).toMatchObject({
      household: { htx_profile_id: 'htx-tc' },
      household_id: 'hh_tc_1',
    })
    mockDb.parcelFindFirst.mockClear()
    const out = await tool('soil').run(user('manager'), { parcel_code: 'P-OTHER' }, NOW)
    expect(mockDb.parcelFindFirst.mock.calls[0][0].where).not.toHaveProperty('household_id')
    expect(out.lines).toEqual(['Không tìm thấy thửa.'])
  })

  it('reads nothing for a farmer with no household', async () => {
    const out = await tool('soil').run(user('farmer', { householdId: null }), { parcel_code: 'P-1' }, NOW)
    expect(mockDb.parcelFindFirst).not.toHaveBeenCalled()
    expect(out.lines).toEqual(['Không tìm thấy thửa.'])
  })

  it('answers the latest reading and a label from the week, ignoring hours still to come', async () => {
    mockDb.parcelFindFirst.mockResolvedValue(parcel)
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ hourly: { time: times, soil_moisture_0_to_7cm: times.map((_, i) => (i < 3 ? 0.3 : 0.9)), soil_temperature_0cm: times.map((_, i) => (i < 3 ? 25 : 40)) } }),
    } as Response)
    const out = await tool('soil').run(user('officer'), { parcel_code: 'P-TC-1' }, NOW)
    expect(String(fetchMock.mock.calls[0][0])).toContain('latitude=10')
    expect(out.lines).toEqual(['Thửa P-TC-1 · Chè', 'Độ ẩm đất: 0.30 m³/m³', 'Nhiệt độ đất: 25.0°C', 'Đánh giá 7 ngày: Điều kiện ổn định'])
  })

  it('says so when the weather service fails, and when the parcel has no coordinates', async () => {
    mockDb.parcelFindFirst.mockResolvedValue(parcel)
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'))
    expect((await tool('soil').run(user('officer'), { parcel_code: 'P-TC-1' }, NOW)).lines).toEqual(['Chưa lấy được số liệu đất lúc này.'])
    mockDb.parcelFindFirst.mockResolvedValue({ ...parcel, centroid_lat: null })
    expect((await tool('soil').run(user('officer'), { parcel_code: 'P-TC-1' }, NOW)).lines).toEqual(['Thửa P-TC-1 chưa có toạ độ.'])
  })

  it('labels with the route thresholds', () => {
    expect(soilLabel(0.45, 20)).toContain('Độ ẩm đất cao')
    expect(soilLabel(0.2, 31)).toContain('Nhiệt độ đất cao')
    expect(soilLabel(0.2, 20)).toBe('Điều kiện ổn định')
  })
})

describe('photo', () => {
  it("does not find another household's or cooperative's parcel, and reads no photo for it", async () => {
    const out = await tool('photo').run(user('farmer'), { parcel_code: 'P-OTHER' }, NOW)
    expect(mockDb.parcelFindFirst.mock.calls[0][0].where).toMatchObject({ household_id: 'hh_tc_1', household: { htx_profile_id: 'htx-tc' } })
    expect(mockDb.latestPhoto).not.toHaveBeenCalled()
    expect(out.lines).toEqual(['Không tìm thấy thửa.'])
  })

  it('answers the date and source, with the app link only for an HTTPS base, never a signed URL', async () => {
    mockDb.parcelFindFirst.mockResolvedValue({ id: 'p1', parcel_code: 'P-TC-1' })
    mockDb.latestPhoto.mockResolvedValue({ photo_minio_key: 'secret/key.jpg', detection_date: new Date('2026-11-20T03:00:00Z') })
    const plain = await tool('photo').run(user('officer'), { parcel_code: 'P-TC-1' }, NOW)
    expect(plain.lines).toEqual(['Thửa P-TC-1', 'Ảnh mới nhất: 20/11/2026', 'Nguồn ảnh: báo cáo bệnh'])
    process.env.DXOS_WEB_PUBLIC_URL = 'https://dx.example'
    const linked = await tool('photo').run(user('officer'), { parcel_code: 'P-TC-1' }, NOW)
    expect(linked.lines[3]).toBe('Xem ảnh trong ứng dụng: https://dx.example/telegram/open')
    expect(linked.lines.join('\n')).not.toContain('secret')
    mockDb.latestPhoto.mockResolvedValue(null)
    expect((await tool('photo').run(user('officer'), { parcel_code: 'P-TC-1' }, NOW)).lines).toEqual(['Thửa P-TC-1 chưa có ảnh.'])
  })
})

describe('households', () => {
  const row = (i: number) => ({ name: `Hộ ${i}`, phone: `09000000${i}`, address: null, parcels: [{ parcel_code: `P${i}`, area_ha: 1.5 }] })

  it('lists the cooperative households only, newest first, with a cap of ten rows read', async () => {
    mockDb.householdFindMany.mockResolvedValue(many(10, row))
    const out = await tool('households').run(user('manager'), {}, NOW)
    const query = mockDb.householdFindMany.mock.calls[0][0]
    expect(query.where).toEqual({ htx_profile_id: 'htx-tc' })
    expect(query.take).toBe(10)
    expect(out.lines).toHaveLength(7)
  })

  it('finds one household by name inside the cooperative and shows its parcels', async () => {
    mockDb.householdFindMany.mockResolvedValue([row(1)])
    const out = await tool('households').run(user('officer'), { name: 'hộ 1' }, NOW)
    expect(mockDb.householdFindMany.mock.calls[0][0].where).toEqual({ htx_profile_id: 'htx-tc', name: { contains: 'hộ 1', mode: 'insensitive' } })
    expect(out.lines).toEqual(['Hộ 1 · 090000001', '1 thửa, 1.50 ha', 'P1 · 1.5 ha'])
  })

  it('says so when the name matches nothing', async () => {
    expect((await tool('households').run(user('officer'), { name: 'ai đó' }, NOW)).lines).toEqual(['Không tìm thấy nông hộ "ai đó".'])
  })
})

describe('members', () => {
  const member = (i: number, active: boolean) => ({
    id: `m${i}`,
    full_name: `Người ${i}`,
    role: i % 2 ? 'FARMER' : 'OFFICER',
    is_active: active,
    phone: `09${i}`,
    createdTimestamp: i,
  })

  it('reads both roles of the manager cooperative', async () => {
    await tool('members').run(user('manager'), {}, NOW)
    expect(mockDb.members.mock.calls.map((c) => c.join(':')).sort()).toEqual(['farmer:TC', 'officer:TC'])
  })

  it('counts by status and lists the newest pending members within the cap', async () => {
    mockDb.members.mockImplementation(async (role: string) =>
      role === 'farmer' ? many(8, (i) => member(i * 2 + 1, i < 2)) : [member(100, true)]
    )
    const out = await tool('members').run(user('manager'), {}, NOW)
    expect(out.lines[0]).toBe('Đang hoạt động: 3 · Chờ duyệt: 6')
    expect(out.lines).toHaveLength(7)
    expect(out.lines[1]).toContain('Người 15')
    expect(out.lines.join('\n')).not.toContain('m15')
    expect(out.lines[6]).toBe('Mời thành viên mới: mở ứng dụng, mục Thành viên.')
  })
})

describe('diseases', () => {
  it('lists open reports of the cooperative only', async () => {
    mockDb.diseaseFindMany.mockResolvedValue([
      { detection_date: new Date('2026-11-25T03:00:00Z'), ai_disease_name: 'Blister blight', ai_confidence: 0.87, parcel: { parcel_code: 'P-1' }, household: { name: 'Hộ A' } },
    ])
    const out = await tool('diseases').run(user('officer'), {}, NOW)
    expect(mockDb.diseaseFindMany.mock.calls[0][0].where).toEqual({ status: 'PENDING', household: { htx_profile_id: 'htx-tc' } })
    expect(mockDb.diseaseFindMany.mock.calls[0][0].take).toBe(10)
    expect(out.lines).toEqual(['25/11/2026 · P-1 · Hộ A · Blister blight (87%)'])
  })

  it('caps a long answer at seven lines', async () => {
    mockDb.diseaseFindMany.mockResolvedValue(
      many(10, (i) => ({ detection_date: NOW, ai_disease_name: `D${i}`, ai_confidence: 0.5, parcel: { parcel_code: 'P' }, household: { name: 'H' } }))
    )
    expect((await tool('diseases').run(user('officer'), {}, NOW)).lines).toHaveLength(7)
  })
})

describe('profile', () => {
  it("shows a farmer's own household and the cooperative, scoped to the cooperative, with no ids", async () => {
    mockDb.householdFindFirst.mockResolvedValue({ name: 'Hộ A', phone: '0900', address: 'Thôn 1' })
    mockDb.htxProfile.mockResolvedValue({ id: 'htx-tc', name: 'HTX Tân Cương', address: 'Thái Nguyên', contact_phone: '0280', htx_code: 'TC' })
    const out = await tool('profile').run(user('farmer'), {}, NOW)
    expect(mockDb.householdFindFirst.mock.calls[0][0].where).toEqual({ id: 'hh_tc_1', htx_profile_id: 'htx-tc' })
    expect(out.lines).toEqual(['Nguyen Van A · Nông dân', 'Hộ: Hộ A · 0900', 'Thôn 1', 'HTX: HTX Tân Cương (TC)', 'Thái Nguyên', 'Liên hệ: 0280'])
    expect(out.lines.join('\n')).not.toMatch(/hh_tc_1|farmer-1/)
  })

  it('reads no household for an officer', async () => {
    const out = await tool('profile').run(user('officer'), {}, NOW)
    expect(mockDb.householdFindFirst).not.toHaveBeenCalled()
    expect(out.lines).toEqual(['Nguyen Van A · Cán bộ'])
  })
})

describe('documents', () => {
  it("lists only the cooperative's own folder, by name and date, with no URL", async () => {
    mockDb.documents.mockResolvedValue([
      { name: 'Projects', size: 0, uploadDate: NOW, key: 'para/TC/Projects/', isDir: true },
      { name: 'ke-hoach.pdf', size: 10, uploadDate: new Date('2026-11-20T03:00:00Z'), key: 'para/TC/ke-hoach.pdf', isDir: false },
    ])
    const out = await tool('documents').run(user('manager'), {}, NOW)
    expect(mockDb.documents).toHaveBeenCalledWith('para/TC/')
    expect(out.lines).toEqual(['Projects/', 'ke-hoach.pdf · 20/11/2026'])
    expect(out.lines.join('\n')).not.toMatch(/https?:|para\//)
  })

  it('caps a long answer at seven lines', async () => {
    mockDb.documents.mockResolvedValue(many(12, (i) => ({ name: `f${i}.pdf`, size: 1, uploadDate: NOW, key: `para/TC/f${i}.pdf`, isDir: false })))
    expect((await tool('documents').run(user('officer'), {}, NOW)).lines).toHaveLength(7)
  })
})

describe('partners', () => {
  it('lists up to ten partners, newest first, and caps the reply', async () => {
    mockDb.partnerFindMany.mockResolvedValue(many(10, (i) => ({ name: `Đối tác ${i}`, partner_type: 'BUYER', contact_phone: null, address: `Địa chỉ ${i}` })))
    const out = await tool('partners').run(user('farmer'), {}, NOW)
    expect(mockDb.partnerFindMany.mock.calls[0][0]).toMatchObject({ take: 10, orderBy: { created_at: 'desc' } })
    expect(out.lines).toHaveLength(7)
    expect(out.lines[0]).toBe('Đối tác 0 · BUYER · Địa chỉ 0')
  })
})
