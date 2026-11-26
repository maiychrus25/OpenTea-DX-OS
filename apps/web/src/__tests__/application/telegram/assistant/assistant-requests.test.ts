// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AssistantRequests, claimPayload, ASSISTANT_TIMEOUT_MS } from '@/application/telegram/assistant/AssistantRequests'
import { AssistantResultUseCase, assistantTimeoutInserts } from '@/application/telegram/assistant/AssistantResult'
import { parseAssistantIntent } from '@/application/telegram/assistant/intent'
import { ChatEngine } from '@/application/telegram/chat/ChatEngine'
import type { ChatAction, ChatTool, ChatUser } from '@/application/telegram/chat/types'
import { TELEGRAM_TEXT } from '@/application/telegram/messages'
import type { AssistantRequestRow, AssistantRequestRepository, ExpiredAssistantRequest } from '@/domain/telegram/ports/AssistantRequestRepository'
import type { TelegramLink } from '@/domain/telegram/ports/TelegramRepository'
import { z } from 'zod'

const KEY = 'assistant-test-key'
const NOW = new Date('2026-11-26T03:00:00Z')
const FARMER: ChatUser = {
  tenant: { userId: 'u-farmer', role: 'farmer', htxCode: 'TC', htxProfileId: 'p-tc' },
  userName: 'Nông dân',
  householdId: 'hh_tc_1',
  telegramUserId: '42',
  chatId: 42,
}

function requestRepo(initial: Partial<AssistantRequestRow>[] = []) {
  const rows = new Map<string, AssistantRequestRow>()
  for (const r of initial) rows.set(r.id!, { htxCode: 'TC', telegramUserId: '42', chatId: '42', userId: 'u-farmer', role: 'farmer', text: 'x', status: 'claimed', createdAt: NOW, runId: null, ...r } as AssistantRequestRow)
  const repo = {
    rows,
    create: jest.fn(async () => 'new-id'),
    claim: jest.fn(async () => []),
    find: jest.fn(async (id: string) => rows.get(id) ?? null),
    finish: jest.fn(async (id: string, htx: string) => {
      const r = rows.get(id)
      if (!r || r.htxCode !== htx || r.status !== 'claimed') return false
      rows.set(id, { ...r, status: 'done', text: '' })
      return true
    }),
    expireOlderThan: jest.fn(async (_cutoff: Date) => [] as ExpiredAssistantRequest[]),
  }
  return repo as typeof repo & AssistantRequestRepository
}

const weather = {
  name: 'weather',
  titleVi: 'Thời tiết',
  roles: ['farmer', 'officer', 'manager'],
  routes: [],
  args: [{ name: 'day', type: 'enum', values: ['today', 'tomorrow'], descriptionVi: 'Ngày' }],
  run: jest.fn(async () => ({ lines: ['Trời nắng'], source: 'Thời tiết' })),
} as unknown as ChatTool

const spraying = {
  name: 'journal.create',
  titleVi: 'Ghi nhật ký',
  risk: 'medium',
  roles: ['farmer', 'officer'],
  routes: [],
  args: [{ name: 'parcel_id', type: 'string', descriptionVi: 'Mã thửa' }],
  steps: [{ kind: 'choice', slot: 'parcel_id', promptVi: 'Chọn thửa:', choices: async () => [{ value: 'p1', label: 'TC-A1' }] }],
  payloadSchema: z.object({ parcel_id: z.string() }),
  consequenceVi: null,
  preview: async () => ['Thửa: p1'],
  execute: jest.fn(async () => 'ok'),
} as unknown as ChatAction

const manager = { ...spraying, name: 'journal.batch_approve', titleVi: 'Duyệt nhật ký', roles: ['manager'], steps: [] } as unknown as ChatAction

function engineFor(actions: ChatAction[] = [spraying, manager]) {
  const repo = {
    conversationOf: jest.fn(async () => null),
    setFlow: jest.fn(async () => undefined),
    deleteConversation: jest.fn(async () => undefined),
    auditEvent: jest.fn(async () => undefined),
  }
  return new ChatEngine({
    repo: repo as never,
    tools: [weather],
    actions,
    photos: { put: jest.fn(), get: jest.fn() },
    requests: { submit: jest.fn(async () => true) },
    callbackKey: KEY,
    proposalMessages: jest.fn(async () => []),
  })
}

