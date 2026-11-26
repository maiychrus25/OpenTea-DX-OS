// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import {
  TelegramUpdateHandler,
  type AutopilotServices,
  type TelegramUpdateHandlerDeps,
  type TelegramUpdateInput,
} from '@/application/telegram/TelegramUpdateHandler'
import { TelegramNotifier } from '@/application/telegram/TelegramNotifier'
import { autopilotStatusText, autopilotStoppedText, campaignText, proposalResultText, reportText, TELEGRAM_TEXT } from '@/application/telegram/messages'
import type { Proposal } from '@/domain/agent/proposal'
import type { BlockOutcome } from '@/domain/agent/ports/AutopilotRepository'
import { disabledConfig } from '@/domain/agent/autopilot'
import type { Campaign, CampaignItem } from '@/domain/agent/campaign'
import { signCallbackData, verifyCallbackData } from '@/domain/telegram/callback-data'
import type { LiveRoleReader, LiveUserState } from '@/domain/telegram/ports/LiveRoleReader'
import type { TelegramLink, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'

const KEY = 'autopilot-callback-key'
const NOW = new Date('2026-11-27T05:00:00.000Z') // 12:00 in Vietnam
const ID = '00000000-0000-4000-8000-0000000000a1'
const TG_MANAGER = 7001
const TG_OFFICER = 7002
const TG_FARMER = 7003

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: ID, htxCode: 'TC', runId: null, agent: 'journal-review', kind: 'notification.households',
    payload: { template: 'dry_soil', slots: { parcel_codes: ['P1'], value_pct: 20, threshold_pct: 35 }, subjects: ['P1'] },
    reasonVi: 'Đất khô.', evidence: { rows: [], sha256: 'x' }, confidence: null, risk: 'medium', status: 'proposed',
    origin: 'agent', requestedBy: null, dedupeKey: 'k', createdAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 3_600_000), decidedBy: null, decidedByName: null, decidedAt: null,
    decisionChannel: null, decisionNote: null, editedPayload: null, executedAt: null, result: null, ...over,
  }
}

function link(telegramUserId: number, userId: string, role: string): TelegramLink {
  return { id: `l${telegramUserId}`, kind: 'user', userId, userName: userId, role, htxCode: 'TC', telegramUserId: String(telegramUserId), chatId: String(telegramUserId), linkedAt: NOW }
}

const LIVE: Record<string, LiveUserState> = {
  mgr: { roles: ['manager'], enabled: true, htxCode: 'TC' },
  off: { roles: ['officer'], enabled: true, htxCode: 'TC' },
  far: { roles: ['farmer'], enabled: true, htxCode: 'TC' },
}

function build(current: Proposal | null = proposal()) {
  const links = [link(TG_MANAGER, 'mgr', 'manager'), link(TG_OFFICER, 'off', 'officer'), link(TG_FARMER, 'far', 'farmer')]
  const seen = new Set<string>()
  const repo = {
    markUpdateSeen: jest.fn(async (id: string) => (seen.has(id) ? false : (seen.add(id), true))),
    forgetUpdate: jest.fn(),
    activeUserLinkByTelegramUser: jest.fn(async (id: string) => links.find((l) => l.telegramUserId === id) ?? null),
    countRecentUpdates: jest.fn(async () => 0),
    activeConversation: jest.fn(async () => null),
  }
  const autopilot: jest.Mocked<AutopilotServices> = {
    block: jest.fn(async (): Promise<BlockOutcome> => 'blocked'),
    stop: jest.fn(async () => ({ returned: 3 })),
    status: jest.fn(async () => ({ enabled: true, enabledByName: 'Lan', pending: 2, ran: 5, blocked: 1, dailyCap: 50 })),
    touchManagerActivity: jest.fn(async () => undefined),
  }
  const proposalMessages = jest.fn(async () => [{ text: 'Đề xuất: Thông báo nông hộ', buttons: [[{ text: 'Duyệt', callback_data: 'a' }]] }])
  const roles: LiveRoleReader = { read: jest.fn(async (id: string) => LIVE[id] ?? null) }
  const handler = new TelegramUpdateHandler({
    repo: repo as unknown as TelegramRepository,
    proposals: { findById: jest.fn(async (htx: string, id: string) => (current && current.htxCode === htx && current.id === id ? current : null)) },
    roles,
    notifier: { syncDecision: jest.fn(async () => undefined) },
    decide: jest.fn() as unknown as TelegramUpdateHandlerDeps['decide'],
    htxProfileId: async () => 'profile',
    callbackKey: KEY,
    chat: { tools: [], actions: [], photos: {} as never, requests: {} as never, householdId: async () => null, proposalMessages },
    campaigns: {} as never,
    autopilot,
    now: () => NOW,
  })
  return { handler, autopilot, proposalMessages }
}

