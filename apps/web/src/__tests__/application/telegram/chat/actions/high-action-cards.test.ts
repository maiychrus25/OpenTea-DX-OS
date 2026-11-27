/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Review Focus 2 and 3 and the second card of a high action, through the real engine and the real journal.delete.
import { ChatEngine } from '@/application/telegram/chat/ChatEngine'
import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import type { ChatUser } from '@/application/telegram/chat/types'
import { TELEGRAM_TEXT } from '@/application/telegram/messages'
import type { TelegramConversation } from '@/domain/telegram/ports/TelegramRepository'

const mockFakes = { scoped: jest.fn(), remove: jest.fn() }

jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({
  PrismaJournalRepository: jest.fn(() => ({ findManyScoped: (...a: unknown[]) => mockFakes.scoped(...a) })),
}))
jest.mock('@/application/journal/DeleteJournalEntryUseCase', () => ({
  DeleteJournalEntryUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.remove(...a) })),
}))

const NOW = new Date('2026-11-27T03:00:00Z')
const FARMER: ChatUser = {
  tenant: { userId: 'u-farmer', role: 'farmer', htxCode: 'TC', htxProfileId: 'p-tc' },
  userName: 'Nông dân',
  householdId: 'hh1',
  telegramUserId: '42',
  chatId: 42,
}
const DEMOTED: ChatUser = { ...FARMER, tenant: { ...FARMER.tenant, role: 'manager' }, householdId: null }

function build() {
  const rows = new Map<string, TelegramConversation>()
  const repo = {
    conversationOf: jest.fn(async (tg: string) => rows.get(tg) ?? null),
    setFlow: jest.fn(async (f: { telegramUserId: string; flow: string; step: number | null; state: Record<string, unknown>; token: string | null; cardMessageId: string | null; expiresAt: Date }) => {
      rows.set(f.telegramUserId, { ...f, kind: 'flow', proposalId: null })
    }),
    deleteConversation: jest.fn(async (tg: string) => void rows.delete(tg)),
    auditEvent: jest.fn(),
  }
  const engine = new ChatEngine({
    repo: repo as never,
    tools: [],
    actions: CHAT_ACTIONS,
    photos: { put: jest.fn(), get: jest.fn(), delete: jest.fn() },
    requests: { submit: jest.fn() } as never,
    callbackKey: 'k',
    proposalMessages: jest.fn(async () => []),
  })
  const firstCard = () =>
    rows.set('42', { telegramUserId: '42', kind: 'flow', proposalId: null, flow: 'journal.delete', step: -1, state: { entry_id: 'e1' }, token: 'tok1', cardMessageId: null, expiresAt: new Date(NOW.getTime() + 60_000) })
  const press = (user: ChatUser, c: string, s: string) => engine.onCallback(user, { telegramUserId: '42', c, s, chatId: 42, messageId: 9 }, NOW)
  return { engine, repo, rows, firstCard, press }
}

beforeEach(() => {
  mockFakes.scoped.mockReset()
  mockFakes.remove.mockReset()
  mockFakes.scoped.mockResolvedValue([
    { id: 'e1', household_id: 'hh1', parcel_code: 'TC-A1', activity_type: 'SPRAYING', status: 'PENDING_APPROVAL', entry_date: new Date('2026-11-25T00:00:00Z') },
  ])
  mockFakes.remove.mockResolvedValue(undefined)
})

describe('a high action through the engine', () => {
  it('shows the object and the consequence on the second card', async () => {
    const { firstCard, press } = build()
    firstCard()
    const second = await press(FARMER, 'tok1', 'next')
    expect(second.replies[0].text).toBe(
      [TELEGRAM_TEXT.secondCardTitle, 'Nhật ký: 25/11 · TC-A1 · Phun thuốc', 'Nhật ký sẽ bị rút lại và xoá. Không thể khôi phục.', TELEGRAM_TEXT.secondCardFooter].join('\n')
    )
  })

  it('deletes once when the final button is tapped twice (Review Focus 3)', async () => {
    const { rows, firstCard, press } = build()
    firstCard()
    await press(FARMER, 'tok1', 'next')
    const token = rows.get('42')!.token!
    const done = await press(FARMER, token, 'final')
    expect(done.replies[0]).toMatchObject({ op: 'edit', text: 'Đã rút lại nhật ký.' })
    const again = await press(FARMER, token, 'final')
    expect(again.answer_callback).toEqual({ text: TELEGRAM_TEXT.staleButton, show_alert: true })
    expect(mockFakes.remove).toHaveBeenCalledTimes(1)
  })

  it('answers noPermission and writes nothing when the role changed after the card (Review Focus 2)', async () => {
    const { rows, firstCard, press } = build()
    firstCard()
    await press(FARMER, 'tok1', 'next')
    const refused = await press(DEMOTED, rows.get('42')!.token!, 'final')
    expect(refused.answer_callback).toEqual({ text: TELEGRAM_TEXT.noPermission('Rút nhật ký'), show_alert: true })
    expect(mockFakes.remove).not.toHaveBeenCalled()
  })
})
