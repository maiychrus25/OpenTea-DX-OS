// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import {
  TelegramUpdateHandler,
  type TelegramUpdateHandlerDeps,
  type TelegramUpdateInput,
} from '@/application/telegram/TelegramUpdateHandler'
import { TELEGRAM_TEXT } from '@/application/telegram/messages'
import type { Campaign, CampaignItem, CampaignStatus } from '@/domain/agent/campaign'
import type { Proposal } from '@/domain/agent/proposal'
import { signCallbackData } from '@/domain/telegram/callback-data'
import { hashLinkCode } from '@/domain/telegram/link-code'
import type { LiveRoleReader, LiveUserState } from '@/domain/telegram/ports/LiveRoleReader'
import type { LinkCodeRecord, TelegramLink, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'

const KEY = 'test-callback-key'
const NOW = new Date('2026-11-24T10:00:00Z')
const PROPOSAL_ID = '00000000-0000-4000-8000-000000000001'
const MANAGER = 'user-manager-1'
const TG_MANAGER = 5001
const TG_MANAGER_CHAT = 5001

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: PROPOSAL_ID,
    htxCode: 'TC',
    runId: null,
    agent: 'journal-review',
    kind: 'journal.approve',
    payload: { entry_ids: ['e1'] },
    reasonVi: 'Nhật ký đủ dữ liệu.',
    evidence: { rows: [], sha256: 'x' },
    confidence: null,
    risk: 'medium',
    status: 'proposed',
    origin: 'agent',
    requestedBy: null,
    dedupeKey: 'k',
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 3600_000),
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionChannel: null,
    decisionNote: null,
    editedPayload: null,
    executedAt: null,
    result: null,
    ...overrides,
  }
}

const CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000c1'

function campaign(status: CampaignStatus): Campaign {
  return {
    id: CAMPAIGN_ID, htxCode: 'TC', day: '2026-11-27', status, goals: [], summaryVi: 'Tóm tắt.', runId: null,
    decidedBy: null, decidedByName: null, decidedAt: null, telegramSent: false, createdAt: NOW,
  }
}

interface FakeLink extends TelegramLink {
  active: boolean
}

function fakeRepo() {
  const links: FakeLink[] = []
  const codes = new Map<string, LinkCodeRecord & { expiresAt: Date; used: boolean }>()
  const conversations = new Map<string, { kind: 'reject_reason'; proposalId: string | null; expiresAt: Date }>()
  const seen = new Set<string>()

  const repo = {
    links,
    conversations,
    markUpdateSeen: jest.fn(async (id: string) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }),
    forgetUpdate: jest.fn(async (id: string) => {
      seen.delete(id)
    }),
    createCode(hash: string, record: LinkCodeRecord, expiresAt: Date) {
      codes.set(hash, { ...record, expiresAt, used: false })
    },
    consumeLinkCode: jest.fn(async (hash: string, now: Date) => {
      const code = codes.get(hash)
      if (!code || code.used || code.expiresAt <= now) return null
      code.used = true
      return { kind: code.kind, userId: code.userId, userName: code.userName, role: code.role, htxCode: code.htxCode }
    }),
    replaceUserLink: jest.fn(async (link: Omit<TelegramLink, 'id' | 'linkedAt' | 'kind'>) => {
      for (const existing of links) {
        if (existing.kind === 'user' && existing.active && (existing.telegramUserId === link.telegramUserId || existing.userId === link.userId)) {
          existing.active = false
        }
      }
      links.push({ ...link, id: `l${links.length}`, kind: 'user', linkedAt: NOW, active: true } as FakeLink)
    }),
    activeUserLinkByTelegramUser: jest.fn(async (telegramUserId: string) =>
      links.find((l) => l.kind === 'user' && l.active && l.telegramUserId === telegramUserId) ?? null
    ),
    unlinkUser: jest.fn(async ({ telegramUserId }: { telegramUserId?: string }) => {
      let count = 0
      for (const l of links) {
        if (l.kind === 'user' && l.active && l.telegramUserId === telegramUserId) {
          l.active = false
          count += 1
        }
      }
      return count
    }),
    replaceGroupLink: jest.fn(async (link: { htxCode: string; chatId: string }) => {
      links.push({
        id: `g${links.length}`, kind: 'group', userId: null, userName: null, role: null,
        htxCode: link.htxCode, telegramUserId: null, chatId: link.chatId, linkedAt: NOW, active: true,
      } as FakeLink)
    }),
    setConversation: jest.fn(async (c: { telegramUserId: string; proposalId: string; expiresAt: Date }) => {
      conversations.set(c.telegramUserId, { kind: 'reject_reason', proposalId: c.proposalId, expiresAt: c.expiresAt })
    }),
    activeConversation: jest.fn(async (telegramUserId: string, now: Date) => {
      const c = conversations.get(telegramUserId)
      return c && c.expiresAt > now ? { telegramUserId, ...c } : null
    }),
    deleteConversation: jest.fn(async (telegramUserId: string) => {
      conversations.delete(telegramUserId)
    }),
    conversationOf: jest.fn(async (telegramUserId: string) => {
      const c = conversations.get(telegramUserId)
      return c ? { telegramUserId, ...c } : null
    }),
    setFlow: jest.fn(async () => undefined),
    auditEvent: jest.fn(async () => undefined),
    countRecentUpdates: jest.fn(async () => 0),
    heartbeatLastSeen: jest.fn(async () => null),
  }
  return repo
}

