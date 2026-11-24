// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramNotifier } from '@/application/telegram/TelegramNotifier'
import { verifyCallbackData } from '@/domain/telegram/callback-data'
import type { OutboxRow, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import type { Proposal } from '@/domain/agent/proposal'

const KEY = 'notifier-key'
const PROPOSAL_ID = '00000000-0000-4000-8000-0000000000aa'
const NOW = new Date('2026-11-24T10:00:00Z')

const proposal: Proposal = {
  id: PROPOSAL_ID, htxCode: 'TC', runId: null, agent: 'journal-review', kind: 'journal.approve',
  payload: { entry_ids: ['e1'] }, reasonVi: 'Đủ dữ liệu', evidence: { rows: [], sha256: '' }, confidence: null,
  risk: 'medium', status: 'proposed', origin: 'agent', requestedBy: null, dedupeKey: '', createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 3600_000), decidedBy: null, decidedByName: null, decidedAt: null,
  decisionChannel: null, decisionNote: null, editedPayload: null, executedAt: null, result: null,
}

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: '00000000-0000-4000-8000-0000000000bb', htxCode: 'TC', chatId: '42', op: 'send', text: 'old',
    buttons: null, editMessageId: null, proposalId: PROPOSAL_ID, purpose: 'proposal', healthKey: null,
    status: 'leased', attempts: 1, telegramMessageId: null, ...overrides,
  }
}

function fakeRepo(extra: Record<string, unknown> = {}) {
  const base = {
    userLinkRecipients: jest.fn(async () => [{ id: 'l1', kind: 'user', chatId: '42' }, { id: 'l2', kind: 'user', chatId: '43' }]),
    groupLinkRecipients: jest.fn(async () => [{ id: 'g1', kind: 'group', chatId: '-100' }]),
    enqueue: jest.fn(async (_rows: unknown[]) => undefined),
    outboxRow: jest.fn(async () => row()),
    markSent: jest.fn(async () => undefined),
    markFailed: jest.fn(async () => undefined),
    markRetry: jest.fn(async () => undefined),
    proposalSends: jest.fn(async () => []),
    updateUnsentText: jest.fn(async (_id: string, _text: string) => undefined),
    insertReportIfNew: jest.fn(async (_htx: string, _kind: string, _start: string) => true),
    proposalCounts: jest.fn(async () => ({ open: 2, decided: 5 })),
    enabledAgentCooperatives: jest.fn(async () => ['TC']),
    heartbeatLastSeen: jest.fn(async () => null),
    lastRunsAllFailed: jest.fn(async () => false),
    healthRecentlyQueued: jest.fn(async () => false),
    unnotifiedAlerts: jest.fn(async () => []),
    markAlertsNotified: jest.fn(async () => undefined),
  }
  return { ...base, ...extra } as typeof base
}

function notifierWith(repo: ReturnType<typeof fakeRepo>) {
  return new TelegramNotifier({
    repo: repo as unknown as TelegramRepository,
    proposals: { findById: jest.fn(async () => proposal) } as never,
    labelsFor: async () => new Map(),
    now: () => NOW,
  })
}