const link: TelegramLink = {
  id: 'l', kind: 'user', userId: 'u-farmer', userName: 'Nông dân', role: 'farmer', htxCode: 'TC',
  telegramUserId: '42', chatId: '42', linkedAt: NOW,
}

function resultUseCase(opts: { requests: ReturnType<typeof requestRepo>; live?: ChatUser | null; engine?: ChatEngine; enqueue?: jest.Mock }) {
  const enqueue = opts.enqueue ?? jest.fn(async () => undefined)
  const useCase = new AssistantResultUseCase({
    requests: opts.requests,
    links: { activeUserLinkByTelegramUser: jest.fn(async () => link) },
    users: { resolve: jest.fn(async () => (opts.live === undefined ? FARMER : opts.live)) } as never,
    engine: opts.engine ?? engineFor(),
    enqueue,
  })
  return { useCase, enqueue }
}

describe('AssistantRequests: submit and expiry', () => {
  test('a request is created only while the cooperative agent heartbeat is recent', async () => {
    const requests = requestRepo()
    let seen: Date | null = new Date(NOW.getTime() - 5 * 60 * 1000)
    const service = new AssistantRequests(requests, { heartbeatLastSeen: jest.fn(async () => seen) })
    expect(await service.submit(FARMER, 'mai có nên đi hái không', NOW)).toBe(true)
    expect(requests.create).toHaveBeenCalledWith(expect.objectContaining({ htxCode: 'TC', telegramUserId: '42', chatId: '42', role: 'farmer' }))

    seen = new Date(NOW.getTime() - 11 * 60 * 1000)
    expect(await service.submit(FARMER, 'câu hỏi', NOW)).toBe(false)
    seen = null
    expect(await service.submit(FARMER, 'câu hỏi', NOW)).toBe(false)
    expect(requests.create).toHaveBeenCalledTimes(1)
  })

  test('a text over 1000 characters is not sent', async () => {
    const requests = requestRepo()
    const service = new AssistantRequests(requests, { heartbeatLastSeen: async () => NOW })
    expect(await service.submit(FARMER, 'a'.repeat(1001), NOW)).toBe(false)
    expect(requests.create).not.toHaveBeenCalled()
  })

  test('expiry uses the 60 second window and returns the chats to answer', async () => {
    const requests = requestRepo()
    requests.expireOlderThan.mockResolvedValueOnce([{ htxCode: 'TC', chatId: '42', role: 'farmer' }])
    const service = new AssistantRequests(requests, { heartbeatLastSeen: async () => NOW })
    const expired = await service.expire(NOW)
    expect(requests.expireOlderThan).toHaveBeenCalledWith(new Date(NOW.getTime() - ASSISTANT_TIMEOUT_MS))
    const inserts = assistantTimeoutInserts(expired, KEY)
    expect(inserts[0]).toMatchObject({ htxCode: 'TC', chatId: '42', op: 'send', text: TELEGRAM_TEXT.assistantTimeout, purpose: 'reply' })
    expect(inserts[0].buttons!.flat().length).toBeGreaterThan(0)
  })
})

describe('claim payload (contract C7)', () => {
  test('carries the full tool and action lists, the role and today', () => {
    const rows: AssistantRequestRow[] = [
      { id: 'r1', htxCode: 'TC', telegramUserId: '42', chatId: '42', userId: 'u-farmer', role: 'farmer', text: 'mai', status: 'claimed', createdAt: NOW, runId: null },
    ]
    const payload = claimPayload(rows, [weather], [spraying, manager], '2026-11-26')
    expect(payload.requests[0]).toMatchObject({ id: 'r1', text: 'mai', role: 'farmer', today: '2026-11-26' })
    expect(payload.requests[0].tools).toEqual([{ name: 'weather', title_vi: 'Thời tiết', args: weather.args }])
    expect(payload.requests[0].actions.map((a) => a.name)).toEqual(['journal.create', 'journal.batch_approve'])
  })
})

