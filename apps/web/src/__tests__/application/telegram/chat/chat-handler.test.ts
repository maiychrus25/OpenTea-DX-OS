// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramUpdateHandler, type TelegramUpdateInput } from '@/application/telegram/TelegramUpdateHandler'
import type { ChatTool } from '@/application/telegram/chat/types'
import { TELEGRAM_TEXT } from '@/application/telegram/messages'
import { signCallbackDataV2 } from '@/domain/telegram/callback-data'
import type { LiveRoleReader } from '@/domain/telegram/ports/LiveRoleReader'
import type { TelegramConversation, TelegramLink } from '@/domain/telegram/ports/TelegramRepository'

const KEY = 'chat-handler-test-key'
const NOW = new Date('2026-11-26T03:00:00Z')
const MANAGER_TG = 5001
const FARMER_TG = 6001

function link(partial: Partial<TelegramLink>): TelegramLink {
  return {
    id: 'l', kind: 'user', userId: 'u-manager', userName: 'Quản lý', role: 'manager', htxCode: 'TC',
    telegramUserId: String(MANAGER_TG), chatId: String(MANAGER_TG), linkedAt: NOW, ...partial,
  }
}

function fakeRepo(links: TelegramLink[]) {
  const conversations = new Map<string, TelegramConversation>()
  const seen = new Set<string>()
  const state = { recent: 0 }
  const repo = {
    conversations,
    state,
    markUpdateSeen: jest.fn(async (id: string) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }),
    forgetUpdate: jest.fn(async () => undefined),
    countRecentUpdates: jest.fn(async () => state.recent),
    activeUserLinkByTelegramUser: jest.fn(async (tg: string) => links.find((l) => l.telegramUserId === tg) ?? null),
    activeConversation: jest.fn(async (tg: string, now: Date) => {
      const row = conversations.get(tg)
      return row && row.expiresAt > now ? row : null
    }),
    conversationOf: jest.fn(async (tg: string) => conversations.get(tg) ?? null),
    setFlow: jest.fn(async (f: { telegramUserId: string; kind?: 'flow' | 'voice'; flow: string; step: number | null; state: Record<string, unknown>; token: string | null; cardMessageId: string | null; expiresAt: Date }) => {
      conversations.set(f.telegramUserId, { ...f, kind: f.kind ?? 'flow', proposalId: null })
    }),
    deleteConversation: jest.fn(async (tg: string) => {
      conversations.delete(tg)
    }),
    auditEvent: jest.fn(async () => undefined),
    heartbeatLastSeen: jest.fn(async () => null),
    unlinkUser: jest.fn(async () => 0),
    setConversation: jest.fn(async () => undefined),
  }
  return repo
}

const roles: LiveRoleReader = {
  read: jest.fn(async (userId: string) =>
    userId === 'u-manager'
      ? { roles: ['manager'], enabled: true, htxCode: 'TC' }
      : userId === 'u-farmer'
        ? { roles: ['farmer'], enabled: true, htxCode: 'TC' }
        : null
  ),
}

const nearby = {
  name: 'nearby',
  titleVi: 'Thửa gần đây',
  roles: ['farmer', 'officer', 'manager'],
  routes: [],
  args: [],
  run: jest.fn(async () => ({ lines: ['Thửa TC-A1 cách 0.4 km'], source: 'Vùng trồng' })),
} as unknown as ChatTool

function build(links: TelegramLink[] = [link({})]) {
  const repo = fakeRepo(links)
  const handler = new TelegramUpdateHandler({
    repo: repo as never,
    proposals: { findById: jest.fn(async () => null) },
    roles,
    notifier: { syncDecision: jest.fn(async () => undefined) },
    decide: jest.fn(async () => ({ outcome: 'executed', result: {} })) as never,
    htxProfileId: async () => 'htx-profile-1',
    callbackKey: KEY,
    chat: {
      tools: [nearby],
      actions: [],
      photos: { put: jest.fn(async () => undefined), get: jest.fn(async () => Buffer.alloc(0)) },
      requests: {} as never,
      householdId: async () => null,
      proposalMessages: async () => [],
    },
    campaigns: {} as never,
    now: () => NOW,
  })
  return { handler, repo }
}

let nextId = 7000
const message = (fields: Record<string, unknown>, tg = MANAGER_TG): TelegramUpdateInput => ({
  update_id: ++nextId,
  message: { chat: { id: tg, type: 'private' }, from: { id: tg }, ...fields } as TelegramUpdateInput['message'],
})

