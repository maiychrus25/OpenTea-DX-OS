// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppBuildNotifier } from '@/application/appbuilder/AppBuildNotifier'
import { AppRequestIntake } from '@/application/appbuilder/AppRequestIntake'
import { APP_REQUEST_TEXT } from '@/application/appbuilder/messages'
import { routeText } from '@/application/telegram/chat/router'
import { TelegramUpdateHandler, type TelegramUpdateInput } from '@/application/telegram/TelegramUpdateHandler'
import { AppBuildError, type AppBuildRepository, type AppBuildRequest } from '@/domain/appbuilder/app-build'
import type { TelegramConversation, TelegramLink } from '@/domain/telegram/ports/TelegramRepository'

const NOW = new Date('2026-11-26T03:00:00Z')
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

// The frozen feature under test runs only with the labs switch on (ADR 0005).
const previousLabs = process.env.DXOS_LABS
beforeEach(() => {
  process.env.DXOS_LABS = '1'
})
afterEach(() => {
  if (previousLabs === undefined) delete process.env.DXOS_LABS
  else process.env.DXOS_LABS = previousLabs
})

describe('the chat intent app.request', () => {
  it.each(['cần app theo dõi kho phân bón', 'làm app quản lý xe', 'Xây app bán hàng', 'cần phần mềm kế toán'])('routes "%s" to a request', (text) => {
    expect(routeText(text)).toEqual({ kind: 'app_request' })
  })

  it('does not take a sentence about the journal or the weather', () => {
    expect(routeText('thời tiết hôm nay')).toEqual({ kind: 'tool', name: 'weather' })
    expect(routeText('ghi nhật ký')).toEqual({ kind: 'action', name: 'journal.create' })
  })
})

describe('AppRequestIntake', () => {
  const base = { htxCode: 'TC', userId: 'u1', userName: 'An' }
  const repo = (create: jest.Mock) => ({ create, setAnswer: jest.fn(async () => true), cancel: jest.fn(async () => true) }) as unknown as AppBuildRepository

  it('replies that the request was received', async () => {
    const create = jest.fn(async () => ({}) as AppBuildRequest)
    expect(await new AppRequestIntake(repo(create)).submitFromChat(base, ' cần app kho phân bón ')).toBe(APP_REQUEST_TEXT.received)
    expect(create).toHaveBeenCalledWith({ htxCode: 'TC', requestedBy: 'u1', requestedByName: 'An', requestText: 'cần app kho phân bón' })
  })

  it('replies that one request is still open when the slot is taken (test W-1)', async () => {
    const create = jest.fn(async () => { throw new AppBuildError('REQUEST_ACTIVE', 'x') })
    expect(await new AppRequestIntake(repo(create)).submitFromChat(base, 'cần app kho phân bón')).toBe('HTX đang có một yêu cầu xây app chưa xong.')
  })

  it('refuses a text over 500 characters in chat and on the web', async () => {
    const intake = new AppRequestIntake(repo(jest.fn()))
    expect(await intake.submitFromChat(base, 'a'.repeat(501))).toBe(APP_REQUEST_TEXT.tooLong)
    await expect(intake.create(base, 'a'.repeat(501))).rejects.toThrow()
    await expect(intake.create(base, 'abc')).rejects.toThrow()
  })

  it('keeps the conversation when the answer is too long, and ends it when it is stored or closed', async () => {
    const r = repo(jest.fn())
    const intake = new AppRequestIntake(r)
    expect(await intake.answerFromChat('TC', REQUEST_ID, 'a'.repeat(1001))).toEqual({ reply: APP_REQUEST_TEXT.answerTooLong, done: false })
    expect(await intake.answerFromChat('TC', REQUEST_ID, 'cho cả xã')).toEqual({ reply: APP_REQUEST_TEXT.answerReceived, done: true })
    ;(r.setAnswer as jest.Mock).mockResolvedValueOnce(false)
    expect(await intake.answerFromChat('TC', REQUEST_ID, 'lại')).toEqual({ reply: APP_REQUEST_TEXT.answerClosed, done: true })
  })
})

describe('AppBuildNotifier', () => {
  const link = { chatId: '900', telegramUserId: '9001' } as TelegramLink
  const request = { id: REQUEST_ID, htxCode: 'TC', requestedBy: 'u1', requestText: 'cần app kho phân bón', spec: { name_vi: 'Kho phân bón' }, appId: 'gen-kho', status: 'passed', errorVi: null } as unknown as AppBuildRequest

  it('sends one message with the questions and opens a 24 h answer conversation', async () => {
    const repo = { activeUserLinkByUser: jest.fn(async () => link), enqueue: jest.fn(async () => undefined), setAppAnswer: jest.fn(async () => undefined) }
    await new AppBuildNotifier(repo).questionsAsked(request, ['Ai dùng?', 'Ghi gì?'], NOW)
    expect(repo.setAppAnswer).toHaveBeenCalledWith({ telegramUserId: '9001', requestId: REQUEST_ID, expiresAt: new Date(NOW.getTime() + 24 * 3600_000) })
    const [[rows]] = repo.enqueue.mock.calls as unknown as [[{ text: string; chatId: string }[]]]
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toContain('1. Ai dùng?')
    expect(rows[0].text).toContain('2. Ghi gì?')
  })

  it('sends the built message with the four screenshots, or the failure text without photos', async () => {
    const repo = { activeUserLinkByUser: jest.fn(async () => link), enqueue: jest.fn(async () => undefined), setAppAnswer: jest.fn() }
    const notifier = new AppBuildNotifier(repo)
    await notifier.finished(request, { id: 'b1' } as never)
    await notifier.finished({ ...request, status: 'failed', errorVi: 'Trượt cổng tests' } as AppBuildRequest, null)
    const calls = repo.enqueue.mock.calls as unknown as [{ text: string; photos: { build_id: string; name: string }[] | null }[]][]
    expect(calls[0][0][0].text).toBe('App "Kho phân bón" đã xây xong, qua 7 cổng kiểm tra.')
    expect(calls[0][0][0].photos?.map((p) => p.name)).toEqual(['desktop-light.png', 'desktop-dark.png', 'mobile-light.png', 'mobile-dark.png'])
    expect(calls[1][0][0].text).toBe('Chưa xây được app "Kho phân bón": Trượt cổng tests. Yêu cầu đã đóng.')
    expect(calls[1][0][0].photos).toBeNull()
  })

  it('never throws when Telegram is down, and sends nothing to a user without a link', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    const repo = { activeUserLinkByUser: jest.fn(async () => null), enqueue: jest.fn(), setAppAnswer: jest.fn() }
    await new AppBuildNotifier(repo).questionsAsked(request, ['a'])
    expect(repo.enqueue).not.toHaveBeenCalled()
    await expect(new AppBuildNotifier({ ...repo, activeUserLinkByUser: jest.fn(async () => { throw new Error('db') }) }).finished(request, null)).resolves.toBeUndefined()
    log.mockRestore()
  })
})