let updateId = 5000
function press(op: 'b' | 'v', from = TG_MANAGER, chatType = 'private'): TelegramUpdateInput {
  return {
    update_id: ++updateId,
    callback_query: { id: 'cb', from: { id: from }, message: { message_id: 77, chat: { id: from, type: chatType } }, data: signCallbackData(KEY, ID, op) },
  }
}
function say(text: string, from = TG_MANAGER): TelegramUpdateInput {
  return { update_id: ++updateId, message: { chat: { id: from, type: 'private' }, from: { id: from }, text } }
}

describe('Chặn and Xem (C5)', () => {
  test('Chặn before the run blocks it, edits the message to the normal one and counts as manager activity', async () => {
    const { handler, autopilot, proposalMessages } = build()
    const res = await handler.handle(press('b'))
    expect(autopilot.block).toHaveBeenCalledWith('TC', ID, 'mgr')
    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.autopilotBlocked, show_alert: false })
    expect(res.replies).toEqual([
      { op: 'edit', chat_id: TG_MANAGER, edit_message_id: 77, text: 'Đề xuất: Thông báo nông hộ', buttons: [[{ text: 'Duyệt', callback_data: 'a' }]] },
    ])
    expect(proposalMessages).toHaveBeenCalledWith('TC', [ID])
    expect(autopilot.touchManagerActivity).toHaveBeenCalled()
  })

  test('block after run answers already ran (test 20)', async () => {
    const { handler, autopilot } = build()
    autopilot.block.mockResolvedValueOnce('already_ran')
    const res = await handler.handle(press('b'))
    expect(res.answer_callback).toEqual({ text: 'Đã chạy, không chặn được nữa.', show_alert: true })
    expect(res.replies).toEqual([])
  })

  test('a proposal without a window, or one that does not exist, is answered plainly', async () => {
    const first = build()
    first.autopilot.block.mockResolvedValueOnce('not_scheduled')
    expect((await first.handler.handle(press('b'))).answer_callback?.text).toBe(TELEGRAM_TEXT.autopilotNotScheduled)
    const second = build(null)
    expect((await second.handler.handle(press('b'))).answer_callback?.text).toBe(TELEGRAM_TEXT.otherCooperative)
    expect(second.autopilot.block).not.toHaveBeenCalled()
  })

  test('a user who is no longer an approver of the kind cannot block', async () => {
    const { handler, autopilot } = build()
    const res = await handler.handle(press('b', TG_OFFICER)) // notification.households is manager-only
    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.noLongerApprover, show_alert: true })
    expect(autopilot.block).not.toHaveBeenCalled()
  })

  test('Chặn in a group chat is refused', async () => {
    const { handler, autopilot } = build()
    expect((await handler.handle(press('b', TG_MANAGER, 'group'))).answer_callback?.show_alert).toBe(true)
    expect(autopilot.block).not.toHaveBeenCalled()
  })

  test('Xem sends the normal proposal message and blocks nothing', async () => {
    const { handler, autopilot } = build()
    const res = await handler.handle(press('v'))
    expect(res.replies).toEqual([{ op: 'send', chat_id: TG_MANAGER, text: 'Đề xuất: Thông báo nông hộ', buttons: [[{ text: 'Duyệt', callback_data: 'a' }]] }])
    expect(autopilot.block).not.toHaveBeenCalled()
  })

  test('Xem on a proposal that already ran says who handled it', async () => {
    const { handler } = build(proposal({ status: 'executed', decidedByName: 'AI tự thực hiện (bật bởi Lan)' }))
    const res = await handler.handle(press('v'))
    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.alreadyDecided('AI tự thực hiện (bật bởi Lan)'))
  })
})