function build(options: {
  liveRoles?: Record<string, LiveUserState | null>
  outcome?: unknown
  proposalState?: Proposal | null
  campaignStatus?: CampaignStatus
  campaignItems?: CampaignItem[]
} = {}) {
  const repo = fakeRepo()
  const current = { value: options.proposalState === undefined ? proposal() : options.proposalState }
  const proposalMessages = jest.fn(async (_htxCode: string, _ids: string[]) => [] as { text: string; buttons: never[] }[])
  const campaignRecord = campaign(options.campaignStatus ?? 'draft')
  const campaigns = {
    repo: {
      findById: jest.fn(async (htxCode: string, id: string) => (htxCode === 'TC' && id === CAMPAIGN_ID ? campaignRecord : null)),
      findForDay: jest.fn(async () => campaignRecord),
      items: jest.fn(async () => options.campaignItems ?? []),
    },
    approve: { execute: jest.fn(async () => ({ executed: 2, waitingHigh: 1, forwarded: 0, failed: 0, alreadyDecided: 0 })) },
    drop: { execute: jest.fn(async () => undefined) },
    message: jest.fn(async () => ({ text: 'Chiến dịch ngày 27/11: 2 việc', buttons: [[{ text: 'Duyệt cả chiến dịch', callback_data: 'x' }]] })),
  }
  const roles: LiveRoleReader = {
    read: jest.fn(async (userId: string) => (options.liveRoles ?? { [MANAGER]: { roles: ['manager'], enabled: true, htxCode: 'TC' } })[userId] ?? null),
  }
  const decide = jest.fn(async () => options.outcome ?? { outcome: 'executed', result: { approved_count: 1 } })
  const notifier = { syncDecision: jest.fn(async () => undefined) }
  const handler = new TelegramUpdateHandler({
    repo: repo as unknown as TelegramRepository,
    proposals: {
      findById: jest.fn(async (htx: string, id: string) => (current.value && current.value.htxCode === htx && current.value.id === id ? current.value : null)),
    },
    roles,
    notifier,
    decide: decide as unknown as TelegramUpdateHandlerDeps['decide'],
    htxProfileId: async () => 'htx-profile-1',
    callbackKey: KEY,
    campaigns: campaigns as unknown as TelegramUpdateHandlerDeps['campaigns'],
    chat: {
      tools: [],
      actions: [],
      photos: { put: jest.fn(async () => undefined), get: jest.fn(async () => Buffer.alloc(0)) },
      requests: { create: jest.fn(async () => 'req-1') } as never,
      householdId: async () => null,
      proposalMessages: proposalMessages,
    },
    now: () => NOW,
  })
  return { handler, repo, decide, notifier, current, campaigns, roles, proposalMessages }
}

