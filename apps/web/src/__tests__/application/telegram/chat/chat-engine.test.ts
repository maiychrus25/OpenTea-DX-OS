// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { ChatEngine } from '@/application/telegram/chat/ChatEngine'
import type { ChatAction, ChatTool, ChatUser, PhotoStore } from '@/application/telegram/chat/types'
import { TELEGRAM_TEXT } from '@/application/telegram/messages'
import { verifyCallbackDataV2 } from '@/domain/telegram/callback-data'
import type { TelegramConversation } from '@/domain/telegram/ports/TelegramRepository'

const KEY = 'chat-engine-test-key'
const NOW = new Date('2026-11-26T03:00:00Z')
const FARMER: ChatUser = {
  tenant: { userId: 'u-farmer', role: 'farmer', htxCode: 'TC', htxProfileId: 'p-tc' },
  userName: 'Nông dân',
  householdId: 'hh_tc_1',
  telegramUserId: '42',
  chatId: 42,
}
const MANAGER: ChatUser = {
  ...FARMER,
  tenant: { ...FARMER.tenant, userId: 'u-manager', role: 'manager' },
  householdId: null,
  telegramUserId: '44',
  chatId: 44,
}

function fakeRepo() {
  const rows = new Map<string, TelegramConversation>()
  const audit: { actor: string; op: string; subject: string; details: Record<string, unknown> }[] = []
  return {
    rows,
    audit,
    conversationOf: jest.fn(async (tg: string) => rows.get(tg) ?? null),
    activeConversation: jest.fn(async (tg: string, now: Date) => {
      const row = rows.get(tg)
      return row && row.expiresAt > now ? row : null
    }),
    setFlow: jest.fn(async (f: { telegramUserId: string; flow: string; step: number | null; state: Record<string, unknown>; token: string | null; cardMessageId: string | null; expiresAt: Date }) => {
      rows.set(f.telegramUserId, { telegramUserId: f.telegramUserId, kind: 'flow', proposalId: null, flow: f.flow, step: f.step, state: f.state, token: f.token, cardMessageId: f.cardMessageId, expiresAt: f.expiresAt })
    }),
    deleteConversation: jest.fn(async (tg: string) => {
      rows.delete(tg)
    }),
    auditEvent: jest.fn(async (actor: string, op: string, subject: string, details: Record<string, unknown>) => {
      audit.push({ actor, op, subject, details })
    }),
  }
}

function fakePhotos() {
  const stored = new Map<string, Buffer>()
  const store: PhotoStore & { stored: Map<string, Buffer> } = {
    stored,
    put: jest.fn(async (key: string, bytes: Buffer) => {
      stored.set(key, bytes)
    }),
    get: jest.fn(async (key: string) => stored.get(key) ?? Buffer.alloc(0)),
  }
  return store
}

const PARCELS = [
  { value: 'p1', label: 'TC-A1' },
  { value: 'p2', label: 'TC-B2' },
  { value: 'p3', label: 'TC-C3' },
]

const journal = {
  name: 'journal.create',
  titleVi: 'Ghi nhật ký',
  risk: 'medium',
  roles: ['farmer', 'officer'],
  routes: [],
  args: [],
  steps: [
    { kind: 'choice', slot: 'parcel_id', promptVi: 'Chọn thửa:', choices: async () => PARCELS },
    {
      kind: 'choice',
      slot: 'activity_type',
      promptVi: 'Chọn hoạt động:',
      choices: async () => [
        { value: 'SPRAYING', label: 'Phun thuốc' },
        { value: 'IRRIGATION', label: 'Tưới nước' },
      ],
    },
    {
      kind: 'text',
      slot: 'product_name',
      promptVi: 'Tên thuốc hoặc phân bón:',
      maxLength: 200,
      when: (state: Record<string, unknown>) => state.activity_type === 'SPRAYING',
    },
    {
      kind: 'photo',
      slot: 'photo_key',
      promptVi: 'Gửi một ảnh minh chứng, hoặc bấm Bỏ qua.',
      optional: true,
      photoKey: () => 'telegram/TC/2026/fixed.jpg',
    },
  ],
  payloadSchema: z.object({
    parcel_id: z.string(),
    activity_type: z.string(),
    product_name: z.string().optional(),
    photo_key: z.string().nullable().optional(),
  }),
  consequenceVi: null,
  preview: jest.fn(async (payload: Record<string, unknown>) => [`Thửa: ${String(payload.parcel_id)}`]),
  execute: jest.fn(async () => 'Đã ghi nhật ký. Nhật ký đang chờ duyệt.'),
} as unknown as ChatAction