describe('intent parsing', () => {
  test('a bad shape is unknown, and a good one keeps its name and arguments', () => {
    expect(parseAssistantIntent({ type: 'tool', name: 'weather', args: { day: 'today' } })).toEqual({ type: 'tool', name: 'weather', args: { day: 'today' } })
    expect(parseAssistantIntent({ type: 'action', name: 'journal.create' })).toEqual({ type: 'action', name: 'journal.create', args: {} })
    expect(parseAssistantIntent({ type: 'tool' })).toEqual({ type: 'unknown' })
    expect(parseAssistantIntent('junk')).toEqual({ type: 'unknown' })
    expect(parseAssistantIntent({ type: 'unknown' })).toEqual({ type: 'unknown' })
  })
})

describe('AssistantResultUseCase', () => {
  test('a result for another cooperative is not_found, and a second result is a conflict', async () => {
    const requests = requestRepo([{ id: 'r1', htxCode: 'LB' }, { id: 'r2' }])
    const { useCase } = resultUseCase({ requests })
    expect(await useCase.execute('TC', 'r1', { type: 'unknown' }, null, NOW)).toBe('not_found')
    expect(await useCase.execute('TC', 'missing', { type: 'unknown' }, null, NOW)).toBe('not_found')
    expect(await useCase.execute('TC', 'r2', { type: 'unknown' }, null, NOW)).toBe('ok')
    expect(await useCase.execute('TC', 'r2', { type: 'unknown' }, null, NOW)).toBe('conflict')
  })

  test('a tool intent runs the tool as the user and the answer is queued to their chat', async () => {
    const requests = requestRepo([{ id: 'r1' }])
    const { useCase, enqueue } = resultUseCase({ requests })
    await useCase.execute('TC', 'r1', { type: 'tool', name: 'weather', args: {} }, null, NOW)
    expect(enqueue).toHaveBeenCalledWith([
      expect.objectContaining({ htxCode: 'TC', chatId: '42', op: 'send', text: 'Trời nắng\nNguồn: Thời tiết', purpose: 'reply' }),
    ])
    expect(requests.rows.get('r1')).toMatchObject({ status: 'done', text: '' })
  })

  test('an action intent starts its flow with the valid arguments prefilled', async () => {
    const requests = requestRepo([{ id: 'r1' }])
    const engine = engineFor()
    const { useCase, enqueue } = resultUseCase({ requests, engine })
    await useCase.execute('TC', 'r1', { type: 'action', name: 'journal.create', args: { parcel_id: 'TC-A1' } }, null, NOW)
    // The prefilled choice is answered, so the card (not the parcel prompt) is the reply.
    const sent = enqueue.mock.calls[0][0][0]
    expect(sent.text).toContain('Ghi nhật ký')
    expect(sent.text).toContain('Thửa: p1')
  })

  test('an out-of-role action intent gets noPermission and no card', async () => {
    const requests = requestRepo([{ id: 'r1' }])
    const { useCase, enqueue } = resultUseCase({ requests })
    await useCase.execute('TC', 'r1', { type: 'action', name: 'journal.batch_approve', args: {} }, null, NOW)
    expect(enqueue.mock.calls[0][0][0].text).toBe(TELEGRAM_TEXT.noPermission('Duyệt nhật ký'))
  })

  test('an unknown name is notUnderstood with the menu', async () => {
    const requests = requestRepo([{ id: 'r1' }])
    const { useCase, enqueue } = resultUseCase({ requests })
    await useCase.execute('TC', 'r1', { type: 'tool', name: 'no_such_tool', args: {} }, null, NOW)
    const sent = enqueue.mock.calls[0][0][0]
    expect(sent.text).toBe(TELEGRAM_TEXT.notUnderstood)
    expect(sent.buttons.length).toBeGreaterThan(0)
  })

  test('when the requester is no longer linked, the answer is noPermission', async () => {
    const requests = requestRepo([{ id: 'r1' }])
    const { useCase, enqueue } = resultUseCase({ requests, live: null })
    await useCase.execute('TC', 'r1', { type: 'tool', name: 'weather', args: {} }, null, NOW)
    expect(enqueue.mock.calls[0][0][0].text).toBe(TELEGRAM_TEXT.noPermission('Trợ lý Telegram'))
  })
})