let updateId = 1000
const nextId = () => ++updateId

function callback(data: string, chatType = 'private', fromId = TG_MANAGER): TelegramUpdateInput {
  return {
    update_id: nextId(),
    callback_query: {
      id: 'cb1',
      from: { id: fromId },
      message: { message_id: 1, chat: { id: TG_MANAGER_CHAT, type: chatType } },
      data,
    },
  }
}

function text(value: string, chatType = 'private', chatId = TG_MANAGER_CHAT, fromId = TG_MANAGER): TelegramUpdateInput {
  return { update_id: nextId(), message: { chat: { id: chatId, type: chatType }, from: { id: fromId }, text: value } }
}

async function linkManager(handler: TelegramUpdateHandler, repo: ReturnType<typeof fakeRepo>) {
  const code = 'abc-LINK-code'
  repo.createCode(hashLinkCode(code), { kind: 'user', userId: MANAGER, userName: 'Quản lý', role: 'manager', htxCode: 'TC' }, new Date(NOW.getTime() + 600_000))
  const res = await handler.handle(text(`/start ${code}`))
  expect(res.replies[0].text).toBe(TELEGRAM_TEXT.welcome('Quản lý'))
}

const approveData = signCallbackData(KEY, PROPOSAL_ID, 'a')
const rejectData = signCallbackData(KEY, PROPOSAL_ID, 'r')