const disease = {
  name: 'disease.report',
  titleVi: 'Gửi ảnh bệnh',
  risk: 'low',
  roles: ['farmer'],
  routes: [],
  args: [],
  steps: [
    {
      kind: 'photo',
      slot: 'photo_key',
      promptVi: 'Gửi ảnh lá chè bị bệnh, chụp rõ một lá.',
      optional: false,
      photoKey: () => 'telegram/TC/2026/disease.jpg',
    },
  ],
  payloadSchema: z.object({ photo_key: z.string() }),
  consequenceVi: null,
  preview: jest.fn(async () => ['Ảnh: có']),
  execute: jest.fn(async () => 'Đã gửi ảnh. Cán bộ sẽ xem lại.'),
} as unknown as ChatAction

const weather = {
  name: 'weather',
  titleVi: 'Thời tiết',
  roles: ['farmer', 'officer', 'manager'],
  routes: [],
  args: [],
  run: jest.fn(async () => ({ lines: ['Trời nắng, 31 độ'], source: 'Thời tiết' })),
} as unknown as ChatTool

const pending = {
  name: 'pending',
  titleVi: 'Việc cần duyệt',
  roles: ['officer', 'manager'],
  routes: [],
  args: [],
  run: jest.fn(async () => ({ lines: ['Có 2 việc'], source: 'Đề xuất AI' })),
} as unknown as ChatTool

const nearby = {
  name: 'nearby',
  titleVi: 'Thửa gần đây',
  roles: ['farmer', 'officer', 'manager'],
  routes: [],
  args: [{ name: 'latitude', type: 'number', descriptionVi: '' }, { name: 'longitude', type: 'number', descriptionVi: '' }],
  run: jest.fn(async () => ({ lines: ['Thửa TC-A1 cách 0.4 km'], source: 'Vùng trồng' })),
} as unknown as ChatTool

function build(options: { tools?: ChatTool[]; actions?: ChatAction[] } = {}) {
  const repo = fakeRepo()
  const photos = fakePhotos()
  const requests = { submit: jest.fn(async () => true) }
  const engine = new ChatEngine({
    repo: repo as never,
    tools: options.tools ?? [weather, pending, nearby],
    actions: options.actions ?? [journal, disease],
    photos,
    requests: requests as never,
    callbackKey: KEY,
    proposalMessages: jest.fn(async () => []),
  })
  return { engine, repo, photos, requests }
}

beforeEach(() => jest.clearAllMocks())

/** The button of a reply with the given step, read the way Telegram delivers it. */
function buttonFor(replyButtons: { text: string; callback_data: string }[][] | undefined, label: string) {
  const button = replyButtons?.flat().find((b) => b.text === label)
  if (!button) throw new Error(`no button ${label}`)
  return verifyCallbackDataV2(KEY, button.callback_data)!
}

function press(engine: ChatEngine, user: ChatUser | null, telegramUserId: string, chatId: number, c: string, s: string, messageId = 9, now = NOW) {
  return engine.onCallback(user, { telegramUserId, c, s, chatId, messageId }, now)
}