describe('the app_answer conversation in the update handler', () => {
  const managerLink = { id: 'l', kind: 'user', userId: 'u-manager', userName: 'QL', role: 'manager', htxCode: 'TC', telegramUserId: '5001', chatId: '5001', linkedAt: NOW } as TelegramLink
  const conversation = (expiresAt = new Date(NOW.getTime() + 3600_000)): TelegramConversation => ({
    telegramUserId: '5001', kind: 'app_answer', proposalId: null, flow: 'app_answer', step: null, state: { request_id: REQUEST_ID }, token: null, cardMessageId: null, expiresAt,
  })

  function build(answer: jest.Mock, open: TelegramConversation | null = conversation()) {
    let current = open
    const submit = jest.fn(async () => APP_REQUEST_TEXT.received)
    const repo = {
      markUpdateSeen: jest.fn(async () => true), forgetUpdate: jest.fn(), countRecentUpdates: jest.fn(async () => 1),
      activeUserLinkByTelegramUser: jest.fn(async () => managerLink),
      activeConversation: jest.fn(async (_tg: string, now: Date) => (current && current.expiresAt > now ? current : null)),
      conversationOf: jest.fn(async () => current),
      deleteConversation: jest.fn(async () => void (current = null)),
      auditEvent: jest.fn(), heartbeatLastSeen: jest.fn(async () => null), enqueue: jest.fn(),
    }
    const handler = new TelegramUpdateHandler({
      repo: repo as never, proposals: { findById: jest.fn() }, notifier: { syncDecision: jest.fn() },
      roles: { read: jest.fn(async () => ({ roles: ['manager'], enabled: true, htxCode: 'TC' })) },
      decide: jest.fn() as never, htxProfileId: async () => 'p', callbackKey: 'k',
      chat: { tools: [], actions: [], photos: {} as never, requests: { submit: jest.fn(async () => false) } as never, householdId: async () => null, proposalMessages: async () => [], appRequests: { submit, answer } },
      campaigns: {} as never, now: () => NOW,
    })
    return { handler, repo, submit }
  }
  let id = 100
  const text = (t: string): TelegramUpdateInput => ({ update_id: ++id, message: { chat: { id: 5001, type: 'private' }, from: { id: 5001 }, text: t } })

  it('stores the next text as the answer and ends the conversation', async () => {
    const answer = jest.fn(async () => ({ reply: 'Đã nhận', done: true }))
    const { handler, repo } = build(answer)
    const res = await handler.handle(text('Cho cả xã dùng, ghi nhập xuất'))
    expect(answer).toHaveBeenCalledWith('TC', REQUEST_ID, 'Cho cả xã dùng, ghi nhập xuất')
    expect(res.replies[0]).toMatchObject({ text: 'Đã nhận' })
    expect(repo.deleteConversation).toHaveBeenCalled()
  })

  it('keeps the conversation while the answer is too long', async () => {
    const answer = jest.fn(async () => ({ reply: APP_REQUEST_TEXT.answerTooLong, done: false }))
    const { handler, repo } = build(answer)
    await handler.handle(text('dài'))
    expect(repo.deleteConversation).not.toHaveBeenCalled()
  })

  it('does not take a command as the answer, and an expired conversation takes nothing', async () => {
    const answer = jest.fn()
    await build(answer).handler.handle(text('/menu'))
    await build(answer, conversation(new Date(NOW.getTime() - 1))).handler.handle(text('trả lời muộn'))
    expect(answer).not.toHaveBeenCalled()
  })

  it('creates a request when a manager with no open conversation asks for an app', async () => {
    const { handler, submit } = build(jest.fn(), null)
    const res = await handler.handle(text('cần app theo dõi kho phân bón'))
    expect(submit).toHaveBeenCalled()
    expect(res.replies[0].text).toBe(APP_REQUEST_TEXT.received)
  })

  it('says the feature is not open, and creates nothing, when labs is off', async () => {
    delete process.env.DXOS_LABS
    const { handler, submit } = build(jest.fn(), null)
    const res = await handler.handle(text('cần app theo dõi kho phân bón'))
    expect(submit).not.toHaveBeenCalled()
    expect(res.replies[0].text).toBe('Tính năng này chưa mở.')
  })
})