describe('TelegramUpdateHandler', () => {
  beforeEach(() => {
    updateId = 1000
  })

  test('an approver approves from a private chat: decision runs once through the web use case and the messages sync', async () => {
    const { handler, repo, decide, notifier } = build()
    await linkManager(handler, repo)

    const res = await handler.handle(callback(approveData))

    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.executed, show_alert: false })
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: PROPOSAL_ID,
        decision: 'approve',
        channel: 'telegram',
        tenant: { userId: MANAGER, role: 'manager', htxCode: 'TC', htxProfileId: 'htx-profile-1' },
      })
    )
    expect(notifier.syncDecision).toHaveBeenCalledWith('TC', PROPOSAL_ID)
  })

  test('a repeated update_id does nothing the second time', async () => {
    const { handler, repo, decide } = build()
    await linkManager(handler, repo)
    const update = callback(approveData)
    await handler.handle(update)
    const again = await handler.handle(update)
    expect(again).toEqual({ replies: [] })
    expect(decide).toHaveBeenCalledTimes(1)
  })

  test('a tampered callback_data is refused and nothing executes', async () => {
    const { handler, repo, decide } = build()
    await linkManager(handler, repo)
    const forged = approveData.slice(0, -1) + (approveData.endsWith('A') ? 'B' : 'A')

    const res = await handler.handle(callback(forged))

    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.invalidButton, show_alert: true })
    expect(decide).not.toHaveBeenCalled()
  })

  test('a callback from a group chat is refused even with a valid signature', async () => {
    const { handler, repo, decide } = build()
    await linkManager(handler, repo)

    const res = await handler.handle(callback(approveData, 'group'))

    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.groupCallback)
    expect(decide).not.toHaveBeenCalled()
  })

  test('a Telegram account that is not linked is refused', async () => {
    const { handler, decide } = build()
    const res = await handler.handle(callback(approveData, 'private', 9999))
    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.notLinked)
    expect(decide).not.toHaveBeenCalled()
  })

  test('an approver whose role was removed is refused at tap time, even with an old link', async () => {
    const liveRoles = { [MANAGER]: { roles: ['farmer'], enabled: true, htxCode: 'TC' } }
    const { handler, repo, decide } = build({ liveRoles })
    await linkManager(handler, repo)

    const res = await handler.handle(callback(approveData))

    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.noLongerApprover, show_alert: true })
    expect(decide).not.toHaveBeenCalled()
  })

  test('a disabled account is refused', async () => {
    const liveRoles = { [MANAGER]: { roles: ['manager'], enabled: false, htxCode: 'TC' } }
    const { handler, repo, decide } = build({ liveRoles })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(approveData))
    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.noLongerApprover)
    expect(decide).not.toHaveBeenCalled()
  })

  test('an account moved to another cooperative is refused', async () => {
    const liveRoles = { [MANAGER]: { roles: ['manager'], enabled: true, htxCode: 'LB' } }
    const { handler, repo, decide } = build({ liveRoles })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(approveData))
    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.noLongerApprover)
    expect(decide).not.toHaveBeenCalled()
  })

  test('a proposal of another cooperative is refused', async () => {
    const { handler, repo, decide } = build({ proposalState: proposal({ htxCode: 'LB' }) })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(approveData))
    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.otherCooperative)
    expect(decide).not.toHaveBeenCalled()
  })

  test('a decided proposal answers with who decided it and does not sync again', async () => {
    const { handler, repo, notifier } = build({ outcome: { outcome: 'already_decided', by: 'Anh An', at: NOW, status: 'executed' } })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(approveData))
    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.alreadyDecided('Anh An'))
    expect(notifier.syncDecision).not.toHaveBeenCalled()
  })

  test('reject asks for a reason, the next private text is the reason, and it goes through the same decision', async () => {
    const { handler, repo, decide, notifier } = build()
    await linkManager(handler, repo)

    const prompt = await handler.handle(callback(rejectData))
    expect(prompt.replies[0].text).toBe(TELEGRAM_TEXT.rejectPrompt)
    expect(decide).not.toHaveBeenCalled()

    decide.mockResolvedValueOnce({ outcome: 'rejected' })
    const res = await handler.handle(text('Thiếu ảnh chụp'))
    expect(res.replies[0].text).toBe(TELEGRAM_TEXT.rejected)
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ decision: 'reject', note: 'Thiếu ảnh chụp', channel: 'telegram' }))
    expect(notifier.syncDecision).toHaveBeenCalledWith('TC', PROPOSAL_ID)
    expect(repo.conversations.size).toBe(0)
  })

  test('/huy cancels the reject conversation, and free text without one goes to the assistant', async () => {
    const { handler, repo, decide } = build()
    await linkManager(handler, repo)
    await handler.handle(callback(rejectData))

    const cancelled = await handler.handle(text('/huy'))
    expect(cancelled.replies[0].text).toBe(TELEGRAM_TEXT.rejectCancelled)

    // Linked text that is not a reject reason goes to the chat engine (M5). With no agent heartbeat the answer is
    // notUnderstood with the menu, never a silent drop.
    const ignored = await handler.handle(text('xin chào'))
    expect(ignored.replies[0].text).toBe(TELEGRAM_TEXT.notUnderstood)
    expect(ignored.replies[0].buttons!.length).toBeGreaterThan(0)
    expect(decide).not.toHaveBeenCalled()
  })

  test('a link code works once, and an expired code is refused', async () => {
    const { handler, repo } = build()
    const code = 'once-only-code'
    repo.createCode(hashLinkCode(code), { kind: 'user', userId: MANAGER, userName: 'Quản lý', role: 'manager', htxCode: 'TC' }, new Date(NOW.getTime() + 600_000))
    const expiredCode = 'too-late-code'
    repo.createCode(hashLinkCode(expiredCode), { kind: 'user', userId: 'u2', userName: 'Khác', role: 'officer', htxCode: 'TC' }, new Date(NOW.getTime() - 1))

    expect((await handler.handle(text(`/start ${code}`))).replies[0].text).toBe(TELEGRAM_TEXT.welcome('Quản lý'))
    expect((await handler.handle(text(`/start ${code}`, 'private', 7002, 7002))).replies[0].text).toBe(TELEGRAM_TEXT.invalidCode)
    expect((await handler.handle(text(`/start ${expiredCode}`, 'private', 7003, 7003))).replies[0].text).toBe(TELEGRAM_TEXT.invalidCode)
  })

  test('/stop unlinks, and the old button stops working', async () => {
    const { handler, repo, decide } = build()
    await linkManager(handler, repo)
    const stopped = await handler.handle(text('/stop'))
    expect(stopped.replies[0].text).toBe(TELEGRAM_TEXT.unlinked)

    const res = await handler.handle(callback(approveData))
    expect(res.answer_callback?.text).toBe(TELEGRAM_TEXT.notLinked)
    expect(decide).not.toHaveBeenCalled()
  })

  test('/nhom links a group chat only from a group, and a private /nhom is ignored', async () => {
    const { handler, repo } = build()
    repo.createCode(hashLinkCode('group-code-1'), { kind: 'group', userId: MANAGER, userName: null, role: 'manager', htxCode: 'TC' }, new Date(NOW.getTime() + 600_000))
    expect(await handler.handle(text('/nhom group-code-1'))).toEqual({ replies: [] })
    const linked = await handler.handle(text('/nhom group-code-1', 'supergroup', -100123))
    expect(linked.replies[0].text).toBe(TELEGRAM_TEXT.groupLinked)
    expect(repo.links.find((l) => l.kind === 'group')?.chatId).toBe('-100123')
  })

  test('a failure while handling is forgotten so the relay can retry it', async () => {
    const { handler, repo } = build()
    repo.consumeLinkCode.mockRejectedValueOnce(new Error('db down'))
    const update = text('/start x')
    await expect(handler.handle(update)).rejects.toThrow('db down')
    expect(repo.markUpdateSeen).toHaveBeenCalledTimes(1)
    expect(repo.forgetUpdate).toHaveBeenCalledWith(String(update.update_id))
  })
})