describe('ChatEngine: menu, commands and tools', () => {
  test('/menu shows the role buttons, two per row', async () => {
    const { engine } = build()
    const farmer = await engine.menu(FARMER)
    expect(farmer.replies[0].text).toBe(TELEGRAM_TEXT.menuPrompt)
    expect(farmer.replies[0].buttons!.map((row) => row.map((b) => b.text))).toEqual([
      ['Hôm nay', 'Ghi nhật ký'],
      ['Báo bệnh', 'Hỏi'],
    ])
    const manager = await engine.menu(MANAGER)
    expect(manager.replies[0].buttons!.map((row) => row.map((b) => b.text))).toEqual([['Hôm nay', 'Việc cần duyệt'], ['Hỏi']])
  })

  test('a routed sentence runs its tool and ends with the source line', async () => {
    const { engine } = build()
    const res = await engine.onText(FARMER, 'thời tiết hôm nay', NOW)
    expect(res.replies).toEqual([{ op: 'send', chat_id: 42, text: 'Trời nắng, 31 độ\nNguồn: Thời tiết' }])
  })

  test('a tool the role does not have answers noPermission and runs nothing', async () => {
    const { engine } = build()
    const res = await engine.onText(FARMER, 'có việc nào cần duyệt không', NOW)
    expect(res.replies[0].text).toBe(TELEGRAM_TEXT.noPermission('Việc cần duyệt'))
    expect(pending.run).not.toHaveBeenCalled()
  })

  test('location runs the nearby tool with the coordinates', async () => {
    const { engine } = build()
    const res = await engine.onLocation(FARMER, 11.9, 108.4, NOW)
    expect(nearby.run).toHaveBeenCalledWith(FARMER, { latitude: 11.9, longitude: 108.4 }, NOW)
    expect(res.replies[0].text).toContain('Nguồn: Vùng trồng')
  })

  test('an unmatched sentence goes to the assistant request', async () => {
    const { engine, requests } = build()
    const res = await engine.onText(FARMER, 'mai có nên đi hái không', NOW)
    expect(requests.submit).toHaveBeenCalledWith(FARMER, 'mai có nên đi hái không', NOW)
    expect(res.replies[0].text).toBe(TELEGRAM_TEXT.thinking)
  })
})