describe('TelegramNotifier', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env = { ...env, TELEGRAM_BOT_USERNAME: 'dxos_bot', DXOS_TELEGRAM_CALLBACK_KEY: KEY }
  })
  afterEach(() => {
    process.env = env
  })

  test('a new proposal is sent to each linked approver with signed Approve and Reject buttons', async () => {
    const repo = fakeRepo()
    await notifierWith(repo).enqueueProposal(proposal)

    expect(repo.userLinkRecipients).toHaveBeenCalledWith('TC', ['officer', 'manager'])
    const rows = repo.enqueue.mock.calls[0][0] as { chatId: string; buttons: { callback_data: string }[][]; text: string }[]
    expect(rows.map((r) => r.chatId)).toEqual(['42', '43'])
    const [approve, reject] = rows[0].buttons[0]
    expect(verifyCallbackData(KEY, approve.callback_data)).toEqual({ proposalId: PROPOSAL_ID, op: 'a' })
    expect(verifyCallbackData(KEY, reject.callback_data)).toEqual({ proposalId: PROPOSAL_ID, op: 'r' })
    expect(rows[0].text).toContain('Đề xuất: Duyệt nhật ký canh tác')
  })

  test('nothing is queued without a callback key (the buttons could not be signed)', async () => {
    process.env.DXOS_TELEGRAM_CALLBACK_KEY = ''
    const repo = fakeRepo()
    await notifierWith(repo).enqueueProposal(proposal)
    expect(repo.enqueue).not.toHaveBeenCalled()
  })

  test('linked approvers still get the proposal when the bot username is not set (it only builds link URLs)', async () => {
    process.env.TELEGRAM_BOT_USERNAME = ''
    const repo = fakeRepo()
    await notifierWith(repo).enqueueProposal(proposal)
    expect(repo.enqueue).toHaveBeenCalledTimes(1)
  })

  test('a sent message is edited, and an unsent one is rewritten before it goes out', async () => {
    const sent = row({ id: 'sent-1', status: 'sent', telegramMessageId: '777', text: 'x' })
    const pending = row({ id: 'pending-1', status: 'pending', text: 'x', chatId: '43' })
    const repo = fakeRepo({ proposalSends: jest.fn(async () => [sent, pending]) })
    const proposalDecided = { ...proposal, status: 'executed' as const, decidedByName: 'Anh An', decidedAt: NOW }
    const notifier = new TelegramNotifier({
      repo: repo as unknown as TelegramRepository,
      proposals: { findById: jest.fn(async () => proposalDecided) } as never,
      now: () => NOW,
    })

    await notifier.syncDecision('TC', PROPOSAL_ID)

    const edits = repo.enqueue.mock.calls[0][0] as { op: string; editMessageId: string }[]
    expect(edits).toEqual([expect.objectContaining({ op: 'edit', editMessageId: '777' })])
    expect(repo.updateUnsentText).toHaveBeenCalledWith('pending-1', 'Đã được Anh An duyệt lúc 17:00, đã thực hiện.')
  })

  test('a relay result with a rate limit is retried after retry_after, and a permanent error stops', async () => {
    const repo = fakeRepo()
    const notifier = notifierWith(repo)

    await notifier.recordResult(row().id, { ok: false, error: 'Too Many Requests', retry_after_seconds: 30 })
    expect(repo.markRetry).toHaveBeenCalledWith(row().id, 'Too Many Requests', new Date(NOW.getTime() + 30_000))

    await notifier.recordResult(row().id, { ok: false, error: 'chat not found', permanent: true })
    expect(repo.markFailed).toHaveBeenCalledWith(row().id, 'chat not found')
  })

  test('an ok result records the Telegram message id, and an edit that is not modified counts as sent', async () => {
    const repo = fakeRepo({ outboxRow: jest.fn(async () => row({ op: 'edit', purpose: 'result', text: 'final' })) })
    const notifier = notifierWith(repo)
    await notifier.recordResult(row().id, { ok: true, telegram_message_id: 901 })
    expect(repo.markSent).toHaveBeenCalledWith(row().id, '901')

    await notifier.recordResult(row().id, { ok: false, error: 'Bad Request: message is not modified' })
    expect(repo.markSent).toHaveBeenLastCalledWith(row().id, null)
    expect(repo.markRetry).not.toHaveBeenCalled()
  })

  test('a report is recorded once per cooperative, kind and period, and counts the proposal figures itself', async () => {
    const repo = fakeRepo()
    const queued = await notifierWith(repo).enqueueReport('TC', 'daily', '2026-11-24', '2026-11-24', {
      journals_new: 3, journals_approved: 1, journals_pending: 2, disease_reports: 0, lots_created: 1,
    })
    expect(queued).toBe(true)
    const rows = repo.enqueue.mock.calls[0][0] as { text: string; purpose: string; chatId: string }[]
    expect(rows.map((r) => r.chatId)).toEqual(['42', '43', '-100'])
    expect(rows[0].purpose).toBe('report')
    expect(rows[0].text).toContain('Đề xuất đang mở: 2 · đã xử lý: 5')
    expect(rows[0].text).not.toContain('Cảm biến')

    repo.insertReportIfNew.mockResolvedValueOnce(false)
    expect(await notifierWith(repo).enqueueReport('TC', 'daily', '2026-11-24', '2026-11-24', {})).toBe(false)
  })

  test('the agent is stale only for cooperatives that enabled it, and a stale repeat is held for six hours', async () => {
    const repo = fakeRepo({
      enabledAgentCooperatives: jest.fn(async () => ['TC']),
      heartbeatLastSeen: jest.fn(async () => new Date(NOW.getTime() - 20 * 60_000)),
      healthRecentlyQueued: jest.fn(async () => true),
    })
    await notifierWith(repo).runHealthChecks()
    expect(repo.enqueue).not.toHaveBeenCalled()
    expect(repo.heartbeatLastSeen).toHaveBeenCalledWith('agent:TC')
  })
})