describe('campaign messages (M7, contract C6)', () => {
  beforeEach(() => {
    updateId = 1000
  })

  const campaignData = (op: 'A' | 'L' | 'D') => signCallbackData(KEY, CAMPAIGN_ID, op)
  const openItem = (n: number, status: CampaignItem['proposalStatus']): CampaignItem => ({
    campaignId: CAMPAIGN_ID,
    proposalId: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    position: n,
    goalKey: 'internal_notice',
    target: 1,
    kind: 'notification.internal',
    risk: 'low',
    proposalStatus: status,
  })

  test('/chiendich sends the day campaign with its buttons to a manager', async () => {
    const { handler, repo, campaigns } = build()
    await linkManager(handler, repo)
    const res = await handler.handle(text('/chiendich'))

    expect(campaigns.repo.findForDay).toHaveBeenCalledWith('TC', '2026-11-24')
    expect(res.replies).toEqual([
      { op: 'send', chat_id: TG_MANAGER_CHAT, text: 'Chiến dịch ngày 27/11: 2 việc', buttons: [[{ text: 'Duyệt cả chiến dịch', callback_data: 'x' }]] },
    ])
  })

  test('/chiendich without a campaign today says so', async () => {
    const { handler, repo, campaigns } = build()
    campaigns.repo.findForDay.mockResolvedValueOnce(null as never)
    await linkManager(handler, repo)
    const res = await handler.handle(text('/chiendich'))
    expect(res.replies).toEqual([{ op: 'send', chat_id: TG_MANAGER_CHAT, text: TELEGRAM_TEXT.noCampaignToday }])
  })

  test('/chiendich is not for a farmer', async () => {
    const liveRoles = { [MANAGER]: { roles: ['farmer'], enabled: true, htxCode: 'TC' } }
    const { handler, repo, campaigns } = build({ liveRoles })
    await linkManager(handler, repo)
    const res = await handler.handle(text('/chiendich'))
    expect(res.replies).toEqual([{ op: 'send', chat_id: TG_MANAGER_CHAT, text: TELEGRAM_TEXT.noCampaignToday }])
    expect(campaigns.message).not.toHaveBeenCalled()
  })

  test('A approves all as the manager and edits the message to the result line, without buttons', async () => {
    const { handler, repo, campaigns } = build()
    await linkManager(handler, repo)
    const res = await handler.handle(callback(campaignData('A')))

    expect(campaigns.approve.execute).toHaveBeenCalledWith(CAMPAIGN_ID, expect.objectContaining({ role: 'manager', htxCode: 'TC' }), 'Quản lý', 'telegram', NOW)
    expect(res.replies).toEqual([
      {
        op: 'edit', chat_id: TG_MANAGER_CHAT, edit_message_id: 1,
        text: 'Đã duyệt chiến dịch: 2 việc đã chạy, 1 việc chờ xác nhận riêng, 0 việc chuyển người đủ quyền.',
      },
    ])
    expect(res.replies[0]).not.toHaveProperty('buttons')
  })

  test('A adds the failed count to the result line', async () => {
    const { handler, repo, campaigns } = build()
    campaigns.approve.execute.mockResolvedValueOnce({ executed: 1, waitingHigh: 0, forwarded: 0, failed: 2, alreadyDecided: 0 })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(campaignData('A')))
    expect(res.replies[0]).toMatchObject({
      text: 'Đã duyệt chiến dịch: 1 việc đã chạy, 0 việc chờ xác nhận riêng, 0 việc chuyển người đủ quyền. 2 việc lỗi.',
    })
  })

  test('L sends each undecided item with its own approve and reject buttons', async () => {
    const { handler, repo, campaigns, proposalMessages } = build({ campaignItems: [openItem(1, 'proposed'), openItem(2, 'executed')] })
    proposalMessages.mockResolvedValueOnce([{ text: 'Đề xuất một', buttons: [] }])
    await linkManager(handler, repo)
    const res = await handler.handle(callback(campaignData('L')))

    expect(campaigns.repo.items).toHaveBeenCalledWith('TC', CAMPAIGN_ID)
    expect(proposalMessages).toHaveBeenCalledWith('TC', [openItem(1, 'proposed').proposalId])
    expect(res.replies).toEqual([{ op: 'send', chat_id: TG_MANAGER_CHAT, text: 'Đề xuất một', buttons: [] }])
  })

  test('L with nothing open says so', async () => {
    const { handler, repo } = build({ campaignItems: [openItem(1, 'executed')] })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(campaignData('L')))
    expect(res.replies).toEqual([])
    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.campaignNoOpenItems, show_alert: false })
  })

  test('D drops the campaign and edits the message to the dropped line', async () => {
    const { handler, repo, campaigns } = build()
    await linkManager(handler, repo)
    const res = await handler.handle(callback(campaignData('D')))

    expect(campaigns.drop.execute).toHaveBeenCalledWith(CAMPAIGN_ID, expect.objectContaining({ role: 'manager' }), 'Quản lý')
    expect(res.replies).toEqual([{ op: 'edit', chat_id: TG_MANAGER_CHAT, edit_message_id: 1, text: TELEGRAM_TEXT.campaignDropped }])
  })

  test('a press on a campaign that is no longer open answers that it is done', async () => {
    const { handler, repo, campaigns } = build({ campaignStatus: 'dropped' })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(campaignData('A')))
    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.campaignDone, show_alert: false })
    expect(campaigns.approve.execute).not.toHaveBeenCalled()
  })

  test('a farmer pressing approve all is refused', async () => {
    const liveRoles = { [MANAGER]: { roles: ['farmer'], enabled: true, htxCode: 'TC' } }
    const { handler, repo, campaigns } = build({ liveRoles })
    await linkManager(handler, repo)
    const res = await handler.handle(callback(campaignData('A')))
    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.campaignNotAllowed, show_alert: true })
    expect(campaigns.approve.execute).not.toHaveBeenCalled()
  })

  test('a v1 approve press carrying a campaign id is refused (the proposal lookup fails)', async () => {
    const { handler, repo, decide } = build()
    await linkManager(handler, repo)
    const res = await handler.handle(callback(signCallbackData(KEY, CAMPAIGN_ID, 'a')))
    expect(res.answer_callback).toEqual({ text: TELEGRAM_TEXT.otherCooperative, show_alert: true })
    expect(decide).not.toHaveBeenCalled()
  })
})