describe('ChatEngine: flows and steps', () => {
  test('a choice step with more than 8 choices takes a typed answer, and the card follows', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ value: `p${i}`, label: `TC-Z${i}` }))
    const parcelOnly = {
      ...journal,
      steps: [{ ...journal.steps[0], choices: async () => many }],
      payloadSchema: z.object({ parcel_id: z.string() }),
    } as unknown as ChatAction
    const { engine, repo } = build({ actions: [parcelOnly] })

    const start = await engine.onText(FARMER, '/nhatky', NOW)
    expect(start.replies[0].text).toBe('Nhập mã thửa, ví dụ TC-A1:')
    expect(start.replies[0].buttons!.flat().map((b) => b.text)).toEqual(['Huỷ'])
    expect((await engine.onText(FARMER, 'TC-Z99', NOW)).replies[0].text).toBe(TELEGRAM_TEXT.noMatch)

    const card = await engine.onText(FARMER, 'tc-z3', NOW)
    expect(card.replies[0].text).toContain('Thửa: p3')
    expect(repo.rows.get('42')).toMatchObject({ flow: 'journal.create', step: -1, state: { parcel_id: 'p3' } })
  })

  /** Presses the button with this label of the last reply, and returns the new response. */
  async function tap(engine: ChatEngine, user: ChatUser, lastButtons: { text: string; callback_data: string }[][] | undefined, label: string, telegramUserId = '42', chatId = 42, now = NOW) {
    const { c, s } = buttonFor(lastButtons, label)
    return press(engine, user, telegramUserId, chatId, c, s, 9, now)
  }

  test('a farmer walks the spraying journal flow: parcel, activity, product, optional photo skipped', async () => {
    const { engine, repo } = build()
    const first = await engine.onText(FARMER, '/nhatky', NOW)
    expect(first.replies[0]).toMatchObject({ text: 'Chọn thửa:' })
    const second = await tap(engine, FARMER, first.replies[0].buttons, 'TC-B2')
    expect(second.replies[0].text).toBe('Chọn hoạt động:')
    const third = await tap(engine, FARMER, second.replies[0].buttons, 'Phun thuốc')
    expect(third.replies[0].text).toBe('Tên thuốc hoặc phân bón:')
    expect(third.replies[0].buttons!.flat().map((b) => b.text)).toEqual(['Huỷ'])

    await engine.onText(FARMER, 'Regent 800WG', NOW)
    const photo = await engine.onText(FARMER, 'x', NOW)
    expect(photo.replies[0].text).toBe(TELEGRAM_TEXT.expectPhoto)
    expect(repo.rows.get('42')).toMatchObject({ flow: 'journal.create', step: 3 })
  })

  test('the optional photo step shows Bỏ qua, and skipping it moves on to the card', async () => {
    const { engine, repo } = build()
    const first = await engine.onText(FARMER, '/nhatky', NOW)
    const second = await tap(engine, FARMER, first.replies[0].buttons, 'TC-A1')
    const third = await tap(engine, FARMER, second.replies[0].buttons, 'Tưới nước')
    expect(third.replies[0].text).toBe('Gửi một ảnh minh chứng, hoặc bấm Bỏ qua.')
    expect(third.replies[0].buttons!.flat().map((b) => b.text)).toEqual(['Bỏ qua', 'Huỷ'])

    const card = await tap(engine, FARMER, third.replies[0].buttons, 'Bỏ qua')
    expect(card.replies[0].text).toContain('Ghi nhật ký')
    expect(card.replies[0].text).toContain('Thẻ hết hạn sau 10 phút')
    expect(repo.rows.get('42')).toMatchObject({ flow: 'journal.create', step: -1 })
  })

  test('wrong input kind: text at a photo step and a photo at a text step are refused with nothing stored', async () => {
    const { engine, repo, photos } = build()
    await engine.onText(FARMER, '/benh', NOW)
    expect((await engine.onText(FARMER, 'lá vàng', NOW)).replies[0].text).toBe(TELEGRAM_TEXT.expectPhoto)
    expect(repo.rows.get('42')).toMatchObject({ flow: 'disease.report', step: 0 })
    expect(photos.put).not.toHaveBeenCalled()

    await engine.onText(FARMER, '/nhatky', NOW)
    const res = await engine.onPhoto(FARMER, { kind: 'image', bytes: Buffer.from([1, 2, 3]), mimeType: 'image/jpeg' }, NOW)
    expect(res.replies[0].text).toBe(TELEGRAM_TEXT.expectChoice)
    expect(photos.put).not.toHaveBeenCalled()
  })

  test('a photo outside a flow gets photoOutsideFlow', async () => {
    const { engine, photos } = build()
    const res = await engine.onPhoto(FARMER, { kind: 'image', bytes: Buffer.from([1]), mimeType: 'image/jpeg' }, NOW)
    expect(res.replies[0].text).toBe(TELEGRAM_TEXT.photoOutsideFlow)
    expect(photos.put).not.toHaveBeenCalled()
  })

  test('a photo that the relay could not forward gets photoTooLarge or photoFailed, and the flow keeps its step', async () => {
    const { engine, repo } = build()
    await engine.onText(FARMER, '/benh', NOW)
    expect((await engine.onPhoto(FARMER, { kind: 'error', reason: 'too_large' }, NOW)).replies[0].text).toBe(TELEGRAM_TEXT.photoTooLarge)
    expect((await engine.onPhoto(FARMER, { kind: 'error', reason: 'download_failed' }, NOW)).replies[0].text).toBe(TELEGRAM_TEXT.photoFailed)
    expect(repo.rows.get('42')).toMatchObject({ flow: 'disease.report', step: 0 })
  })

  test('a disease photo is stored under the step key and the card follows', async () => {
    const { engine, photos } = build()
    await engine.onText(FARMER, '/benh', NOW)
    const res = await engine.onPhoto(FARMER, { kind: 'image', bytes: Buffer.from([9, 9]), mimeType: 'image/jpeg' }, NOW)
    expect(photos.put).toHaveBeenCalledWith('telegram/TC/2026/disease.jpg', Buffer.from([9, 9]), 'image/jpeg')
    expect(res.replies[0].text).toContain('Gửi ảnh bệnh')
  })

  test('a flow idle for 30 minutes answers flowExpired and is dropped', async () => {
    const { engine, repo } = build()
    await engine.onText(FARMER, '/benh', NOW)
    const later = new Date(NOW.getTime() + 30 * 60 * 1000)
    const res = await engine.onText(FARMER, 'lá vàng', later)
    expect(res.replies[0].text).toBe(TELEGRAM_TEXT.flowExpired)
    expect(repo.rows.has('42')).toBe(false)
  })

  test('after /hoi the next text goes to the assistant, and only the text after it is routed again', async () => {
    const { engine, requests } = build()
    await engine.onText(FARMER, '/hoi', NOW)
    await engine.onText(FARMER, 'thời tiết hôm nay', NOW)
    expect(requests.submit).toHaveBeenCalledWith(FARMER, 'thời tiết hôm nay', NOW)
    expect(weather.run).not.toHaveBeenCalled()

    await engine.onText(FARMER, 'thời tiết hôm nay', NOW)
    expect(weather.run).toHaveBeenCalledTimes(1)
  })
})