describe('/dung and /tuvanhanh (C5)', () => {
  test('/dung by an officer stops the mode and says the windows went back (test 21)', async () => {
    const { handler, autopilot } = build()
    const res = await handler.handle(say('/dung', TG_OFFICER))
    expect(autopilot.stop).toHaveBeenCalledWith('TC', 'off')
    expect(res.replies[0]).toMatchObject({ op: 'send', chat_id: TG_OFFICER, text: 'Đã dừng tự vận hành. Các việc đang chờ chuyển về chờ duyệt.' })
  })

  test('/dung by a manager stops it too and marks activity', async () => {
    const { handler, autopilot } = build()
    expect((await handler.handle(say('/dung'))).replies[0]).toMatchObject({ text: TELEGRAM_TEXT.autopilotStopped })
    expect(autopilot.stop).toHaveBeenCalledWith('TC', 'mgr')
    expect(autopilot.touchManagerActivity).toHaveBeenCalled()
  })

  test('with the mode already off it says so', async () => {
    const { handler, autopilot } = build()
    autopilot.stop.mockResolvedValueOnce(null)
    expect((await handler.handle(say('/dung'))).replies[0]).toMatchObject({ text: 'Tự vận hành đang tắt.' })
  })

  test('a farmer cannot stop it, and /dung@bot works like /dung', async () => {
    const { handler, autopilot } = build()
    expect((await handler.handle(say('/dung', TG_FARMER))).replies[0]).toMatchObject({ text: TELEGRAM_TEXT.autopilotNotAllowed })
    expect(autopilot.stop).not.toHaveBeenCalled()
    await handler.handle(say('/dung@OpenTeaBot'))
    expect(autopilot.stop).toHaveBeenCalledTimes(1)
  })

  test('/tuvanhanh shows the status and today\'s counts', async () => {
    const { handler } = build()
    const text = (await handler.handle(say('/tuvanhanh'))).replies[0]
    expect(text).toMatchObject({ op: 'send' })
    expect((text as { text: string }).text).toBe(
      ['Tự vận hành đang bật (bởi Lan).', 'Hôm nay: 5/50 việc đã tự chạy, 1 bị chặn, 2 việc đang chờ giờ chạy.', 'Gửi /dung để dừng ngay.'].join('\n')
    )
    expect(autopilotStatusText({ enabled: false, enabledByName: null, pending: 0, ran: 0, blocked: 0, dailyCap: 50 })).toBe('Tự vận hành đang tắt.')
  })

  test('a plain message from an officer does not count as manager activity', async () => {
    const { handler, autopilot } = build()
    await handler.handle(say('/dung', TG_OFFICER))
    expect(autopilot.touchManagerActivity).not.toHaveBeenCalled()
  })
})

