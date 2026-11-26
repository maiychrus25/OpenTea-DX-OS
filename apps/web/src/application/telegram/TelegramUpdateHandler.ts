// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getAction } from '@/application/agent/action-catalog'
import { OPEN_CAMPAIGN_STATUSES, type ApproveCampaignResult } from '@/application/agent/campaign/ApproveCampaignUseCase'
import { CampaignClosedError } from '@/application/agent/campaign/campaign-errors'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import type { DecideProposalInput, DecideProposalOutcome } from '@/application/agent/DecideProposalUseCase'
import type { Campaign, CampaignItem } from '@/domain/agent/campaign'
import type { CampaignRepository } from '@/domain/agent/ports/CampaignRepository'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { DomainError } from '@/domain/errors'
import { verifyCallbackData, verifyCallbackDataV2 } from '@/domain/telegram/callback-data'
import { hashLinkCode, LINK_CODE_TTL_MS } from '@/domain/telegram/link-code'
import type { LiveRoleReader, LiveUserState } from '@/domain/telegram/ports/LiveRoleReader'
import type { AssistantRequestRepository } from '@/domain/telegram/ports/AssistantRequestRepository'
import type { TelegramLink, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import type { Tenant } from '@/lib/api/tenant'
import { AssistantRequests } from './assistant/AssistantRequests'
import { ChatEngine, PHOTO_MAX_BYTES, type IncomingPhoto, type ProposalMessage } from './chat/ChatEngine'
import { ChatUserResolver } from './chat/ChatUserResolver'
import { commandOf } from './chat/router'
import type { ChatAction, ChatTool, PhotoStore } from './chat/types'
import { TELEGRAM_TEXT } from './messages'

export interface TelegramMessageInput {
  message_id?: number
  chat: { id: number; type: string }
  from?: { id: number }
  text?: string
  /** Text of a photo; not used for routing (a photo goes to the open photo step or is refused). */
  caption?: string
  /** Set when the photo was downloaded: the largest size at most 5 MB, as base64 JPEG bytes (contract C1). */
  photo?: { mime_type: 'image/jpeg'; data_base64: string; file_unique_id: string }
  photo_error?: 'too_large' | 'download_failed'
  location?: { latitude: number; longitude: number }
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

export type ReplyButtons = { text: string; callback_data: string }[][]

/** A reply the relay sends (contract C2). An edit always sends its keyboard, so an edit without buttons removes them. */
export type OutboxReply =
  | { op: 'send'; chat_id: number; text: string; buttons?: ReplyButtons }
  | { op: 'edit'; chat_id: number; edit_message_id: number; text: string; buttons?: ReplyButtons }

export interface UpdateResponse {
  replies: OutboxReply[]
  answer_callback?: { text: string; show_alert: boolean }
}

/** The chat assistant's inputs from the composition root: the tool and action registries, photos and requests. */
export interface ChatServices {
  tools: readonly ChatTool[]
  actions: readonly ChatAction[]
  photos: PhotoStore
  requests: AssistantRequestRepository
  householdId(userId: string): Promise<string | null>
  proposalMessages(htxCode: string, proposalIds: string[]): Promise<ProposalMessage[]>
}

/** The daily campaign's reads, its approve-all and drop, and its message for `/chiendich` (M7, contract C6). */
export interface CampaignServices {
  repo: Pick<CampaignRepository, 'findById' | 'findForDay' | 'items'>
  approve: { execute(campaignId: string, tenant: Tenant, userName: string, channel: 'telegram', now?: Date): Promise<ApproveCampaignResult> }
  drop: { execute(campaignId: string, tenant: Tenant, userName: string): Promise<void> }
  message(htxCode: string, campaignId: string): Promise<{ text: string; buttons?: ReplyButtons } | null>
}

export interface TelegramUpdateHandlerDeps {
  repo: TelegramRepository
  proposals: Pick<ProposalRepository, 'findById'>
  roles: LiveRoleReader
  notifier: { syncDecision(htxCode: string, proposalId: string): Promise<void> }
  decide: (input: DecideProposalInput) => Promise<DecideProposalOutcome>
  htxProfileId: (htxCode: string) => Promise<string | null>
  callbackKey: string
  chat: ChatServices
  campaigns: CampaignServices
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
/** Button presses and private messages per Telegram user in the rolling hour (contract C9). */
const RATE_LIMIT_PER_HOUR = 60
const HOUR_MS = 60 * 60 * 1000

const reply = (chatId: number, text: string): OutboxReply => ({ op: 'send', chat_id: chatId, text })
const answer = (text: string, showAlert = false): UpdateResponse => ({
  replies: [],
  answer_callback: { text, show_alert: showAlert },
})

function incomingPhoto(message: TelegramMessageInput): IncomingPhoto {
  if (message.photo_error) return { kind: 'error', reason: message.photo_error }
  const bytes = Buffer.from(message.photo!.data_base64, 'base64')
  if (bytes.length > PHOTO_MAX_BYTES) return { kind: 'error', reason: 'too_large' }
  return { kind: 'image', bytes, mimeType: 'image/jpeg' }
}

/**
 * Every Telegram update, decided in the web. Keeps the identity rules of the spec: a link is only ever
 * trusted for who it names, while the role, cooperative and enabled flag are read live at tap time.
 */
export class TelegramUpdateHandler {
  private readonly now: () => Date
  private readonly users: ChatUserResolver
  private readonly chat: ChatEngine

  constructor(private readonly deps: TelegramUpdateHandlerDeps) {
    this.now = deps.now ?? (() => new Date())
    this.users = new ChatUserResolver({
      roles: deps.roles,
      htxProfileId: deps.htxProfileId,
      householdId: deps.chat.householdId,
    })
    this.chat = new ChatEngine({
      repo: deps.repo,
      tools: deps.chat.tools,
      actions: deps.chat.actions,
      photos: deps.chat.photos,
      requests: new AssistantRequests(deps.chat.requests, deps.repo),
      callbackKey: deps.callbackKey,
      proposalMessages: deps.chat.proposalMessages,
    })
  }

  /** Idempotent per update_id: a repeated update returns nothing, the outbox already holds its messages. */
  async handle(update: TelegramUpdateInput): Promise<UpdateResponse> {
    const updateId = String(update.update_id)
    const fromId = update.message?.from?.id ?? update.callback_query?.from.id
    const telegramUserId = fromId === undefined ? null : String(fromId)
    if (!(await this.deps.repo.markUpdateSeen(updateId, telegramUserId))) return EMPTY
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

    if (message.chat.type === 'private') return this.handlePrivate(message, text, argument, fromId, chatId)
    if ((message.chat.type === 'group' || message.chat.type === 'supergroup') && /^\/nhom(\s|$)/.test(text)) {
      return this.linkGroup(argument, chatId)
    }
    return EMPTY
  }

  private async handlePrivate(
    message: TelegramMessageInput,
    text: string,
    argument: string,
    fromId: string,
    chatId: number
  ): Promise<UpdateResponse> {
    const command = commandOf(text)
    if (command === '/start') {
      if (!argument) {
        const link = await this.deps.repo.activeUserLinkByTelegramUser(fromId)
        if (link) return this.menuFor(link, chatId)
      }
      return this.linkUser(argument, fromId, chatId)
    }
    if (command === '/stop') return this.unlinkUser(fromId, chatId)

    const link = await this.deps.repo.activeUserLinkByTelegramUser(fromId)
    if (!link) {
      // Users who are not linked keep the M2 replies.
      if (command === '/huy') return this.cancelRejectReason(fromId, chatId)
      return this.receiveRejectReason(fromId, chatId, text)
    }

    const limit = await this.rateLimitState(fromId)
    if (limit !== 'ok') return limit === 'notice' ? { replies: [reply(chatId, TELEGRAM_TEXT.rateLimited)] } : EMPTY
    if (command === '/huy') return this.cancelOpen(fromId, chatId)
    if (command === '/chiendich') return this.todaysCampaign(link, chatId)

    const open = await this.deps.repo.activeConversation(fromId, this.now())
    if (open?.kind === 'reject_reason') return this.receiveRejectReason(fromId, chatId, text)

    const user = await this.users.resolve(link)
    if (!user) return { replies: [reply(chatId, TELEGRAM_TEXT.notLinked)] }
    if (message.photo || message.photo_error) return this.chat.onPhoto(user, incomingPhoto(message), this.now())
    if (message.location) {
      return this.chat.onLocation(user, message.location.latitude, message.location.longitude, this.now())
    }
    if (!text) return EMPTY
    return this.chat.onText(user, text, this.now())
  }

  private async menuFor(link: TelegramLink, chatId: number): Promise<UpdateResponse> {
    const user = await this.users.resolve(link)
    if (!user) return { replies: [reply(chatId, TELEGRAM_TEXT.notLinked)] }
    return this.chat.menu(user)
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

  /** `/huy` for a linked user: cancels a reject reason or a chat flow, whichever is open. */
  private async cancelOpen(telegramUserId: string, chatId: number): Promise<UpdateResponse> {
    const open = await this.deps.repo.activeConversation(telegramUserId, this.now())
    if (!open) return { replies: [reply(chatId, TELEGRAM_TEXT.nothingToCancel)] }
    await this.deps.repo.deleteConversation(telegramUserId)
    const text = open.kind === 'reject_reason' ? TELEGRAM_TEXT.rejectCancelled : TELEGRAM_TEXT.flowCancelled
    return { replies: [reply(chatId, text)] }
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

  /** Counts this user's updates in the last hour (the current one included): the 61st is told once, later ones get nothing. */
  private async rateLimitState(telegramUserId: string): Promise<'ok' | 'notice' | 'silent'> {
    const count = await this.deps.repo.countRecentUpdates(telegramUserId, new Date(this.now().getTime() - HOUR_MS))
    if (count <= RATE_LIMIT_PER_HOUR) return 'ok'
    return count === RATE_LIMIT_PER_HOUR + 1 ? 'notice' : 'silent'
  }

  private async handleCallback(callback: TelegramCallbackInput): Promise<UpdateResponse> {
    const key = this.deps.callbackKey
    const v1 = verifyCallbackData(key, callback.data)
    const v2 = v1 ? null : verifyCallbackDataV2(key, callback.data)
    if (!v1 && !v2) return answer(TELEGRAM_TEXT.invalidButton, true)
    // Buttons only act in a private chat: a button in a group could be pressed by anyone there.
    if (callback.message.chat.type !== 'private') return answer(TELEGRAM_TEXT.groupCallback, true)

    const telegramUserId = String(callback.from.id)
    const link = await this.deps.repo.activeUserLinkByTelegramUser(telegramUserId)
    if (!link) return answer(TELEGRAM_TEXT.notLinked, true)

    const limit = await this.rateLimitState(telegramUserId)
    if (limit === 'notice') return answer(TELEGRAM_TEXT.rateLimited, true)
    if (limit === 'silent') return EMPTY

    if (v2) {
      const user = await this.users.resolve(link)
      return this.chat.onCallback(
        user,
        {
          telegramUserId,
          c: v2.c,
          s: v2.s,
          chatId: callback.message.chat.id,
          messageId: callback.message.message_id ?? 0,
        },
        this.now()
      )
    }

    const parsed = v1!
    if (parsed.op === 'A' || parsed.op === 'L' || parsed.op === 'D') {
      return this.campaignPress(link, parsed.op, parsed.proposalId, callback.message.chat.id, callback.message.message_id ?? 0)
    }
    if (parsed.op === 'r') {
      const access = await this.approverAccess(link, parsed.proposalId)
      if ('refusal' in access) return answer(access.refusal, true)
      if (access.proposal.status !== 'proposed') {
        return answer(TELEGRAM_TEXT.alreadyDecided(access.proposal.decidedByName))
      }
      await this.deps.repo.setConversation({
        telegramUserId,
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

  /** `/chiendich`: today's campaign for a manager or officer; everyone else, or no campaign, gets the plain line. */
  private async todaysCampaign(link: TelegramLink, chatId: number): Promise<UpdateResponse> {
    const none: UpdateResponse = { replies: [reply(chatId, TELEGRAM_TEXT.noCampaignToday)] }
    const user = await this.users.resolve(link)
    if (!user || (user.tenant.role !== 'manager' && user.tenant.role !== 'officer')) return none
    const campaign = await this.deps.campaigns.repo.findForDay(link.htxCode, vnDayOf(this.now()))
    if (!campaign || campaign.status === 'dropped') return none
    const message = await this.deps.campaigns.message(link.htxCode, campaign.id)
    if (!message) return none
    return { replies: [{ op: 'send', chat_id: chatId, text: message.text, buttons: message.buttons }] }
  }

  /** Approve all (A), list the open items (L) and drop (D) from a campaign message (contract C6). */
  private async campaignPress(
    link: TelegramLink,
    op: 'A' | 'L' | 'D',
    campaignId: string,
    chatId: number,
    messageId: number
  ): Promise<UpdateResponse> {
    const access = await this.campaignAccess(link, campaignId)
    if ('refusal' in access) return answer(access.refusal, true)
    if (!OPEN_CAMPAIGN_STATUSES.includes(access.campaign.status)) return answer(TELEGRAM_TEXT.campaignDone)

    const { tenant } = access
    const userName = link.userName ?? link.userId ?? ''
    try {
      if (op === 'L') return await this.listOpenItems(link.htxCode, campaignId, chatId)
      if (op === 'D') {
        await this.deps.campaigns.drop.execute(campaignId, tenant, userName)
        return this.editCampaignMessage(chatId, messageId, TELEGRAM_TEXT.campaignDropped)
      }
      const result = await this.deps.campaigns.approve.execute(campaignId, tenant, userName, 'telegram', this.now())
      return this.editCampaignMessage(chatId, messageId, TELEGRAM_TEXT.campaignApproved(result))
    } catch (err) {
      if (err instanceof CampaignClosedError) return answer(TELEGRAM_TEXT.campaignDone)
      if (err instanceof DomainError) return answer(err.message, true)
      throw err
    }
  }

  /** The campaign and the approver's live tenant; only a manager or officer who is still enabled in the cooperative passes. */
  private async campaignAccess(link: TelegramLink, campaignId: string): Promise<{ campaign: Campaign; tenant: Tenant } | Refusal> {
    const campaign = await this.deps.campaigns.repo.findById(link.htxCode, campaignId)
    if (!campaign) return { refusal: TELEGRAM_TEXT.campaignNotFound }

    let live: LiveUserState | null
    try {
      live = await this.deps.roles.read(link.userId!)
    } catch {
      return { refusal: TELEGRAM_TEXT.roleCheckUnavailable }
    }
    const role = live?.enabled && live.htxCode === link.htxCode
      ? (['manager', 'officer'] as const).find((r) => live!.roles.includes(r))
      : undefined
    if (!role) return { refusal: TELEGRAM_TEXT.campaignNotAllowed }

    const htxProfileId = await this.deps.htxProfileId(link.htxCode)
    if (!htxProfileId) return { refusal: TELEGRAM_TEXT.campaignNotAllowed }
    return { campaign, tenant: { userId: link.userId!, role, htxCode: link.htxCode, htxProfileId } }
  }

  private async listOpenItems(htxCode: string, campaignId: string, chatId: number): Promise<UpdateResponse> {
    const open = (await this.deps.campaigns.repo.items(htxCode, campaignId))
      .filter((item: CampaignItem) => item.proposalStatus === 'proposed')
      .map((item) => item.proposalId)
    if (open.length === 0) return answer(TELEGRAM_TEXT.campaignNoOpenItems)
    const messages = await this.deps.chat.proposalMessages(htxCode, open)
    return {
      replies: messages.map((m) => ({ op: 'send' as const, chat_id: chatId, text: m.text, buttons: m.buttons })),
      answer_callback: { text: TELEGRAM_TEXT.campaignListed, show_alert: false },
    }
  }

  private editCampaignMessage(chatId: number, messageId: number, text: string): UpdateResponse {
    return {
      replies: [{ op: 'edit', chat_id: chatId, edit_message_id: messageId, text }],
      answer_callback: { text, show_alert: false },
    }
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