describe('TelegramUpdateHandler: chat routes', () => {
  test('/start alone shows the menu to a linked user', async () => {
    const { handler } = build()
    const res = await handler.handle(message({ text: '/start' }))
    expect(res.replies[0].text).toBe(TELEGRAM_TEXT.menuPrompt)
    expect(res.replies[0].buttons!.flat().map((b) => b.text)).toEqual(['Hôm nay', 'Việc cần duyệt', 'Hỏi'])
  })

  test('the 61st update of the hour gets rateLimited once, and later ones get nothing', async () => {
    const { handler, repo } = build()
    repo.state.recent = 61
    expect((await handler.handle(message({ text: '/menu' }))).replies[0].text).toBe(TELEGRAM_TEXT.rateLimited)
    repo.state.recent = 62
    expect(await handler.handle(message({ text: '/menu' }))).toEqual({ replies: [] })
  })

  test('/huy with a flow open cancels it, and /huy with nothing open says so', async () => {
    const { handler, repo } = build()
    await handler.handle(message({ text: '/hoi' }))
    expect(repo.conversations.get(String(MANAGER_TG))?.flow).toBe('ask')
    const cancelled = await handler.handle(message({ text: '/huy' }))
    expect(cancelled.replies[0].text).toBe(TELEGRAM_TEXT.flowCancelled)
    const nothing = await handler.handle(message({ text: '/huy' }))
    expect(nothing.replies[0].text).toBe(TELEGRAM_TEXT.nothingToCancel)
  })

  test('a photo outside a flow is answered, and a photo the relay could not forward names its error', async () => {
    const { handler } = build()
    const outside = await handler.handle(message({ photo: { mime_type: 'image/jpeg', data_base64: 'AAEC', file_unique_id: 'u1' } }))
    expect(outside.replies[0].text).toBe(TELEGRAM_TEXT.photoOutsideFlow)
    const large = await handler.handle(message({ photo_error: 'too_large' }))
    expect(large.replies[0].text).toBe(TELEGRAM_TEXT.photoOutsideFlow)
  })

  test('a location runs the nearby tool for the linked user', async () => {
    const { handler } = build()
    const res = await handler.handle(message({ location: { latitude: 11.9, longitude: 108.4 } }))
    expect(nearby.run).toHaveBeenCalledWith(expect.objectContaining({ telegramUserId: String(MANAGER_TG) }), { latitude: 11.9, longitude: 108.4 }, NOW)
    expect(res.replies[0].text).toContain('Nguồn: Vùng trồng')
  })

  test('a chat button with a token the presser does not hold is stale', async () => {
    const { handler } = build()
    const data = signCallbackDataV2(KEY, 'AAAAAAAAAAA', 'o0')
    const res = await handler.handle({
      update_id: ++nextId,
      callback_query: { id: 'cb', from: { id: MANAGER_TG }, message: { message_id: 4, chat: { id: MANAGER_TG, type: 'private' } }, data },
    })
    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.staleButton, show_alert: true })
    expect(res.replies).toEqual([])
  })

  test('a farmer without a household still gets the menu and no manager buttons', async () => {
    const { handler } = build([link({ userId: 'u-farmer', role: 'farmer', telegramUserId: String(FARMER_TG), chatId: String(FARMER_TG) })])
    const res = await handler.handle(message({ text: '/menu' }, FARMER_TG))
    expect(res.replies[0].buttons!.flat().map((b) => b.text)).toEqual(['Hôm nay', 'Ghi nhật ký', 'Hỏi'])
  })
})

describe('TelegramUpdateHandler: voice messages (M15)', () => {
  test('a forwarded voice text is echoed with the three buttons and held as a voice conversation', async () => {
    const { handler, repo } = build()
    const res = await handler.handle(message({ voice_text: 'giá chè hôm nay', voice_duration: 4 }))
    expect(res.replies[0].text).toBe('Em nghe được: “giá chè hôm nay”')
    expect(res.replies[0].buttons!.flat().map((b) => b.text)).toEqual(['Đúng', 'Sửa', 'Huỷ'])
    expect(repo.conversations.get(String(MANAGER_TG))).toMatchObject({ kind: 'voice', state: { text: 'giá chè hôm nay' } })
  })

  test('while A12 waits for an answer, a voice message asks for typed text and keeps the waiting conversation', async () => {
    const { handler, repo } = build()
    const waiting = {
      telegramUserId: String(MANAGER_TG), kind: 'app_answer' as const, proposalId: null, flow: null, step: null,
      state: { request_id: 'req-1' }, token: null, cardMessageId: null, expiresAt: new Date(Date.now() + 3_600_000),
    }
    repo.conversations.set(String(MANAGER_TG), waiting)
    for (const voice of [{ voice_text: 'cho cán bộ dùng', voice_duration: 3 }, { voice_error: 'stt_unavailable' as const }]) {
      const res = await handler.handle(message(voice))
      expect(res.replies).toEqual([expect.objectContaining({ text: TELEGRAM_TEXT.voiceTypeAnswer })])
      expect(res.replies[0].buttons).toBeUndefined()
    }
    expect(repo.conversations.get(String(MANAGER_TG))).toEqual(waiting)
  })

  test('voice_error and empty text map to their copy', async () => {
    const { handler } = build()
    expect((await handler.handle(message({ voice_error: 'too_long', voice_duration: 75 }))).replies[0].text).toBe(TELEGRAM_TEXT.voiceTooLong)
    expect((await handler.handle(message({ voice_error: 'stt_unavailable' }))).replies[0].text).toBe(TELEGRAM_TEXT.voiceUnavailable)
    expect((await handler.handle(message({ voice_text: '  ', voice_duration: 2 }))).replies[0].text).toBe(TELEGRAM_TEXT.voiceUnclear)
  })

  test('a voice message in a group or from an unlinked user starts nothing', async () => {
    const { handler, repo } = build()
    const group = await handler.handle({
      update_id: ++nextId,
      message: { chat: { id: -100, type: 'supergroup' }, from: { id: MANAGER_TG }, voice_text: 'hôm nay' } as TelegramUpdateInput['message'],
    })
    expect(group).toEqual({ replies: [] })
    const stranger = await handler.handle(message({ voice_text: 'hôm nay' }, 9999))
    expect(stranger).toEqual({ replies: [] })
    expect(repo.conversations.size).toBe(0)
  })
})