describe('messages of the mode (C5)', () => {
  const env = { ...process.env }
  beforeEach(() => { process.env = { ...env, DXOS_TELEGRAM_CALLBACK_KEY: KEY } })
  afterEach(() => { process.env = env })

  function notifierWith(extra: Record<string, unknown> = {}, links: { chatId: string }[] = [{ chatId: '42' }]) {
    const enqueue = jest.fn(async (_rows: any[]) => undefined)
    const repo = {
      userLinkRecipients: jest.fn(async () => links),
      groupLinkRecipients: jest.fn(async () => []),
      insertReportIfNew: jest.fn(async () => true),
      proposalCounts: jest.fn(async () => ({ open: 1, decided: 2 })),
      enqueue,
      proposalSends: jest.fn(async () => []),
    } as unknown as TelegramRepository
    const notifier = new TelegramNotifier({ repo, proposals: { findById: jest.fn() } as never, labelsFor: async () => new Map(), now: () => NOW, ...extra } as never)
    return { notifier, enqueue, repo }
  }

  test('a proposal with a window gets Sẽ tự chạy lúc… with Chặn and Xem', async () => {
    const { notifier, enqueue } = notifierWith()
    const runAt = new Date(NOW.getTime() + 15 * 60_000) // 12:15 in Vietnam
    await notifier.enqueueProposal(proposal({ runAt }))
    const row = enqueue.mock.calls[0][0][0]
    expect(row.text).toMatch(/^Sẽ tự chạy lúc 12:15: Thông báo nông hộ — /)
    expect(row.buttons[0].map((b: { text: string }) => b.text)).toEqual(['Chặn', 'Xem'])
    expect(row.buttons[0].map((b: { callback_data: string }) => verifyCallbackData(KEY, b.callback_data))).toEqual([
      { proposalId: ID, op: 'b' },
      { proposalId: ID, op: 'v' },
    ])
    expect(row).toMatchObject({ purpose: 'proposal', proposalId: ID })
  })

  test('a proposal without a window, or with a zero window, keeps Duyệt and Từ chối', async () => {
    const { notifier, enqueue } = notifierWith()
    await notifier.enqueueProposal(proposal())
    await notifier.enqueueProposal(proposal({ runAt: new Date(NOW.getTime() - 60_000) })) // run_at at creation time: next tick
    for (const call of enqueue.mock.calls) {
      expect(call[0][0].buttons[0].map((b: { text: string }) => b.text)).toEqual(['Duyệt', 'Từ chối'])
    }
  })

  test('the message is edited after the run to AI đã tự thực hiện lúc <HH:mm>.', () => {
    const at = new Date(NOW.getTime() + 60_000)
    expect(proposalResultText(proposal({ status: 'executed', decisionChannel: 'autopilot', decidedAt: at, decidedByName: 'AI tự thực hiện (bật bởi Lan)' }))).toBe(
      'AI đã tự thực hiện lúc 12:01.'
    )
    expect(proposalResultText(proposal({ status: 'failed', decisionChannel: 'autopilot', decidedAt: at }))).toBe('AI đã tự thực hiện lúc 12:01, thực hiện lỗi.')
    // A person's decision keeps its old wording.
    expect(proposalResultText(proposal({ status: 'executed', decisionChannel: 'web', decidedAt: at, decidedByName: 'Lan' }))).toBe('Đã được Lan duyệt lúc 12:01, đã thực hiện.')
  })

  test('a stop is sent to every linked manager and officer, with the reason and the returned windows', async () => {
    const { notifier, enqueue, repo } = notifierWith({}, [{ chatId: '1' }, { chatId: '2' }])
    await notifier.enqueueAutopilotStopped('TC', 'brake_failures', 3, 50)
    expect(repo.userLinkRecipients).toHaveBeenCalledWith('TC', ['manager', 'officer'])
    expect(enqueue.mock.calls[0][0].map((r: { chatId: string }) => r.chatId)).toEqual(['1', '2'])
    expect(enqueue.mock.calls[0][0][0].text).toBe(autopilotStoppedText('brake_failures', 3, 50))
    expect(autopilotStoppedText('brake_failures', 3, 50)).toContain('3 việc đang chờ đã chuyển về chờ duyệt')
    expect(autopilotStoppedText('brake_cap', 0, 20)).toContain('đủ 20 việc')
  })

  describe('the 06:00 campaign message', () => {
    const campaign: Campaign = {
      id: '00000000-0000-4000-8000-0000000000cc', htxCode: 'TC', day: '2026-11-27', status: 'draft',
      goals: [{ goalKey: 'g', labelVi: 'Nhắc', unitVi: 'tin', target: 1 }], summaryVi: 'Tóm tắt.', runId: null,
      decidedBy: null, decidedByName: null, decidedAt: null, telegramSent: false, createdAt: NOW,
    }
    const items: CampaignItem[] = [
      { campaignId: campaign.id, proposalId: ID, position: 1, goalKey: 'g', target: 1, kind: 'notification.internal', risk: 'low', proposalStatus: 'proposed', runAt: new Date(NOW.getTime() + 15 * 60_000) },
      { campaignId: campaign.id, proposalId: ID.replace('a1', 'a2'), position: 2, goalKey: 'g', target: 1, kind: 'journal.approve', risk: 'medium', proposalStatus: 'proposed', runAt: null },
    ]
    const campaigns = { findById: jest.fn(async () => campaign), items: jest.fn(async () => items) }

    test('starts with Chiến dịch hôm nay sẽ tự chạy and lists the time of each windowed item when the mode is on', async () => {
      const { notifier } = notifierWith({ campaigns, autopilot: { get: async () => ({ ...disabledConfig('TC'), enabled: true }), daySummary: jest.fn() } })
      const message = await notifier.campaignMessage('TC', campaign.id)
      const lines = message!.text.split('\n')
      expect(lines[0]).toBe('Chiến dịch hôm nay sẽ tự chạy')
      expect(lines[1]).toBe('Chiến dịch ngày 27/11: 2 việc')
      expect(lines.find((l) => l.startsWith('1.'))).toMatch(/· tự chạy lúc 12:15$/)
      expect(lines.find((l) => l.startsWith('2.'))).not.toMatch(/tự chạy/)
    })

    test('is unchanged when the mode is off', async () => {
      const { notifier } = notifierWith({ campaigns, autopilot: { get: async () => disabledConfig('TC'), daySummary: jest.fn() } })
      const text = (await notifier.campaignMessage('TC', campaign.id))!.text
      expect(text.split('\n')[0]).toBe('Chiến dịch ngày 27/11: 2 việc')
      expect(text).not.toContain('tự chạy')
      expect(campaignText('2026-11-27', 'x', [{ title: 'A', target: 1, unitVi: 'tin', runAt: NOW }])).not.toContain('tự chạy')
    })
  })

  describe('the 18:00 report', () => {
    const summary = (over: Record<string, unknown> = {}) => ({ wasOn: true, ran: 7, blocked: 2, brakes: 1, costUsd: 0.4567, ...over })

    test('adds the Tự vận hành section when the mode was on during the day', async () => {
      const daySummary = jest.fn(async () => summary())
      const { notifier, enqueue } = notifierWith({ autopilot: { get: jest.fn(), daySummary } })
      await notifier.enqueueReport('TC', 'daily', '2026-11-27', '2026-11-27', { journals_new: 1 })
      const text: string = enqueue.mock.calls[0][0][0].text
      expect(text.split('\n')).toContain('Tự vận hành: 7 việc đã tự chạy, 2 bị chặn, 1 lần phanh, chi phí 0.46 USD')
      expect(daySummary).toHaveBeenCalledWith('TC', new Date('2026-11-27T00:00:00+07:00'), new Date('2026-11-28T00:00:00+07:00'))
    })

    test('adds nothing when the mode was off all day, or on the weekly report', async () => {
      const off = notifierWith({ autopilot: { get: jest.fn(), daySummary: jest.fn(async () => summary({ wasOn: false })) } })
      await off.notifier.enqueueReport('TC', 'daily', '2026-11-27', '2026-11-27', {})
      expect(off.enqueue.mock.calls[0][0][0].text).not.toContain('Tự vận hành')
      const weekly = notifierWith({ autopilot: { get: jest.fn(), daySummary: jest.fn(async () => summary()) } })
      await weekly.notifier.enqueueReport('TC', 'weekly', '2026-11-23', '2026-11-27', {})
      expect(weekly.enqueue.mock.calls[0][0][0].text).not.toContain('Tự vận hành')
    })

    test('keeps the eight-line limit by dropping figure lines, never the autopilot line', () => {
      const lines = reportText('daily', '2026-11-27', '2026-11-27', { journals_new: 1, proposals_open: 1, disease_reports: 1 }, ['a', 'b', 'c', 'd', 'e', 'Tự vận hành: x'])
      expect(lines.split('\n').length).toBeLessThanOrEqual(8)
      expect(lines).toContain('Tự vận hành: x')
    })
  })
})
