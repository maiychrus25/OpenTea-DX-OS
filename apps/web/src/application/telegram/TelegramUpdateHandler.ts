// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getAction } from '@/application/agent/action-catalog'
import type { DecideProposalInput, DecideProposalOutcome } from '@/application/agent/DecideProposalUseCase'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { DomainError } from '@/domain/errors'
import { verifyCallbackData } from '@/domain/telegram/callback-data'
import { hashLinkCode, LINK_CODE_TTL_MS } from '@/domain/telegram/link-code'
import type { LiveRoleReader, LiveUserState } from '@/domain/telegram/ports/LiveRoleReader'
import type { TelegramLink, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import type { Tenant } from '@/lib/api/tenant'
import { TELEGRAM_TEXT } from './messages'

export interface TelegramMessageInput {
  message_id?: number
  chat: { id: number; type: string }
  from?: { id: number }
  text?: string
}

export interface TelegramCallbackInput {
  id: string
  from: { id: number }
  message: { message_id?: number; chat: { id: number; type: string } }
  data: string
}

export interface TelegramUpdateInput {
  update_id: number
  message?: TelegramMessageInput
  callback_query?: TelegramCallbackInput
}

export interface OutboxReply {
  op: 'send'
  chat_id: number
  text: string
}

export interface UpdateResponse {
  replies: OutboxReply[]
  answer_callback?: { text: string; show_alert: boolean }
}

export interface TelegramUpdateHandlerDeps {
  repo: TelegramRepository
  proposals: Pick<ProposalRepository, 'findById'>
  roles: LiveRoleReader
  notifier: { syncDecision(htxCode: string, proposalId: string): Promise<void> }
  decide: (input: DecideProposalInput) => Promise<DecideProposalOutcome>
  htxProfileId: (htxCode: string) => Promise<string | null>
  callbackKey: string
  now?: () => Date
}

interface Refusal {
  refusal: string
}

interface Approver {
  proposal: Proposal
  tenant: Tenant
}

interface DecisionResult {
  text: string
  showAlert: boolean
}

const EMPTY: UpdateResponse = { replies: [] }
const REJECT_REASON_MAX = 500
const TRANSITIONS = new Set(['executed', 'failed', 'rejected', 'stale', 'expired'])

const reply = (chatId: number, text: string): OutboxReply => ({ op: 'send', chat_id: chatId, text })
const answer = (text: string, showAlert = false): UpdateResponse => ({
  replies: [],
  answer_callback: { text, show_alert: showAlert },
})

/**
 * Every Telegram update, decided in the web. Keeps the identity rules of the spec: a link is only ever
 * trusted for who it names, while the role, cooperative and enabled flag are read live at tap time.
 */
export class TelegramUpdateHandler {
  private readonly now: () => Date

  constructor(private readonly deps: TelegramUpdateHandlerDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** Idempotent per update_id: a repeated update returns nothing, the outbox already holds its messages. */
  async handle(update: TelegramUpdateInput): Promise<UpdateResponse> {
    const updateId = String(update.update_id)
    const fromId = update.message?.from?.id ?? update.callback_query?.from.id
    if (!(await this.deps.repo.markUpdateSeen(updateId, fromId === undefined ? null : String(fromId)))) return EMPTY
    try {
      if (update.callback_query) return await this.handleCallback(update.callback_query)
      if (update.message) return await this.handleMessage(update.message)
      return EMPTY
    } catch (err) {
      // Let the relay's retry process the update again instead of silently dropping it.
      await this.deps.repo.forgetUpdate(updateId)
      throw err
    }
  }

  private async handleMessage(message: TelegramMessageInput): Promise<UpdateResponse> {
    // Channel posts have no sender; nothing in them is for the bot to act on.
    if (!message.from) return EMPTY
    const text = (message.text ?? '').trim()
    const chatId = message.chat.id
    const fromId = String(message.from.id)
    const argument = text.split(/\s+/)[1] ?? ''

    if (message.chat.type === 'private') {
      if (/^\/start(\s|$)/.test(text)) return this.linkUser(argument, fromId, chatId)
      if (/^\/stop(\s|$)/.test(text)) return this.unlinkUser(fromId, chatId)
      if (/^\/huy(\s|$)/.test(text)) return this.cancelRejectReason(fromId, chatId)
      return this.receiveRejectReason(fromId, chatId, text)
    }
    if ((message.chat.type === 'group' || message.chat.type === 'supergroup') && /^\/nhom(\s|$)/.test(text)) {
      return this.linkGroup(argument, chatId)
    }
    return EMPTY
  }

  private async linkUser(code: string, telegramUserId: string, chatId: number): Promise<UpdateResponse> {
    if (!code) return { replies: [reply(chatId, TELEGRAM_TEXT.openFromProfile)] }
    const record = await this.deps.repo.consumeLinkCode(hashLinkCode(code), this.now())
    if (!record || record.kind !== 'user') return { replies: [reply(chatId, TELEGRAM_TEXT.invalidCode)] }

    await this.deps.repo.replaceUserLink({
      userId: record.userId,
      userName: record.userName,
      role: record.role,
      htxCode: record.htxCode,
      telegramUserId,
      chatId: String(chatId),
    })
    return { replies: [reply(chatId, TELEGRAM_TEXT.welcome(record.userName ?? 'của bạn'))] }
  }

  private async unlinkUser(telegramUserId: string, chatId: number): Promise<UpdateResponse> {
    await this.deps.repo.deleteConversation(telegramUserId)
    const removed = await this.deps.repo.unlinkUser({ telegramUserId })
    return { replies: [reply(chatId, removed ? TELEGRAM_TEXT.unlinked : TELEGRAM_TEXT.notLinked)] }
  }

  private async linkGroup(code: string, chatId: number): Promise<UpdateResponse> {
    const record = code ? await this.deps.repo.consumeLinkCode(hashLinkCode(code), this.now()) : null
    if (!record || record.kind !== 'group') return { replies: [reply(chatId, TELEGRAM_TEXT.invalidCode)] }
    await this.deps.repo.replaceGroupLink({ htxCode: record.htxCode, chatId: String(chatId) })
    return { replies: [reply(chatId, TELEGRAM_TEXT.groupLinked)] }
  }

  private async cancelRejectReason(telegramUserId: string, chatId: number): Promise<UpdateResponse> {
    const open = await this.deps.repo.activeConversation(telegramUserId, this.now())
    if (open?.kind !== 'reject_reason') return EMPTY
    await this.deps.repo.deleteConversation(telegramUserId)
    return { replies: [reply(chatId, TELEGRAM_TEXT.rejectCancelled)] }
  }

  private async receiveRejectReason(telegramUserId: string, chatId: number, text: string): Promise<UpdateResponse> {
    const open = await this.deps.repo.activeConversation(telegramUserId, this.now())
    if (open?.kind !== 'reject_reason' || !open.proposalId) return EMPTY
    if (!text || text.length > REJECT_REASON_MAX) return { replies: [reply(chatId, TELEGRAM_TEXT.rejectNoReason)] }

    const link = await this.deps.repo.activeUserLinkByTelegramUser(telegramUserId)
    await this.deps.repo.deleteConversation(telegramUserId)
    if (!link) return { replies: [reply(chatId, TELEGRAM_TEXT.notLinked)] }

    const result = await this.decideAs(link, open.proposalId, 'reject', text)
    return { replies: [reply(chatId, result.text)] }
  }

  private async handleCallback(callback: TelegramCallbackInput): Promise<UpdateResponse> {
    const parsed = verifyCallbackData(this.deps.callbackKey, callback.data)
    if (!parsed) return answer(TELEGRAM_TEXT.invalidButton, true)
    // Buttons only act in a private chat: a button in a group could be pressed by anyone there.
    if (callback.message.chat.type !== 'private') return answer(TELEGRAM_TEXT.groupCallback, true)

    const link = await this.deps.repo.activeUserLinkByTelegramUser(String(callback.from.id))
    if (!link) return answer(TELEGRAM_TEXT.notLinked, true)

    if (parsed.op === 'r') {
      const access = await this.approverAccess(link, parsed.proposalId)
      if ('refusal' in access) return answer(access.refusal, true)
      if (access.proposal.status !== 'proposed') {
        return answer(TELEGRAM_TEXT.alreadyDecided(access.proposal.decidedByName))
      }
      await this.deps.repo.setConversation({
        telegramUserId: String(callback.from.id),
        proposalId: parsed.proposalId,
        expiresAt: new Date(this.now().getTime() + LINK_CODE_TTL_MS),
      })
      return {
        replies: [reply(callback.message.chat.id, TELEGRAM_TEXT.rejectPrompt)],
        answer_callback: { text: TELEGRAM_TEXT.rejectPrompt, show_alert: false },
      }
    }

    const result = await this.decideAs(link, parsed.proposalId, 'approve')
    return answer(result.text, result.showAlert)
  }

  /** Re-checks the approver now (role, enabled flag, cooperative), then runs the same decision as the inbox. */
  private async approverAccess(link: TelegramLink, proposalId: string): Promise<Approver | Refusal> {
    const proposal = await this.deps.proposals.findById(link.htxCode, proposalId)
    if (!proposal) return { refusal: TELEGRAM_TEXT.otherCooperative }

    let live: LiveUserState | null
    try {
      live = await this.deps.roles.read(link.userId!)
    } catch {
      return { refusal: TELEGRAM_TEXT.roleCheckUnavailable }
    }
    const definition = getAction(proposal.kind)
    const role = definition && live?.enabled && live.htxCode === link.htxCode
      ? definition.approverRoles.find((r) => live!.roles.includes(r))
      : undefined
    if (!role) return { refusal: TELEGRAM_TEXT.noLongerApprover }

    const htxProfileId = await this.deps.htxProfileId(link.htxCode)
    if (!htxProfileId) return { refusal: TELEGRAM_TEXT.noLongerApprover }

    return {
      proposal,
      tenant: { userId: link.userId!, role, htxCode: link.htxCode, htxProfileId },
    }
  }

  private async decideAs(
    link: TelegramLink,
    proposalId: string,
    decision: 'approve' | 'reject',
    note?: string
  ): Promise<DecisionResult> {
    const access = await this.approverAccess(link, proposalId)
    if ('refusal' in access) return { text: access.refusal, showAlert: true }

    let outcome: DecideProposalOutcome
    try {
      outcome = await this.deps.decide({
        proposalId,
        tenant: access.tenant,
        userName: link.userName ?? link.userId ?? '',
        decision,
        note,
        channel: 'telegram',
        now: this.now(),
      })
    } catch (err) {
      if (err instanceof DomainError) return { text: err.message, showAlert: true }
      throw err
    }

    if (outcome.outcome === 'already_decided') {
      return { text: TELEGRAM_TEXT.alreadyDecided(outcome.by), showAlert: false }
    }
    if (TRANSITIONS.has(outcome.outcome)) {
      await this.deps.notifier.syncDecision(link.htxCode, proposalId)
    }
    switch (outcome.outcome) {
      case 'executed':
        return { text: TELEGRAM_TEXT.executed, showAlert: false }
      case 'failed':
        return { text: TELEGRAM_TEXT.failedExecution, showAlert: true }
      case 'rejected':
        return { text: TELEGRAM_TEXT.rejected, showAlert: false }
      case 'stale':
        return { text: TELEGRAM_TEXT.stale, showAlert: true }
      case 'expired':
        return { text: TELEGRAM_TEXT.expired, showAlert: true }
      default:
        return { text: TELEGRAM_TEXT.approved, showAlert: false }
    }
  }
}
